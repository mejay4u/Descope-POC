/**
 * memberApi — client for the MemberPortal .NET API.
 *
 * Registration data and the member's password live in the **MemberPortal
 * database**, not in Descope. Descope's only job during registration is to
 * prove the member owns the email address: it emails the OTP, verifies it, and
 * keeps the email as the login ID. Everything else the member typed (name,
 * date of birth, zip, phone) and the password they choose are sent here.
 *
 * Like `descopeService.ts`, this module knows nothing about React — plain
 * async functions returning `{ ok: true, data } | { ok: false, error }`, where
 * `error` is already a user-facing message.
 *
 * Every call is authenticated with the Descope **session JWT** issued by the
 * OTP verification step. That token is the proof the email was verified, so
 * the API should validate it (standard Descope JWT validation) and check that
 * its subject/email matches the record being written, rather than trusting any
 * field in the request body.
 *
 * See the README's "MemberPortal API contract" section for the request and
 * response shapes each endpoint is expected to implement.
 */
import { MEMBER_API_BASE_URL, isMemberApiConfigured } from '../config';

/** Endpoint paths, relative to MEMBER_API_BASE_URL. */
const PATHS = {
  registrations: '/api/registrations',
  registrationPassword: (memberId: string) =>
    `/api/registrations/${encodeURIComponent(memberId)}/password`,
  passwordPolicy: '/api/registrations/password-policy',
};

/** Give up on a request after this long, so the wizard can't hang on a spinner. */
const TIMEOUT_MS = 15000;

const NOT_CONFIGURED =
  'The Member Portal service is not configured. Set MEMBER_API_BASE_URL in src/config/index.ts.';
const UNREACHABLE =
  'Could not reach the Member Portal service. Check your connection and try again.';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };
export type ApiVoidResult = { ok: true } | { ok: false; error: string };

/** The registration details captured by the wizard, as stored in our own DB. */
export type MemberRegistration = {
  firstName: string;
  lastName: string;
  /** As typed in the form: MM/DD/YYYY. Sent as ISO `YYYY-MM-DD`. */
  dob: string;
  zip: string;
  email: string;
  phone?: string;
};

/** What the API returns once the pending member record exists. */
export type CreatedRegistration = {
  /** Server-generated ID for the member record — needed to set the password. */
  memberId: string;
  /** e.g. "Pending" until the password is set. Informational only. */
  status?: string;
};

/**
 * Password rules the API enforces server-side, used to render the checklist on
 * the "Set a password" step. Previously read from Descope's password policy;
 * now that passwords are stored in our own database, the API owns these rules.
 */
export type PasswordPolicy = {
  minLength: number;
  lowercase: boolean;
  uppercase: boolean;
  number: boolean;
  nonAlphanumeric: boolean;
};

/**
 * Used when the live policy can't be fetched (API not configured yet, offline,
 * endpoint not implemented). Keeps the checklist usable rather than blank.
 */
export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 8,
  lowercase: true,
  uppercase: true,
  number: true,
  nonAlphanumeric: true,
};

/** `MM/DD/YYYY` (what the form collects) -> `YYYY-MM-DD` (what .NET binds cleanly). */
export function toIsoDate(dob: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dob.trim());
  if (!match) {
    return dob.trim();
  }
  const [, month, day, year] = match;
  return `${year}-${month}-${day}`;
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path}`;
}

/**
 * Pulls a message out of an error response. Handles ASP.NET Core's
 * ProblemDetails (`title` / `detail`), its validation shape (`errors`), and a
 * plain `{ message }`, falling back to the status code.
 */
function errorFrom(status: number, body: unknown): string {
  const payload = body as
    | {
        message?: string;
        detail?: string;
        title?: string;
        error?: string;
        errors?: Record<string, string[] | string>;
      }
    | undefined;

  const firstValidation = payload?.errors
    ? Object.values(payload.errors).flat().find(Boolean)
    : undefined;

  return (
    payload?.message ||
    payload?.detail ||
    firstValidation ||
    payload?.title ||
    payload?.error ||
    `The Member Portal service returned an error (${status}).`
  );
}

async function request<T>(
  path: string,
  init: { method: string; sessionJwt: string; body?: unknown },
): Promise<ApiResult<T>> {
  if (!isMemberApiConfigured()) {
    return { ok: false, error: NOT_CONFIGURED };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(joinUrl(MEMBER_API_BASE_URL, path), {
      method: init.method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // The OTP-verify session JWT — our proof to the API that this email
        // was verified by Descope moments ago.
        Authorization: `Bearer ${init.sessionJwt}`,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });

    // 204 (and any empty body) is a success with nothing to parse.
    const text = await response.text();
    const payload = text ? safeParse(text) : undefined;

    if (!response.ok) {
      return { ok: false, error: errorFrom(response.status, payload) };
    }
    return { ok: true, data: (payload ?? {}) as T };
  } catch (e) {
    const err = e as { name?: string } | undefined;
    if (err?.name === 'AbortError') {
      return { ok: false, error: 'The Member Portal service took too long to respond.' };
    }
    return { ok: false, error: UNREACHABLE };
  } finally {
    clearTimeout(timer);
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // A non-JSON body (an HTML error page from a proxy, say) carries nothing
    // worth showing the member — let errorFrom fall back to the status code.
    return undefined;
  }
}

/**
 * Step 3 of the wizard: stores the reviewed registration details in the
 * MemberPortal DB and returns the new member record's ID. Called only after
 * the email has been verified — `sessionJwt` is the token from that
 * verification.
 *
 * The email is the natural key: if the member abandoned an earlier attempt and
 * comes back, this should return the existing pending record rather than
 * failing, so a retry can pick up where it left off.
 */
export async function createRegistration(
  details: MemberRegistration,
  sessionJwt: string,
): Promise<ApiResult<CreatedRegistration>> {
  const result = await request<CreatedRegistration>(PATHS.registrations, {
    method: 'POST',
    sessionJwt,
    body: {
      firstName: details.firstName,
      lastName: details.lastName,
      dateOfBirth: toIsoDate(details.dob),
      zipCode: details.zip,
      email: details.email,
      phone: details.phone || null,
    },
  });

  if (!result.ok) {
    return result;
  }
  if (!result.data?.memberId) {
    return {
      ok: false,
      error: 'The Member Portal service did not return a member ID.',
    };
  }
  return result;
}

/**
 * Step 4: sets (or replaces) the member's password in the MemberPortal DB.
 * The API is responsible for hashing it — the password is never sent to
 * Descope, which is why sign-in has to validate against this database.
 */
export async function setRegistrationPassword(
  memberId: string,
  password: string,
  sessionJwt: string,
): Promise<ApiVoidResult> {
  const result = await request<unknown>(PATHS.registrationPassword(memberId), {
    method: 'POST',
    sessionJwt,
    body: { password },
  });
  return result.ok ? { ok: true } : result;
}

/**
 * The live password policy the API enforces. Unauthenticated (it's just the
 * rules), and never fails the caller — an unreachable or unimplemented
 * endpoint falls back to DEFAULT_PASSWORD_POLICY so the checklist still
 * renders.
 */
export async function fetchPasswordPolicy(): Promise<PasswordPolicy> {
  if (!isMemberApiConfigured()) {
    return DEFAULT_PASSWORD_POLICY;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(joinUrl(MEMBER_API_BASE_URL, PATHS.passwordPolicy), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      return DEFAULT_PASSWORD_POLICY;
    }
    const policy = (await response.json()) as Partial<PasswordPolicy> | null;
    if (!policy || typeof policy.minLength !== 'number') {
      return DEFAULT_PASSWORD_POLICY;
    }
    return {
      minLength: policy.minLength,
      lowercase: policy.lowercase ?? DEFAULT_PASSWORD_POLICY.lowercase,
      uppercase: policy.uppercase ?? DEFAULT_PASSWORD_POLICY.uppercase,
      number: policy.number ?? DEFAULT_PASSWORD_POLICY.number,
      nonAlphanumeric: policy.nonAlphanumeric ?? DEFAULT_PASSWORD_POLICY.nonAlphanumeric,
    };
  } catch {
    return DEFAULT_PASSWORD_POLICY;
  } finally {
    clearTimeout(timer);
  }
}

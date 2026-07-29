/**
 * memberApi — client for the MemberPortal .NET API.
 *
 * The member record and the password live in the MemberPortal database, not in
 * Descope. Descope's only job during registration is proving the member owns
 * the email address: it emails the OTP, verifies it, and keeps the email as the
 * login ID. Everything else the member typed, and the password they choose,
 * comes here.
 *
 * Like `descopeService.ts`, this module knows nothing about React — plain async
 * functions returning `{ ok: true, data } | { ok: false, error }`, where `error`
 * is already a user-facing message.
 *
 * Every call carries the Descope **session JWT** from the OTP verification as a
 * bearer token. That token is the proof the email was verified, so the API
 * validates it (standard Descope JWT validation against the project's JWKS) and
 * takes the email from its claims rather than trusting the request body.
 */
import { MEMBER_API_BASE_URL, isMemberApiConfigured } from '../config';

/** Endpoint paths, relative to MEMBER_API_BASE_URL. */
const PATHS = {
  initiateRegistration: '/api/initiateRegistration',
  createAccount: '/api/registration/password',
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
export type PendingRegistration = {
  /** Server-generated ID for the member record — needed to create the account. */
  userId: string;
  /** e.g. "Pending" until the account is created. Informational only. */
  status?: string;
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

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // A non-JSON body (an HTML error page from a proxy, say) carries nothing
    // worth showing the member — let errorFrom fall back to the status code.
    return undefined;
  }
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

/**
 * Step 3 of the wizard: stores the reviewed registration details and returns
 * the pending member record's ID. Called only after the email has been verified
 * — `sessionJwt` is the token from that verification.
 *
 * The email is the natural key: a member who abandoned an earlier attempt and
 * comes back gets the existing pending record rather than a duplicate error.
 */
export async function initiateRegistration(
  details: MemberRegistration,
  sessionJwt: string,
): Promise<ApiResult<PendingRegistration>> {
  const result = await request<PendingRegistration>(PATHS.initiateRegistration, {
    method: 'POST',
    sessionJwt,
    body: {
      email: details.email,
      firstName: details.firstName,
      lastName: details.lastName,
      dateOfBirth: toIsoDate(details.dob),
      zipCode: details.zip,
      contactNumber: details.phone || null,
    },
  });

  if (!result.ok) {
    return result;
  }
  if (!result.data?.userId) {
    return { ok: false, error: 'The Member Portal service did not return a user ID.' };
  }
  return result;
}

/**
 * Step 4: sets the password and creates the account — this is what the Create
 * Account button does. The API hashes the password and promotes the pending
 * record to a real user. The password is never sent to Descope, which is why
 * sign-in has to be validated against this database.
 */
export async function createAccount(
  userId: string,
  password: string,
  confirmPassword: string,
  sessionJwt: string,
): Promise<ApiVoidResult> {
  const result = await request<unknown>(PATHS.createAccount, {
    method: 'POST',
    sessionJwt,
    body: { userId, password, confirmPassword },
  });
  return result.ok ? { ok: true } : result;
}

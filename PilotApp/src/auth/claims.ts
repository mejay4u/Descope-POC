/**
 * Reading the custom member claims out of the Descope session JWT.
 *
 * The claims are put there by a **JWT Template** configured in the Descope
 * Console (docs/descope-signin-flow-setup.md §4), which projects the member's
 * user custom attributes into every token Descope issues for the project.
 *
 * Why a template and not a flow's Custom Claims action: the template applies on
 * **refresh** too. Biometric sign-in is a refresh (`descope.refresh`), and
 * passkey sign-in runs a different flow entirely — neither re-runs the sign-in
 * flow, so claims added by a flow action would be missing on exactly those two
 * paths. A JWT Template is the only option that covers all of them.
 *
 * This module only *reads* the token. It deliberately does not verify the
 * signature: the app received the token directly from Descope over TLS, and a
 * client verifying a token it was handed proves nothing. Signature verification
 * is the job of whatever service consumes the token — see
 * docs/dotnet-token-notes.md.
 */

/** The custom claims this pilot expects. All optional — an unseeded user has none. */
export type MemberClaims = {
  memberId?: string;
  plan?: string;
  subscriberId?: string;
  /** Lines of business. Descope may hand these back as an array or a CSV string. */
  lobs?: string[];
};

/** Everything decoded from the token, standard claims included. */
export type DecodedToken = {
  claims: MemberClaims;
  /** Descope project ID that issued the token. */
  issuer?: string;
  /** Subject — the Descope user ID. */
  subject?: string;
  /** Expiry as a JS Date, if `exp` was present. */
  expiresAt?: Date;
  /** Every claim in the payload, for the Portal's debug view. */
  raw: Record<string, unknown>;
};

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Decodes base64url to a UTF-8 string.
 *
 * Hand-rolled because React Native provides neither `atob` nor `Buffer`, and a
 * JWT payload isn't worth a dependency. Bytes are turned into a percent-encoded
 * string and handed to `decodeURIComponent`, which does the UTF-8 work — so
 * non-ASCII claim values (accented names, for instance) survive intact.
 */
/* eslint-disable no-bitwise -- shifting and masking is what base64 decoding is. */
function decodeBase64Url(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  let percentEncoded = '';
  let buffer = 0;
  let bitsCollected = 0;

  for (const char of base64) {
    if (char === '=') {
      break;
    }
    const value = BASE64_ALPHABET.indexOf(char);
    if (value === -1) {
      continue; // ignore whitespace/newlines rather than corrupting the output
    }
    buffer = (buffer << 6) | value;
    bitsCollected += 6;
    if (bitsCollected >= 8) {
      bitsCollected -= 8;
      const byte = (buffer >> bitsCollected) & 0xff;
      percentEncoded += '%' + byte.toString(16).padStart(2, '0');
    }
  }

  return decodeURIComponent(percentEncoded);
}
/* eslint-enable no-bitwise */

/** Normalises `lobs`, which may arrive as an array or a comma-separated string. */
function toStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map(part => part.trim())
      .filter(Boolean);
  }
  return undefined;
}

function toStringOrUndefined(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  return String(value);
}

/**
 * Decodes a session JWT. Returns null if the token isn't a readable JWT —
 * callers should treat that as "no claims", not as an error worth showing.
 */
export function decodeSessionToken(sessionJwt?: string): DecodedToken | null {
  if (!sessionJwt) {
    return null;
  }
  const parts = sessionJwt.split('.');
  if (parts.length < 2) {
    return null;
  }
  try {
    const payload = JSON.parse(decodeBase64Url(parts[1])) as Record<string, unknown>;
    return {
      claims: {
        memberId: toStringOrUndefined(payload.memberId),
        plan: toStringOrUndefined(payload.plan),
        subscriberId: toStringOrUndefined(payload.subscriberId),
        lobs: toStringArray(payload.lobs),
      },
      issuer: toStringOrUndefined(payload.iss),
      subject: toStringOrUndefined(payload.sub),
      expiresAt:
        typeof payload.exp === 'number' ? new Date(payload.exp * 1000) : undefined,
      raw: payload,
    };
  } catch {
    return null;
  }
}

/** True when the JWT Template is wired up and actually populated for this user. */
export function hasMemberClaims(claims: MemberClaims | undefined): boolean {
  if (!claims) {
    return false;
  }
  return !!(
    claims.memberId ||
    claims.plan ||
    claims.subscriberId ||
    (claims.lobs && claims.lobs.length > 0)
  );
}

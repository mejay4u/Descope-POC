/**
 * Unit tests for the JWT claim decoding.
 *
 * Worth testing properly: the base64url decoder is hand-rolled (React Native
 * has neither `atob` nor `Buffer`), and getting it subtly wrong would show up
 * as claims silently missing rather than as an error.
 *
 * @format
 */
import { decodeSessionToken, hasMemberClaims } from '../src/auth/claims';

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * base64url-encodes a JSON object, written out longhand rather than reaching
 * for `Buffer` so the test exercises the decoder against a plain
 * spec-conformant encoding rather than against node's implementation.
 */
/* eslint-disable no-bitwise -- shifting and masking is what base64 encoding is. */
function encodeSegment(obj: Record<string, unknown>): string {
  const utf8 = unescape(encodeURIComponent(JSON.stringify(obj)));
  let out = '';
  for (let i = 0; i < utf8.length; i += 3) {
    const b0 = utf8.charCodeAt(i);
    const b1 = utf8.charCodeAt(i + 1);
    const b2 = utf8.charCodeAt(i + 2);
    out += BASE64_ALPHABET[b0 >> 2];
    out += BASE64_ALPHABET[((b0 & 3) << 4) | (isNaN(b1) ? 0 : b1 >> 4)];
    out += isNaN(b1) ? '=' : BASE64_ALPHABET[((b1 & 15) << 2) | (isNaN(b2) ? 0 : b2 >> 6)];
    out += isNaN(b2) ? '=' : BASE64_ALPHABET[b2 & 63];
  }
  return out.replace(/\+/g, '-').replace(/[/]/g, '_').replace(/[=]+$/, '');
}
/* eslint-enable no-bitwise */

/** Builds an unsigned JWT with the given payload — signature is never checked here. */
function makeJwt(payload: Record<string, unknown>): string {
  return `${encodeSegment({ alg: 'RS256', typ: 'JWT' })}.${encodeSegment(
    payload,
  )}.fake-signature`;
}

describe('decodeSessionToken', () => {
  it('reads the four custom claims', () => {
    const token = makeJwt({
      memberId: 'M-1001',
      plan: 'GOLD-PPO',
      subscriberId: 'S-42',
      lobs: ['medicare', 'commercial'],
    });

    const decoded = decodeSessionToken(token);

    expect(decoded?.claims).toEqual({
      memberId: 'M-1001',
      plan: 'GOLD-PPO',
      subscriberId: 'S-42',
      lobs: ['medicare', 'commercial'],
    });
  });

  it('accepts lobs as a comma-separated string', () => {
    // Descope can project a multi-value attribute either way depending on the
    // attribute's type, so both shapes have to work.
    const decoded = decodeSessionToken(makeJwt({ lobs: 'medicare, commercial' }));
    expect(decoded?.claims.lobs).toEqual(['medicare', 'commercial']);
  });

  it('reads standard claims', () => {
    const decoded = decodeSessionToken(
      makeJwt({ iss: 'P2abc123', sub: 'U-9', exp: 1767225600 }),
    );
    expect(decoded?.issuer).toBe('P2abc123');
    expect(decoded?.subject).toBe('U-9');
    expect(decoded?.expiresAt?.getTime()).toBe(1767225600 * 1000);
  });

  it('decodes non-ASCII claim values', () => {
    // The percent-encoding route through decodeURIComponent is what makes this
    // work; a naive byte-to-char decoder would mangle it.
    const decoded = decodeSessionToken(makeJwt({ memberId: 'Zoë-Ünïcode-日本' }));
    expect(decoded?.claims.memberId).toBe('Zoë-Ünïcode-日本');
  });

  it('handles base64url padding variants', () => {
    // Payload lengths that hit each of the 3 padding cases (0, 1, 2 '=').
    for (const memberId of ['a', 'ab', 'abc', 'abcd']) {
      expect(decodeSessionToken(makeJwt({ memberId }))?.claims.memberId).toBe(memberId);
    }
  });

  it('returns null for junk rather than throwing', () => {
    expect(decodeSessionToken(undefined)).toBeNull();
    expect(decodeSessionToken('')).toBeNull();
    expect(decodeSessionToken('not-a-jwt')).toBeNull();
    expect(decodeSessionToken('header.!!!not-base64!!!.sig')).toBeNull();
  });

  it('leaves absent claims undefined instead of "undefined"', () => {
    const decoded = decodeSessionToken(makeJwt({ sub: 'U-9' }));
    expect(decoded?.claims.memberId).toBeUndefined();
    expect(decoded?.claims.lobs).toBeUndefined();
  });
});

describe('hasMemberClaims', () => {
  it('is false when the template produced nothing', () => {
    expect(hasMemberClaims(undefined)).toBe(false);
    expect(hasMemberClaims({})).toBe(false);
    expect(hasMemberClaims({ lobs: [] })).toBe(false);
  });

  it('is true when any claim is populated', () => {
    expect(hasMemberClaims({ memberId: 'M-1' })).toBe(true);
    expect(hasMemberClaims({ lobs: ['medicare'] })).toBe(true);
  });
});

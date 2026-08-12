/**
 * descopeService — a framework-agnostic wrapper around the Descope SDK.
 *
 * Every direct Descope API call goes through this module rather than
 * hooks/screens calling `descope.*` themselves. It knows nothing about React —
 * no hooks, no session state — so it's easy to unit test. Applying a session
 * (`manageSession` / `clearSession`) stays in `useAuth`, since that's inherently
 * tied to Descope's React session context.
 *
 * Note how little is here. Password sign-in and OTP are **not** SDK calls in
 * this app: they're steps inside the embedded sign-in flow, which hands back a
 * finished session (see src/screens/SignInScreen.tsx). What's left is the
 * session lifecycle — the biometric path, which exchanges a stored refresh
 * token, and logout.
 *
 * Construct one with `createDescopeService(sdk)`, where `sdk` is whatever
 * `useDescope()` returns — see `useDescopeService.ts` for the React binding.
 */
import type { useDescope } from '@descope/react-native-sdk';
import type { JWTResponse } from '@descope/core-js-sdk';

export type DescopeSdk = ReturnType<typeof useDescope>;

export type ServiceResult = { ok: true } | { ok: false; error: string };
export type VerifyResult = { ok: true; jwt: JWTResponse } | { ok: false; error: string };

function messageFor(e: unknown, fallback: string): string {
  const err = e as { errorDescription?: string; message?: string } | undefined;
  return err?.errorDescription || err?.message || fallback;
}

export function createDescopeService(sdk: DescopeSdk) {
  return {
    /**
     * Exchanges a refresh JWT for a fresh session — the biometric sign-in path.
     */
    async refreshWithToken(refreshJwt: string): Promise<VerifyResult> {
      try {
        const resp = await sdk.refresh(refreshJwt);
        if (!resp.ok || !resp.data) {
          return { ok: false, error: 'Your saved sign-in expired. Please sign in again.' };
        }
        let jwt = resp.data;
        // The refresh response carries only tokens — no user profile — but
        // manageSession requires `user` (and a refresh JWT) to be present.
        // Fetch the profile with the same refresh token and merge it in.
        if (!jwt.user) {
          const meResp = await sdk.me(refreshJwt);
          if (!meResp.ok || !meResp.data) {
            return { ok: false, error: 'Could not load your profile. Please sign in again.' };
          }
          jwt = { ...jwt, user: meResp.data };
        }
        return { ok: true, jwt };
      } catch (e) {
        return { ok: false, error: messageFor(e, 'Biometric sign-in failed.') };
      }
    },

    async logout(refreshJwt?: string): Promise<void> {
      try {
        await sdk.logout(refreshJwt);
      } catch {
        // ignore network errors on logout — the local session is cleared regardless
      }
    },
  };
}

export type DescopeService = ReturnType<typeof createDescopeService>;

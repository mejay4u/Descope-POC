/**
 * descopeService — a framework-agnostic wrapper around the Descope SDK.
 *
 * Every Descope API call in the app goes through this module rather than
 * hooks/screens calling `descope.*` directly. It knows nothing about React —
 * no hooks, no session state — so it's easy to unit test and easy to reuse
 * outside a component. Applying a session (`manageSession` / `clearSession`)
 * stays in `useAuth`, since that's inherently tied to Descope's React
 * session context.
 *
 * Construct one with `createDescopeService(sdk)`, where `sdk` is whatever
 * `useDescope()` returns — see `useDescopeService.ts` for the React binding.
 */
import type { useDescope } from '@descope/react-native-sdk';
import type { JWTResponse } from '@descope/core-js-sdk';
import { AUTH_REDIRECT_URL } from '../config';

export type DescopeSdk = ReturnType<typeof useDescope>;

export type ServiceResult = { ok: true } | { ok: false; error: string };
export type VerifyResult = { ok: true; jwt: JWTResponse } | { ok: false; error: string };

function messageFor(e: unknown, fallback: string): string {
  const err = e as { errorDescription?: string; message?: string } | undefined;
  return err?.errorDescription || err?.message || fallback;
}

export function createDescopeService(sdk: DescopeSdk) {
  return {
    // ---- Email + password (sign-in) -------------------------------------
    //
    // Sign-in and password reset still go through Descope. Registration stores
    // the password in the MemberPortal database instead, so these succeed only
    // for accounts whose password Descope still holds — until sign-in is
    // pointed at that database, which is separate work.

    async signInWithPassword(email: string, password: string): Promise<VerifyResult> {
      try {
        const resp = await sdk.password.signIn(email, password);
        if (!resp.ok || !resp.data) {
          return {
            ok: false,
            error: resp.error?.errorDescription ?? 'Invalid email or password.',
          };
        }
        return { ok: true, jwt: resp.data };
      } catch (e) {
        return { ok: false, error: messageFor(e, 'Invalid email or password.') };
      }
    },

    async requestPasswordReset(email: string): Promise<ServiceResult> {
      try {
        const resp = await sdk.password.sendReset(email, AUTH_REDIRECT_URL);
        if (!resp.ok) {
          return {
            ok: false,
            error: resp.error?.errorDescription ?? 'Could not send a reset email.',
          };
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, error: messageFor(e, 'Could not send a reset email.') };
      }
    },

    // ---- Registration -------------------------------------------------------
    //
    // Nothing here: registration is a Descope Flow, run by FlowView in
    // RegisterScreen. The flow's own screens collect the details, the Descope
    // engine calls the BFF, and the finished session comes back through
    // FlowView's onSuccess — no SDK calls from the app at any point.

    // ---- Session lifecycle --------------------------------------------------

    async refreshWithToken(refreshJwt: string): Promise<VerifyResult> {
      try {
        const resp = await sdk.refresh(refreshJwt);
        if (!resp.ok || !resp.data) {
          return { ok: false, error: 'Your saved sign-in expired. Please log in again.' };
        }
        let jwt = resp.data;
        // The refresh response carries only tokens — no user profile — but
        // manageSession requires `user` (and a refresh JWT) to be present.
        // Fetch the profile with the same refresh token and merge it in.
        if (!jwt.user) {
          const meResp = await sdk.me(refreshJwt);
          if (!meResp.ok || !meResp.data) {
            return { ok: false, error: 'Could not load your profile. Please log in again.' };
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

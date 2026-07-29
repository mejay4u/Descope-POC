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
    // Sign-in and password reset still go through Descope. Registration no
    // longer stores a password there (it goes to the MemberPortal database via
    // memberApi.ts), so these succeed only for accounts whose password Descope
    // still holds, or once the Descope login flow proxies validation to the
    // MemberPortal API. Routing sign-in through that API is separate work.

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

    // ---- Registration: email verification only ----------------------------
    //
    // Descope's entire role in registration is proving the member owns the
    // email address:
    //   1. startRegistration      — creates a passwordless, email-only user
    //                               record and emails an OTP.
    //   2. verifyRegistrationCode — exchanges the code for a session.
    // Nothing else is sent here: name, date of birth, zip, phone and the
    // password go to the MemberPortal API instead (memberApi.ts), so Descope
    // stores the email address and nothing more. The session from step 2
    // authenticates those API calls and is applied once the wizard finishes —
    // see useAuth.ts / RegisterScreen.

    async startRegistration(email: string): Promise<ServiceResult> {
      try {
        // No user attributes: the skeleton record is the email address alone.
        const resp = await sdk.otp.signUp.email(email);
        if (resp.ok) {
          return { ok: true };
        }
        // The email may already belong to an account from an earlier attempt
        // that never finished (or any existing account at all) — rather than
        // dead-ending the wizard with "User already exists", fall back to
        // sending a normal sign-in code. The rest of the wizard works the same
        // either way.
        const retry = await sdk.otp.signIn.email(email);
        if (retry.ok) {
          return { ok: true };
        }
        return {
          ok: false,
          error: resp.error?.errorDescription ?? 'Could not send a verification code.',
        };
      } catch (e) {
        return { ok: false, error: messageFor(e, 'Could not send a verification code.') };
      }
    },

    /**
     * Resends a code. `startRegistration`'s `otp.signUp.email` already created
     * the user on the first call, so calling it again fails with "User already
     * exists" — use the sign-in delivery instead, which just (re)sends a code
     * for a loginId that's already there.
     */
    async resendRegistrationCode(email: string): Promise<ServiceResult> {
      try {
        const resp = await sdk.otp.signIn.email(email);
        if (!resp.ok) {
          return {
            ok: false,
            error: resp.error?.errorDescription ?? 'Could not resend the verification code.',
          };
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, error: messageFor(e, 'Could not resend the verification code.') };
      }
    },

    async verifyRegistrationCode(email: string, code: string): Promise<VerifyResult> {
      try {
        const resp = await sdk.otp.verify.email(email, code);
        if (!resp.ok || !resp.data) {
          return {
            ok: false,
            error: resp.error?.errorDescription ?? 'Invalid code. Please try again.',
          };
        }
        return { ok: true, jwt: resp.data };
      } catch (e) {
        return { ok: false, error: messageFor(e, 'Invalid code. Please try again.') };
      }
    },

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

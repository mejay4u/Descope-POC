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

export type RegistrationDetails = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
};

/**
 * The character-class requirements Descope enforces server-side. Mirrors the
 * Console's Authentication Methods → Passwords → Password Policy checkboxes.
 * Note: Descope's policy has no maximum length — that's a client-only cap.
 */
export type PasswordPolicy = {
  minLength: number;
  lowercase: boolean;
  uppercase: boolean;
  number: boolean;
  nonAlphanumeric: boolean;
};

/**
 * Fallback used if the live policy can't be fetched (offline, etc.). Kept in
 * sync with the current Descope Console configuration so the checklist stays
 * correct even without a network round-trip.
 */
export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 8,
  lowercase: true,
  uppercase: true,
  number: true,
  nonAlphanumeric: true,
};

function messageFor(e: unknown, fallback: string): string {
  const err = e as { errorDescription?: string; message?: string } | undefined;
  return err?.errorDescription || err?.message || fallback;
}

export function createDescopeService(sdk: DescopeSdk) {
  return {
    // ---- Email + password ---------------------------------------------

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

    /**
     * The live password policy configured in the Descope Console. Public
     * endpoint (no auth needed). Falls back to DEFAULT_PASSWORD_POLICY so the
     * caller always gets a usable policy to render a checklist from.
     */
    async getPasswordPolicy(): Promise<PasswordPolicy> {
      try {
        const resp = await sdk.password.policy();
        if (resp.ok && resp.data) {
          return {
            minLength: resp.data.minLength,
            lowercase: resp.data.lowercase,
            uppercase: resp.data.uppercase,
            number: resp.data.number,
            nonAlphanumeric: resp.data.nonAlphanumeric,
          };
        }
      } catch {
        // fall through to the default policy below
      }
      return DEFAULT_PASSWORD_POLICY;
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

    // ---- Registration wizard (email OTP -> password) ----------------------
    //
    // Splits what a single `password.signUp` call normally does into three
    // steps so the UI can walk the user through them:
    //   1. startRegistration      — creates the (unverified) user, emails an OTP.
    //   2. verifyRegistrationCode — exchanges the code for a session.
    //   3. completeRegistration   — attaches a password using that session.
    // See useAuth.ts / RegisterScreen for how the session is held between
    // steps 2 and 3 without being applied early.

    async startRegistration(details: RegistrationDetails): Promise<ServiceResult> {
      try {
        const resp = await sdk.otp.signUp.email(details.email, {
          name: `${details.firstName} ${details.lastName}`.trim(),
          givenName: details.firstName,
          familyName: details.lastName,
          email: details.email,
          phone: details.phone || undefined,
        });
        if (resp.ok) {
          return { ok: true };
        }
        // The email may already belong to an account from an earlier attempt
        // that never finished (or any existing account at all) — rather than
        // dead-ending the wizard with "User already exists", fall back to
        // sending a normal sign-in code. The rest of the wizard (verify,
        // then set/replace a password) works the same either way.
        const retry = await sdk.otp.signIn.email(details.email);
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
     * Resends a code to a pending registration. `startRegistration`'s
     * `otp.signUp.email` already created the user on the first call, so
     * calling it again for a resend fails with "User already exists" — use
     * the sign-in delivery instead, which just (re)sends a code for a loginId
     * that's already there, verification status notwithstanding.
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

    async completeRegistration(
      email: string,
      password: string,
      refreshJwt: string,
    ): Promise<ServiceResult> {
      try {
        // `password.update` authenticates the account operation with the
        // user's REFRESH token (same as me/logout/refresh) — NOT the session
        // JWT. Passing the session token here fails with the generic
        // "Password update failed".
        const resp = await sdk.password.update(email, password, refreshJwt);
        if (!resp.ok) {
          return {
            ok: false,
            error: resp.error?.errorDescription ?? 'Could not set your password.',
          };
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, error: messageFor(e, 'Could not set your password.') };
      }
    },

    // ---- Session lifecycle --------------------------------------------------

    async refreshWithToken(refreshJwt: string): Promise<VerifyResult> {
      try {
        const resp = await sdk.refresh(refreshJwt);
        if (!resp.ok || !resp.data) {
          return { ok: false, error: 'Your saved sign-in expired. Please log in again.' };
        }
        return { ok: true, jwt: resp.data };
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

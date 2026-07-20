/**
 * descopeService — a framework-agnostic wrapper around the Descope SDK.
 *
 * Every Descope API call in the app goes through this module rather than
 * hooks/screens calling `descope.*` directly. It knows nothing about React —
 * no hooks, no session state — so it's easy to unit test and easy to reuse
 * outside a component (deep-link handling, background refresh, etc).
 * Applying a session (`manageSession` / `clearSession`) stays in `useAuth`,
 * since that's inherently tied to Descope's React session context.
 *
 * Construct one with `createDescopeService(sdk)`, where `sdk` is whatever
 * `useDescope()` returns — see `useDescopeService.ts` for the React binding.
 */
import { Linking } from 'react-native';
import type { useDescope } from '@descope/react-native-sdk';
import type { JWTResponse } from '@descope/core-js-sdk';
import { AUTH_REDIRECT_URL } from '../config';

export type DescopeSdk = ReturnType<typeof useDescope>;

export type ServiceResult = { ok: true } | { ok: false; error: string };
export type VerifyResult = { ok: true; jwt: JWTResponse } | { ok: false; error: string };

export type SocialProvider = 'apple' | 'microsoft' | 'google' | 'facebook';

export type RegistrationDetails = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
};

const OAUTH_PROVIDER_ID: Record<SocialProvider, string> = {
  apple: 'apple',
  microsoft: 'microsoft',
  google: 'google',
  facebook: 'facebook',
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

    // ---- Social OAuth ----------------------------------------------------

    /** Opens the provider in the system browser; completion arrives via deep link. */
    async startOAuth(provider: SocialProvider): Promise<ServiceResult> {
      try {
        const resp = await sdk.oauth.start(OAUTH_PROVIDER_ID[provider], AUTH_REDIRECT_URL);
        const url = (resp.data as { url?: string } | undefined)?.url;
        if (!resp.ok || !url) {
          return {
            ok: false,
            error: resp.error?.errorDescription ?? 'Could not start social sign-in.',
          };
        }
        await Linking.openURL(url);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: messageFor(e, 'Could not start social sign-in.') };
      }
    },

    async exchangeOAuthCode(code: string): Promise<VerifyResult> {
      try {
        const resp = await sdk.oauth.exchange(code);
        if (!resp.ok || !resp.data) {
          return { ok: false, error: resp.error?.errorDescription ?? 'Social sign-in failed.' };
        }
        return { ok: true, jwt: resp.data };
      } catch (e) {
        return { ok: false, error: messageFor(e, 'Social sign-in failed.') };
      }
    },

    // ---- Magic link --------------------------------------------------------

    /** Works for both new and returning members — safe to offer on the Login screen. */
    async signInOrUpWithMagicLink(email: string): Promise<ServiceResult> {
      try {
        const resp = await sdk.magicLink.signUpOrIn.email(email, AUTH_REDIRECT_URL);
        if (!resp.ok) {
          return {
            ok: false,
            error: resp.error?.errorDescription ?? 'Could not send magic link.',
          };
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, error: messageFor(e, 'Could not send magic link.') };
      }
    },

    async verifyMagicLinkToken(token: string): Promise<VerifyResult> {
      try {
        const resp = await sdk.magicLink.verify(token);
        if (!resp.ok || !resp.data) {
          return {
            ok: false,
            error: resp.error?.errorDescription ?? 'Magic link sign-in failed.',
          };
        }
        return { ok: true, jwt: resp.data };
      } catch (e) {
        return { ok: false, error: messageFor(e, 'Magic link sign-in failed.') };
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
        if (!resp.ok) {
          return {
            ok: false,
            error: resp.error?.errorDescription ?? 'Could not send a verification code.',
          };
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, error: messageFor(e, 'Could not send a verification code.') };
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
      sessionJwt: string,
    ): Promise<ServiceResult> {
      try {
        const resp = await sdk.password.update(email, password, sessionJwt);
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

    // ---- WhatsApp one-time code --------------------------------------------

    async sendWhatsAppOtp(phone: string): Promise<ServiceResult> {
      try {
        const resp = await sdk.otp.signUpOrIn.whatsapp(phone);
        if (!resp.ok) {
          return {
            ok: false,
            error: resp.error?.errorDescription ?? 'Could not send WhatsApp code.',
          };
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, error: messageFor(e, 'Could not send WhatsApp code.') };
      }
    },

    async verifyWhatsAppOtp(phone: string, code: string): Promise<VerifyResult> {
      try {
        const resp = await sdk.otp.verify.whatsapp(phone, code);
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

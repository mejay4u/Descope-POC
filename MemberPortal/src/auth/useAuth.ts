/**
 * useAuth — a thin, screen-friendly wrapper around the Descope SDK.
 *
 * Descope is the IdP; there is no custom backend. Each method returns a small
 * result object so screens can show inline errors instead of throwing.
 */
import { useCallback } from 'react';
import { Linking } from 'react-native';
import { useDescope, useSession } from '@descope/react-native-sdk';
import type { JWTResponse } from '@descope/core-js-sdk';
import { AUTH_REDIRECT_URL } from '../config';
import {
  disableBiometricLogin,
  getBiometricRefreshToken,
  promptEnableBiometricLogin,
} from './biometricStore';

export type AuthResult = { ok: true } | { ok: false; error: string };
export type VerifyResult = { ok: true; jwt: JWTResponse } | { ok: false; error: string };

export type RegistrationDetails = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
};

export type SocialProvider = 'apple' | 'microsoft' | 'google' | 'facebook';

// Descope OAuth provider ids.
const PROVIDER_ID: Record<SocialProvider, string> = {
  apple: 'apple',
  microsoft: 'microsoft',
  google: 'google',
  facebook: 'facebook',
};

export function messageFor(e: unknown, fallback: string): string {
  const err = e as { errorDescription?: string; message?: string } | undefined;
  return err?.errorDescription || err?.message || fallback;
}

export function useAuth() {
  const descope = useDescope();
  const { manageSession, clearSession, session } = useSession();

  const signInWithEmail = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      try {
        const resp = await descope.password.signIn(email, password);
        if (!resp.ok || !resp.data) {
          return {
            ok: false,
            error: resp.error?.errorDescription ?? 'Invalid email or password.',
          };
        }
        await manageSession(resp.data);
        await promptEnableBiometricLogin(resp.data.refreshJwt);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: messageFor(e, 'Invalid email or password.') };
      }
    },
    [descope, manageSession],
  );

  /**
   * Start web-based OAuth. Opens the provider in the system browser; the app is
   * re-entered via the AUTH_REDIRECT_URL deep link, which is exchanged for a
   * session in useAuthDeepLink().
   */
  const signInWithOAuth = useCallback(
    async (provider: SocialProvider): Promise<AuthResult> => {
      try {
        const resp = await descope.oauth.start(
          PROVIDER_ID[provider],
          AUTH_REDIRECT_URL,
        );
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
    [descope],
  );

  /**
   * Email magic link, works for both new and returning members (mirrors how
   * WhatsApp's `otp.signUpOrIn` is used below) — a magic link tile can live
   * on the Login screen without failing for people who don't have an
   * account yet.
   */
  const signInOrUpWithMagicLink = useCallback(
    async (email: string): Promise<AuthResult> => {
      try {
        const resp = await descope.magicLink.signUpOrIn.email(email, AUTH_REDIRECT_URL);
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
    [descope],
  );

  /**
   * Multi-step registration wizard (Personal Info -> Verify Email -> Review
   * -> Set Password). Splits what a single `password.signUp` call normally
   * does into three steps so the UI can walk the user through them:
   *
   *   1. startRegistration — creates the (unverified) user and emails an OTP.
   *   2. verifyRegistrationCode — exchanges the code for a session. The
   *      session is intentionally NOT applied yet (no `manageSession`) so the
   *      app doesn't jump into the Portal mid-wizard — the caller holds onto
   *      the returned JWT until the wizard finishes.
   *   3. completeRegistration — attaches a password to the now-verified
   *      account using that held session, then the caller applies the
   *      session with `manageSession`.
   *
   * Fields the Descope `User` type doesn't support (date of birth, zip code)
   * are collected by the UI but aren't persisted yet — that needs either a
   * Descope Flow action or the server-side Management SDK, neither of which
   * this front-end-only app can reach. They're wired up once that piece
   * lands.
   */
  const startRegistration = useCallback(
    async (details: RegistrationDetails): Promise<AuthResult> => {
      try {
        const resp = await descope.otp.signUp.email(details.email, {
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
    [descope],
  );

  const verifyRegistrationCode = useCallback(
    async (email: string, code: string): Promise<VerifyResult> => {
      try {
        const resp = await descope.otp.verify.email(email, code);
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
    [descope],
  );

  const completeRegistration = useCallback(
    async (email: string, password: string, sessionJwt: string): Promise<AuthResult> => {
      try {
        const resp = await descope.password.update(email, password, sessionJwt);
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
    [descope],
  );

  const requestPasswordReset = useCallback(
    async (email: string): Promise<AuthResult> => {
      try {
        const resp = await descope.password.sendReset(email, AUTH_REDIRECT_URL);
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
    [descope],
  );

  /**
   * WhatsApp one-time code. Sends a code via `otp.signUpOrIn` (works for both
   * new and returning members), then `verifyWhatsAppOtp` exchanges the code
   * the user enters for a session.
   */
  const sendWhatsAppOtp = useCallback(
    async (phone: string): Promise<AuthResult> => {
      try {
        const resp = await descope.otp.signUpOrIn.whatsapp(phone);
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
    [descope],
  );

  const verifyWhatsAppOtp = useCallback(
    async (phone: string, code: string): Promise<AuthResult> => {
      try {
        const resp = await descope.otp.verify.whatsapp(phone, code);
        if (!resp.ok || !resp.data) {
          return {
            ok: false,
            error: resp.error?.errorDescription ?? 'Invalid code. Please try again.',
          };
        }
        await manageSession(resp.data);
        await promptEnableBiometricLogin(resp.data.refreshJwt);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: messageFor(e, 'Invalid code. Please try again.') };
      }
    },
    [descope, manageSession],
  );

  /** Sign in using the biometric-protected refresh token. */
  const signInWithBiometrics = useCallback(async (): Promise<AuthResult> => {
    try {
      const refreshJwt = await getBiometricRefreshToken();
      if (!refreshJwt) {
        return { ok: false, error: 'Biometric sign-in was cancelled.' };
      }
      const resp = await descope.refresh(refreshJwt);
      if (!resp.ok || !resp.data) {
        // Stored token no longer valid — clear it so the button hides.
        await disableBiometricLogin();
        return {
          ok: false,
          error: 'Your saved sign-in expired. Please log in again.',
        };
      }
      await manageSession(resp.data);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: messageFor(e, 'Biometric sign-in failed.') };
    }
  }, [descope, manageSession]);

  const signOut = useCallback(async (): Promise<void> => {
    try {
      await descope.logout(session?.refreshJwt);
    } catch {
      // ignore network errors on logout
    }
    // Deliberately does NOT clear the biometric-protected refresh token —
    // that's what lets "Sign in with Face ID" on the Welcome screen work
    // *after* signing out. It's only removed via the Portal's explicit
    // toggle, or automatically if it's later found to be invalid.
    await clearSession();
  }, [descope, session, clearSession]);

  return {
    signInWithEmail,
    signInWithOAuth,
    signInOrUpWithMagicLink,
    startRegistration,
    verifyRegistrationCode,
    completeRegistration,
    requestPasswordReset,
    sendWhatsAppOtp,
    verifyWhatsAppOtp,
    signInWithBiometrics,
    signOut,
  };
}

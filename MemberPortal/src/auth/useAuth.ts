/**
 * useAuth — a thin React binding over descopeService.
 *
 * The service does the actual Descope API calls and error-message mapping;
 * this hook adds the React-specific bits on top — applying the session
 * (`manageSession`) and offering biometric enrollment — so screens get a
 * simple `{ ok } | { ok: false, error }` result without touching Descope or
 * session state directly.
 */
import { useCallback } from 'react';
import { useSession } from '@descope/react-native-sdk';
import type { JWTResponse } from '@descope/core-js-sdk';
import { useDescopeService } from '../services/useDescopeService';
import type {
  RegistrationDetails,
  ServiceResult,
  SocialProvider,
  VerifyResult,
} from '../services/descopeService';
import {
  disableBiometricLogin,
  getBiometricRefreshToken,
  promptEnableBiometricLogin,
} from './biometricStore';

export type AuthResult = ServiceResult;
export type { VerifyResult, RegistrationDetails, SocialProvider };

export function useAuth() {
  const service = useDescopeService();
  const { manageSession, clearSession, session } = useSession();

  /** Applies a verified session's side effects: activates it and offers biometrics. */
  const applySession = useCallback(
    async (result: VerifyResult): Promise<AuthResult> => {
      if (!result.ok) {
        return result;
      }
      await manageSession(result.jwt);
      await promptEnableBiometricLogin(result.jwt.refreshJwt);
      return { ok: true };
    },
    [manageSession],
  );

  const signInWithEmail = useCallback(
    async (email: string, password: string): Promise<AuthResult> =>
      applySession(await service.signInWithPassword(email, password)),
    [service, applySession],
  );

  const requestPasswordReset = useCallback(
    (email: string) => service.requestPasswordReset(email),
    [service],
  );

  /**
   * Start web-based OAuth. Opens the provider in the system browser; the app is
   * re-entered via the AUTH_REDIRECT_URL deep link, which is exchanged for a
   * session in useAuthDeepLink().
   */
  const signInWithOAuth = useCallback(
    (provider: SocialProvider) => service.startOAuth(provider),
    [service],
  );

  /**
   * Email magic link, works for both new and returning members (mirrors how
   * WhatsApp's `otp.signUpOrIn` is used below) — a magic link tile can live
   * on the Login screen without failing for people who don't have an
   * account yet.
   */
  const signInOrUpWithMagicLink = useCallback(
    (email: string) => service.signInOrUpWithMagicLink(email),
    [service],
  );

  /**
   * Multi-step registration wizard (Personal Info -> Verify Email -> Review
   * -> Set Password). See descopeService.ts for what each step actually
   * calls; the session returned by step 2 is intentionally NOT applied here
   * — the caller (RegisterScreen) holds it until the wizard finishes, then
   * applies it via `finishRegistration` below.
   */
  const startRegistration = useCallback(
    (details: RegistrationDetails) => service.startRegistration(details),
    [service],
  );

  const verifyRegistrationCode = useCallback(
    (email: string, code: string) => service.verifyRegistrationCode(email, code),
    [service],
  );

  const completeRegistration = useCallback(
    (email: string, password: string, sessionJwt: string) =>
      service.completeRegistration(email, password, sessionJwt),
    [service],
  );

  /** Applies the session held since email verification, once the wizard is done. */
  const finishRegistration = useCallback(
    async (jwt: JWTResponse): Promise<void> => {
      await manageSession(jwt);
      await promptEnableBiometricLogin(jwt.refreshJwt);
    },
    [manageSession],
  );

  /**
   * WhatsApp one-time code. Sends a code via `otp.signUpOrIn` (works for both
   * new and returning members), then `verifyWhatsAppOtp` exchanges the code
   * the user enters for a session.
   */
  const sendWhatsAppOtp = useCallback((phone: string) => service.sendWhatsAppOtp(phone), [service]);

  const verifyWhatsAppOtp = useCallback(
    async (phone: string, code: string): Promise<AuthResult> =>
      applySession(await service.verifyWhatsAppOtp(phone, code)),
    [service, applySession],
  );

  /** Sign in using the biometric-protected refresh token. */
  const signInWithBiometrics = useCallback(async (): Promise<AuthResult> => {
    const refreshJwt = await getBiometricRefreshToken();
    if (!refreshJwt) {
      return { ok: false, error: 'Biometric sign-in was cancelled.' };
    }
    const result = await service.refreshWithToken(refreshJwt);
    if (!result.ok) {
      // Stored token no longer valid — clear it so the button hides.
      await disableBiometricLogin();
      return result;
    }
    await manageSession(result.jwt);
    return { ok: true };
  }, [service, manageSession]);

  const signOut = useCallback(async (): Promise<void> => {
    await service.logout(session?.refreshJwt);
    // Deliberately does NOT clear the biometric-protected refresh token —
    // that's what lets "Sign in with Face ID" on the Welcome screen work
    // *after* signing out. It's only removed via the Portal's explicit
    // toggle, or automatically if it's later found to be invalid.
    await clearSession();
  }, [service, session, clearSession]);

  return {
    signInWithEmail,
    signInWithOAuth,
    signInOrUpWithMagicLink,
    startRegistration,
    verifyRegistrationCode,
    completeRegistration,
    finishRegistration,
    requestPasswordReset,
    sendWhatsAppOtp,
    verifyWhatsAppOtp,
    signInWithBiometrics,
    signOut,
  };
}

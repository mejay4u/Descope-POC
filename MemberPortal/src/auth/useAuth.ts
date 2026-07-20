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
  PasswordPolicy,
  RegistrationDetails,
  ServiceResult,
  VerifyResult,
} from '../services/descopeService';
import {
  disableBiometricLogin,
  enableBiometricLogin,
  getBiometricRefreshToken,
  hasBiometricLogin,
  promptEnableBiometricLogin,
} from './biometricStore';

export type AuthResult = ServiceResult;
export type { VerifyResult, RegistrationDetails, PasswordPolicy };

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

  const getPasswordPolicy = useCallback(() => service.getPasswordPolicy(), [service]);

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

  const resendRegistrationCode = useCallback(
    (email: string) => service.resendRegistrationCode(email),
    [service],
  );

  /**
   * Sets the account's password and returns a FRESH session (from a
   * password sign-in) — the OTP-verify token passed in is only used to
   * authorize the password update, and is invalidated by it. See
   * descopeService.completeRegistration.
   */
  const completeRegistration = useCallback(
    (email: string, password: string, refreshJwt: string) =>
      service.completeRegistration(email, password, refreshJwt),
    [service],
  );

  /** Applies the fresh session from completeRegistration, once the wizard is done. */
  const finishRegistration = useCallback(
    async (jwt: JWTResponse): Promise<void> => {
      await manageSession(jwt);
      await promptEnableBiometricLogin(jwt.refreshJwt);
    },
    [manageSession],
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
    // Descope may rotate the refresh token on every `refresh` call — re-save
    // it so the next biometric sign-in uses a still-valid token instead of
    // the one that was just consumed.
    if (result.jwt.refreshJwt) {
      await enableBiometricLogin(result.jwt.refreshJwt).catch(() => {});
    }
    return { ok: true };
  }, [service, manageSession]);

  const signOut = useCallback(async (): Promise<void> => {
    // If biometric sign-in is enabled, do NOT call the server-side logout:
    // `descope.logout` REVOKES the refresh token, and that's the exact token
    // biometric login later feeds to `descope.refresh` to re-authenticate.
    // Revoking it here is what caused "Your saved sign-in expired" on the
    // next biometric attempt. With biometrics on, signing out just locks the
    // app locally (clearSession) and leaves the token valid so Face ID /
    // fingerprint can unlock it again. A full server-side logout only happens
    // when biometrics aren't enabled.
    const biometricEnabled = await hasBiometricLogin();
    if (!biometricEnabled) {
      await service.logout(session?.refreshJwt);
    }
    await clearSession();
  }, [service, session, clearSession]);

  return {
    signInWithEmail,
    startRegistration,
    verifyRegistrationCode,
    resendRegistrationCode,
    completeRegistration,
    finishRegistration,
    requestPasswordReset,
    getPasswordPolicy,
    signInWithBiometrics,
    signOut,
  };
}

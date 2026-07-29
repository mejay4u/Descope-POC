/**
 * useAuth — a thin React binding over descopeService and memberApi.
 *
 * The services do the actual API calls and error-message mapping; this hook
 * adds the React-specific bits on top — applying the session (`manageSession`)
 * and offering biometric enrollment — so screens get a simple
 * `{ ok } | { ok: false, error }` result without touching Descope, the
 * MemberPortal API, or session state directly.
 */
import { useCallback } from 'react';
import { useSession } from '@descope/react-native-sdk';
import type { JWTResponse } from '@descope/core-js-sdk';
import { useDescopeService } from '../services/useDescopeService';
import type { ServiceResult, VerifyResult } from '../services/descopeService';
import {
  createAccount,
  initiateRegistration,
  type ApiResult,
  type MemberRegistration,
  type PendingRegistration,
} from '../services/memberApi';
import {
  disableBiometricLogin,
  enableBiometricLogin,
  getBiometricAvailability,
  getBiometricRefreshToken,
  hasBiometricLogin,
  promptEnableBiometricLogin,
} from './biometricStore';

export type AuthResult = ServiceResult;
export type { VerifyResult, MemberRegistration, PendingRegistration };

/**
 * Biometric sign-in distinguishes two special failures from an ordinary
 * failed attempt, so the Login screen can react to each differently:
 *   - osUnavailable: the OS won't allow a biometric prompt (disabled in
 *     Settings, nothing enrolled, lockout) — show a native "enable it in
 *     Settings" alert carrying the OS's own message.
 *   - notEnrolled: biometrics works on the device but the user hasn't set up
 *     biometric sign-in in this app yet (no stored token) — point them at
 *     password sign-in, which offers enrollment on success.
 */
export type BiometricSignInResult = AuthResult & {
  osUnavailable?: boolean;
  notEnrolled?: boolean;
};

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
   * Registration wizard (Personal Information -> Verify Email -> Review ->
   * Create Account). Descope handles the first two steps and nothing else; the
   * reviewed details and the password go to the MemberPortal API. The session
   * returned by the verify step is intentionally NOT applied here — the caller
   * (RegisterScreen) holds it, uses it to authenticate the API calls, and
   * applies it via `finishRegistration` once the wizard is done.
   */
  const startRegistration = useCallback(
    (email: string) => service.startRegistration(email),
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
   * Saves the reviewed details in the MemberPortal database and returns the
   * pending record's ID. `sessionJwt` comes from the OTP-verify step and is
   * what tells the API this email address was just verified.
   */
  const saveRegistrationDetails = useCallback(
    (details: MemberRegistration, sessionJwt: string): Promise<ApiResult<PendingRegistration>> =>
      initiateRegistration(details, sessionJwt),
    [],
  );

  /**
   * Creates the account with the chosen password. The password is hashed and
   * stored by the MemberPortal API — it is never sent to Descope.
   */
  const createMemberAccount = useCallback(
    (userId: string, password: string, confirmPassword: string, sessionJwt: string) =>
      createAccount(userId, password, confirmPassword, sessionJwt),
    [],
  );

  /**
   * Applies the session held since the verify step, once the wizard is done —
   * plus the biometric-enrollment prompt, exactly as after a sign-in.
   */
  const finishRegistration = useCallback(
    async (jwt: JWTResponse): Promise<void> => {
      await manageSession(jwt);
      await promptEnableBiometricLogin(jwt.refreshJwt);
    },
    [manageSession],
  );

  /** Sign in using the biometric-protected refresh token. */
  const signInWithBiometrics = useCallback(async (): Promise<BiometricSignInResult> => {
    try {
      // If the OS won't allow a biometric prompt right now (disabled in
      // Settings, nothing enrolled, lockout), surface the OS's own message
      // rather than a generic "cancelled" — the stored token stays intact so
      // biometric sign-in works again once the user re-enables it.
      const availability = await getBiometricAvailability();
      if (!availability.available) {
        return { ok: false, error: availability.osMessage, osUnavailable: true };
      }
      // The button is always shown so users can discover the feature — if
      // they haven't enabled biometric sign-in yet there's no stored token,
      // so skip the prompt and tell them how to set it up.
      if (!(await hasBiometricLogin())) {
        return {
          ok: false,
          error: 'Biometric sign-in is not set up yet.',
          notEnrolled: true,
        };
      }
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
      // `descope.refresh` returns a new session (access) JWT but usually NOT a
      // new refresh JWT — and it may come back as "" rather than undefined.
      // `manageSession` throws on any falsy refresh JWT, so `||` (not `??`) is
      // required to fall back to the token we already hold. If Descope *did*
      // rotate it, prefer the new one and re-save it so the next biometric
      // sign-in uses a still-valid token. (The service guarantees `user` is
      // populated — manageSession's third requirement.)
      const activeRefreshJwt = result.jwt.refreshJwt || refreshJwt;
      await manageSession({ ...result.jwt, refreshJwt: activeRefreshJwt });
      if (result.jwt.refreshJwt) {
        await enableBiometricLogin(result.jwt.refreshJwt).catch(() => {});
      }
      return { ok: true };
    } catch (e) {
      // Never let an SDK throw escape as an unhandled rejection (red screen) —
      // surface it as an inline error on the Login screen instead.
      const err = e as { message?: string } | undefined;
      return { ok: false, error: err?.message ?? 'Biometric sign-in failed.' };
    }
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
    saveRegistrationDetails,
    createMemberAccount,
    finishRegistration,
    requestPasswordReset,
    signInWithBiometrics,
    signOut,
  };
}

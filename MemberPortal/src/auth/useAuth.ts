/**
 * useAuth — a thin, screen-friendly wrapper around the Descope SDK.
 *
 * Descope is the IdP; there is no custom backend. Each method returns a small
 * result object so screens can show inline errors instead of throwing.
 */
import { useCallback } from 'react';
import { Linking } from 'react-native';
import { useDescope, useSession } from '@descope/react-native-sdk';
import { AUTH_REDIRECT_URL } from '../config';
import {
  disableBiometricLogin,
  getBiometricRefreshToken,
  promptEnableBiometricLogin,
} from './biometricStore';

export type AuthResult = { ok: true } | { ok: false; error: string };

export type SocialProvider = 'apple' | 'microsoft' | 'google';

// Descope OAuth provider ids.
const PROVIDER_ID: Record<SocialProvider, string> = {
  apple: 'apple',
  microsoft: 'microsoft',
  google: 'google',
};

export function messageFor(e: unknown, fallback: string): string {
  const err = e as { errorDescription?: string; message?: string } | undefined;
  return err?.errorDescription || err?.message || fallback;
}

export function useAuth() {
  const descope = useDescope();
  const { manageSession, clearSession, session } = useSession();

  const signUpWithEmail = useCallback(
    async (
      name: string,
      email: string,
      password: string,
    ): Promise<AuthResult> => {
      try {
        const resp = await descope.password.signUp(email, password, {
          name,
          email,
        });
        if (!resp.ok || !resp.data) {
          return { ok: false, error: resp.error?.errorDescription ?? 'Sign up failed.' };
        }
        await manageSession(resp.data);
        await promptEnableBiometricLogin(resp.data.refreshJwt);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: messageFor(e, 'Sign up failed.') };
      }
    },
    [descope, manageSession],
  );

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
   * Email magic link. Sends a one-time sign-in link; the session is created
   * later when the user taps the link and the app receives the
   * AUTH_REDIRECT_URL deep link (handled in useAuthDeepLink()).
   */
  const signInWithMagicLink = useCallback(
    async (email: string): Promise<AuthResult> => {
      try {
        const resp = await descope.magicLink.signIn.email(email, AUTH_REDIRECT_URL);
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

  const signUpWithMagicLink = useCallback(
    async (name: string, email: string): Promise<AuthResult> => {
      try {
        const resp = await descope.magicLink.signUp.email(email, AUTH_REDIRECT_URL, {
          name,
          email,
        });
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
    await disableBiometricLogin();
    await clearSession();
  }, [descope, session, clearSession]);

  return {
    signUpWithEmail,
    signInWithEmail,
    signInWithOAuth,
    signInWithMagicLink,
    signUpWithMagicLink,
    signInWithBiometrics,
    signOut,
  };
}

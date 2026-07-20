/**
 * Completes web-based OAuth (social) sign-in.
 *
 * signInWithOAuth() opens the provider in the browser with a redirect back to
 * OAUTH_REDIRECT_URL (memberportal://auth?code=...). When the OS re-opens the
 * app with that deep link, we pull out the `code` and exchange it with Descope
 * for a real session. No backend is involved — Descope does the exchange.
 */
import { useCallback, useEffect } from 'react';
import { Linking } from 'react-native';
import { useDescope, useSession } from '@descope/react-native-sdk';
import { OAUTH_REDIRECT_SCHEME } from '../config';
import { enableBiometricLogin } from './biometricStore';

type Options = {
  onError?: (message: string) => void;
};

/** Extract a query param from a deep link without relying on URL.searchParams. */
function getQueryParam(url: string, key: string): string | null {
  const query = url.split('?')[1];
  if (!query) {
    return null;
  }
  for (const pair of query.split('&')) {
    const [k, v] = pair.split('=');
    if (decodeURIComponent(k) === key) {
      return decodeURIComponent(v ?? '');
    }
  }
  return null;
}

export function useOAuthDeepLink({ onError }: Options = {}) {
  const descope = useDescope();
  const { manageSession } = useSession();

  const handleUrl = useCallback(
    async (url: string | null) => {
      if (!url || !url.startsWith(`${OAUTH_REDIRECT_SCHEME}://`)) {
        return;
      }
      try {
        const code = getQueryParam(url, 'code');
        if (!code) {
          return;
        }
        const resp = await descope.oauth.exchange(code);
        if (!resp.ok || !resp.data) {
          onError?.(resp.error?.errorDescription ?? 'Social sign-in failed.');
          return;
        }
        await manageSession(resp.data);
        if (resp.data.refreshJwt) {
          try {
            await enableBiometricLogin(resp.data.refreshJwt);
          } catch {
            // biometric opt-in is best-effort
          }
        }
      } catch (e) {
        const err = e as { message?: string };
        onError?.(err?.message ?? 'Social sign-in failed.');
      }
    },
    [descope, manageSession, onError],
  );

  useEffect(() => {
    // Cold start: app was launched by the redirect.
    Linking.getInitialURL().then(handleUrl);
    // Warm start: app was already open.
    const sub = Linking.addEventListener('url', event => handleUrl(event.url));
    return () => sub.remove();
  }, [handleUrl]);
}

/**
 * Completes web-based OAuth (social) and email magic link sign-in.
 *
 * signInWithOAuth() and signInOrUpWithMagicLink() both send the user out of the
 * app (browser / email client) with a redirect back to AUTH_REDIRECT_URL
 * (memberportal://auth?code=... or ?t=...). When the OS re-opens the app with
 * that deep link, we pull out the `code` (OAuth) or `t` (magic link) param and
 * exchange it with Descope for a real session. No backend is involved —
 * Descope does the exchange.
 */
import { useCallback, useEffect } from 'react';
import { Linking } from 'react-native';
import { useDescope, useSession } from '@descope/react-native-sdk';
import { AUTH_REDIRECT_SCHEME } from '../config';
import { promptEnableBiometricLogin } from './biometricStore';
import { messageFor } from './useAuth';

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

export function useAuthDeepLink({ onError }: Options = {}) {
  const descope = useDescope();
  const { manageSession } = useSession();

  const handleUrl = useCallback(
    async (url: string | null) => {
      if (!url || !url.startsWith(`${AUTH_REDIRECT_SCHEME}://`)) {
        return;
      }
      try {
        const code = getQueryParam(url, 'code');
        const token = getQueryParam(url, 't');

        if (code) {
          const resp = await descope.oauth.exchange(code);
          if (!resp.ok || !resp.data) {
            onError?.(resp.error?.errorDescription ?? 'Social sign-in failed.');
            return;
          }
          await manageSession(resp.data);
          await promptEnableBiometricLogin(resp.data.refreshJwt);
          return;
        }

        if (token) {
          const resp = await descope.magicLink.verify(token);
          if (!resp.ok || !resp.data) {
            onError?.(resp.error?.errorDescription ?? 'Magic link sign-in failed.');
            return;
          }
          await manageSession(resp.data);
          await promptEnableBiometricLogin(resp.data.refreshJwt);
        }
      } catch (e) {
        onError?.(messageFor(e, 'Sign-in failed.'));
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

/**
 * Completes web-based OAuth (social) and email magic link sign-in.
 *
 * signInWithOAuth() and signInOrUpWithMagicLink() both send the user out of the
 * app (browser / email client) with a redirect back to AUTH_REDIRECT_URL
 * (memberportal://auth?code=... or ?t=...). When the OS re-opens the app with
 * that deep link, we pull out the `code` (OAuth) or `t` (magic link) param and
 * exchange it with Descope for a real session via descopeService.
 */
import { useCallback, useEffect } from 'react';
import { Linking } from 'react-native';
import { useSession } from '@descope/react-native-sdk';
import { AUTH_REDIRECT_SCHEME } from '../config';
import { promptEnableBiometricLogin } from './biometricStore';
import { useDescopeService } from '../services/useDescopeService';

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
  const service = useDescopeService();
  const { manageSession } = useSession();

  const handleUrl = useCallback(
    async (url: string | null) => {
      if (!url || !url.startsWith(`${AUTH_REDIRECT_SCHEME}://`)) {
        return;
      }
      const code = getQueryParam(url, 'code');
      const token = getQueryParam(url, 't');

      const result = code
        ? await service.exchangeOAuthCode(code)
        : token
          ? await service.verifyMagicLinkToken(token)
          : null;

      if (!result) {
        return;
      }
      if (!result.ok) {
        onError?.(result.error);
        return;
      }
      await manageSession(result.jwt);
      await promptEnableBiometricLogin(result.jwt.refreshJwt);
    },
    [service, manageSession, onError],
  );

  useEffect(() => {
    // Cold start: app was launched by the redirect.
    Linking.getInitialURL().then(handleUrl);
    // Warm start: app was already open.
    const sub = Linking.addEventListener('url', event => handleUrl(event.url));
    return () => sub.remove();
  }, [handleUrl]);
}

import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlowView, useHostedFlowUrl, useSession } from '@descope/react-native-sdk';
import Banner from '../components/Banner';
import { promptEnableBiometricLogin } from '../auth/biometricStore';
import { markPasskeyAdded } from '../auth/passkeyStore';
import {
  AUTH_REDIRECT_URL,
  PASSKEY_ADD_FLOW_ID,
  PASSKEY_SIGNIN_FLOW_ID,
  isPasskeyConfigured,
} from '../config';
import { colors, radius, spacing, typography } from '../theme';

/**
 * Reachable from both the auth stack (unauthenticated sign-in) and the app
 * stack (authenticated "add a passkey" from the Portal), so it's typed with a
 * minimal structural shape rather than one navigator's param list — both only
 * need `goBack` and `params.mode`.
 */
type Props = {
  navigation: { goBack: () => void };
  route: { params?: { mode?: 'signin' | 'signup' } };
};

/**
 * Passkeys (WebAuthn) run through a Descope Flow embedded with `FlowView`.
 * FlowView renders the flow in an in-app web view and, critically:
 *   - performs the passkey ceremony via an internal web-auth session on
 *     Descope's own domain, so it's a *web* passkey — no iOS Associated
 *     Domains entitlement / hosted apple-app-site-association is needed, and
 *   - returns the finished session straight through its JS bridge
 *     (`onSuccess`), so there's no custom-scheme redirect to configure.
 *
 * (The alternative browser-based `useFlow().start()` needs the flow to
 * redirect back to a registered app scheme, which is easy to get wrong;
 * FlowView avoids all of that and is what returns cleanly for sign-in.)
 *
 * Two modes:
 *   - 'signin' (Welcome / Login) — unauthenticated sign-in with a passkey.
 *     manageSession makes a session exist and RootNavigator swaps to the Portal.
 *   - 'signup' (Portal) — the user is already signed in, so FlowView runs the
 *     flow authenticated (it picks up the active session automatically) and
 *     adds a passkey; we return to the Portal on success.
 */
export default function PasskeyScreen({ navigation, route }: Props) {
  const isAddMode = route.params?.mode === 'signup';
  const configured = isPasskeyConfigured();
  // Sign-in and add-a-passkey are different Descope flows.
  const flowId = isAddMode ? PASSKEY_ADD_FLOW_ID : PASSKEY_SIGNIN_FLOW_ID;
  const flowUrl = useHostedFlowUrl(flowId);
  const { manageSession, session } = useSession();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = isAddMode ? 'Add a passkey' : 'Sign in with a passkey';

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Text style={styles.title}>{title}</Text>

      {!!error && <Banner variant="error">{error}</Banner>}

      {!configured ? (
        <View style={styles.notConfigured}>
          <Text style={styles.notConfiguredTitle}>Passkeys aren’t set up yet</Text>
          <Text style={styles.notConfiguredBody}>
            Set PASSKEY_SIGNIN_FLOW_ID / PASSKEY_ADD_FLOW_ID (and your Descope
            Project ID) in src/config/index.ts. See the README “Passkeys setup”
            section.
          </Text>
        </View>
      ) : (
        <View style={styles.flowWrap}>
          {!ready && !error && (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.brand} />
              <Text style={styles.loadingText}>Preparing secure sign-in…</Text>
            </View>
          )}
          <FlowView
            style={styles.flow}
            flowOptions={{
              url: flowUrl,
              iosOAuthNativeProvider: 'apple',
              androidOAuthNativeProvider: 'google',
              oauthRedirectCustomScheme: AUTH_REDIRECT_URL,
            }}
            onReady={() => setReady(true)}
            onSuccess={async jwtResponse => {
              try {
                // Whether we were already signed in decides how we return:
                // already-in -> pop back to the Portal (stack won't swap);
                // fresh sign-in -> RootNavigator swaps on the new session.
                const hadSession = !!session?.refreshJwt;
                await manageSession(jwtResponse);
                if (!hadSession) {
                  await promptEnableBiometricLogin(jwtResponse.refreshJwt);
                }
                if (isAddMode) {
                  await markPasskeyAdded(jwtResponse.user?.userId ?? '');
                }
                if (hadSession) {
                  navigation.goBack();
                }
              } catch {
                setError(
                  isAddMode
                    ? 'Could not add your passkey.'
                    : 'Could not complete passkey sign-in.',
                );
              }
            }}
            onError={e =>
              setError(
                e.errorDescription ||
                  (isAddMode ? 'Could not add passkey.' : 'Passkey sign-in failed.'),
              )
            }
          />
        </View>
      )}

      <Text style={styles.hint} onPress={() => navigation.goBack()}>
        {isAddMode ? '← Back to the portal' : '← Back to other sign-in options'}
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  title: { ...typography.title, marginBottom: spacing.md },
  flowWrap: { flex: 1, borderRadius: radius.lg, overflow: 'hidden' },
  flow: { flex: 1 },
  loading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: { marginTop: spacing.sm, color: colors.textMuted },
  notConfigured: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  notConfiguredTitle: {
    ...typography.label,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  notConfiguredBody: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  hint: {
    textAlign: 'center',
    color: colors.brand,
    fontWeight: '600',
    paddingVertical: spacing.md,
  },
});

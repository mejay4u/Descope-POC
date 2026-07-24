import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlowView, useHostedFlowUrl, useSession } from '@descope/react-native-sdk';
import Banner from '../components/Banner';
import { promptEnableBiometricLogin } from '../auth/biometricStore';
import {
  AUTH_REDIRECT_URL,
  PASSKEY_FLOW_ID,
  isPasskeyConfigured,
} from '../config';
import { colors, radius, spacing, typography } from '../theme';
import type { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Passkey'>;

/**
 * Passkeys (WebAuthn) run through a Descope Flow — see PASSKEY_FLOW_ID in
 * src/config. The native SDK performs the platform passkey ceremony (Face ID
 * / Touch ID / fingerprint / security key) inside the flow, so no backend and
 * no native passkey module is needed. On success we activate the session and
 * offer to remember it for quick biometric sign-in, exactly like the
 * password/OTP paths.
 *
 * Requires a Flow with passkeys enabled plus domain association (iOS
 * Associated Domains + apple-app-site-association, Android assetlinks.json).
 * See the README "Passkeys setup" section.
 */
export default function PasskeyScreen({ navigation, route }: Props) {
  const configured = isPasskeyConfigured();
  const flowUrl = useHostedFlowUrl(PASSKEY_FLOW_ID);
  const { manageSession } = useSession();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title =
    route.params?.mode === 'signup'
      ? 'Register with a passkey'
      : 'Sign in with a passkey';

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Text style={styles.title}>{title}</Text>

      {!!error && <Banner variant="error">{error}</Banner>}

      {!configured ? (
        <View style={styles.notConfigured}>
          <Text style={styles.notConfiguredTitle}>Passkeys aren’t set up yet</Text>
          <Text style={styles.notConfiguredBody}>
            Set PASSKEY_FLOW_ID (and your Descope Project ID) in
            src/config/index.ts, then configure a passkey-enabled flow and
            domain association. See the README “Passkeys setup” section.
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
                await manageSession(jwtResponse);
                await promptEnableBiometricLogin(jwtResponse.refreshJwt);
                // Session listener in RootNavigator swaps to the Portal.
              } catch {
                setError('Could not complete passkey sign-in.');
              }
            }}
            onError={e =>
              setError(e.errorDescription || 'Passkey sign-in failed.')
            }
          />
        </View>
      )}

      <Text style={styles.hint} onPress={() => navigation.goBack()}>
        ← Back to other sign-in options
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

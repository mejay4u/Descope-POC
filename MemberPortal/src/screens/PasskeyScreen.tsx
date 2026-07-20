import React, { useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  FlowView,
  useHostedFlowUrl,
  useSession,
} from '@descope/react-native-sdk';
import Banner from '../components/Banner';
import { promptEnableBiometricLogin } from '../auth/biometricStore';
import { AUTH_REDIRECT_URL, PASSKEY_FLOW_ID } from '../config';
import { colors, spacing, typography } from '../theme';
import type { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Passkey'>;

/**
 * Passkeys (WebAuthn) run through a Descope Flow. The native SDK performs the
 * platform passkey ceremony (Face ID / Touch ID / fingerprint / security key)
 * inside the flow — no backend required.
 *
 * Requires: a Flow with passkeys enabled + Associated Domains (iOS) and
 * assetlinks.json (Android). See README "Passkeys setup".
 */
export default function PasskeyScreen({ navigation, route }: Props) {
  const flowUrl = useHostedFlowUrl(PASSKEY_FLOW_ID);
  const { manageSession } = useSession();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = route.params?.mode === 'signup' ? 'Register with a passkey' : 'Sign in with a passkey';

  return (
    <SafeAreaView style={styles.safe}>
      <Text style={styles.title}>{title}</Text>

      {!!error && <Banner variant="error">{error}</Banner>}

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
              // Session listener in App.tsx swaps to the Portal automatically.
            } catch {
              setError('Could not complete passkey sign-in.');
            }
          }}
          onError={e => setError(e.errorDescription || 'Passkey sign-in failed.')}
        />
      </View>

      <Text style={styles.hint} onPress={() => navigation.goBack()}>
        ← Back to other sign-in options
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  title: { ...typography.title, marginBottom: spacing.md },
  flowWrap: { flex: 1, borderRadius: 16, overflow: 'hidden' },
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
  hint: {
    textAlign: 'center',
    color: colors.brand,
    fontWeight: '600',
    paddingVertical: spacing.md,
  },
});

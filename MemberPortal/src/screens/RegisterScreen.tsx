import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlowView, useHostedFlowUrl } from '@descope/react-native-sdk';
import Banner from '../components/Banner';
import { useAuth } from '../auth/useAuth';
import { REGISTER_FLOW_ID, isRegistrationFlowConfigured } from '../config';
import { colors, spacing, typography } from '../theme';
import type { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

/**
 * Registration runs entirely as a **Descope Flow**, embedded here with
 * `FlowView`. The app collects nothing itself: the flow's own screens gather
 * the member's details, hold them in flow state, and the Descope engine calls
 * the BFF at each phase (see docs/dotnet-registration-api.md for the
 * server-side contract):
 *
 *   Phase 1  email, name, DOB, zip -> flow state; OTP emailed
 *   Phase 2  OTP verified, then `POST /api/initiateRegistration` creates the
 *            Pending member record; Descope then creates its passwordless,
 *            email-only shadow record
 *   Phase 3  password + confirmation posted to the BFF, which validates and
 *            stores it — Descope never holds it
 *   Phase 4  SSN / member info checked against Facets; subscriber and plan IDs
 *            come back and are mapped into custom JWT claims
 *
 * So this screen has exactly one job: run the flow and apply the enriched
 * session JWT it finishes with. Nothing here talks to the BFF directly —
 * those calls are server-to-server, from Descope.
 *
 * FlowView (rather than the browser-based `useFlow` the passkey screen uses)
 * keeps the member inside the app and hands the session back over its JS
 * bridge, so there's no redirect URL to register. The passkey screen needs the
 * browser for a different reason — native passkeys would need an Associated
 * Domains entitlement — which doesn't apply to a registration flow.
 */
export default function RegisterScreen({ navigation }: Props) {
  const { finishRegistration } = useAuth();
  const flowUrl = useHostedFlowUrl(REGISTER_FLOW_ID);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isRegistrationFlowConfigured()) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <Text style={styles.title}>Create an account</Text>
        <View style={styles.body}>
          <Text style={styles.bodyTitle}>Registration isn’t set up yet</Text>
          <Text style={styles.bodyText}>
            Build the registration flow in the Descope Console, then set
            REGISTER_FLOW_ID (and your Project ID) in src/config/index.ts. See
            the README’s “Registration flow setup” section.
          </Text>
        </View>
        <Text style={styles.hint} onPress={() => navigation.goBack()}>
          ← Back to sign in
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {!!error && <Banner variant="error">{error}</Banner>}

      <View style={styles.flowWrap}>
        <FlowView
          flowOptions={{ url: flowUrl }}
          style={styles.flow}
          onReady={() => setReady(true)}
          onSuccess={async jwt => {
            setError(null);
            // Applies the session and offers biometric enrollment. The session
            // listener in RootNavigator then swaps to the Portal.
            await finishRegistration(jwt);
          }}
          onError={e =>
            setError(e.errorDescription || e.errorMessage || 'Registration could not be completed.')
          }
        />
        {!ready && (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={colors.brand} />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flowWrap: { flex: 1 },
  flow: { flex: 1 },
  loading: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  title: { ...typography.title, margin: spacing.lg, marginBottom: spacing.md },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.lg },
  bodyTitle: {
    ...typography.label,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  bodyText: { color: colors.textMuted, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  hint: {
    textAlign: 'center',
    color: colors.brand,
    fontWeight: '600',
    paddingVertical: spacing.md,
  },
});

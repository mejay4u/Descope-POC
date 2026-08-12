import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlowView, useHostedFlowUrl } from '@descope/react-native-sdk';
import AppButton from '../components/AppButton';
import Banner from '../components/Banner';
import FingerprintIcon from '../components/icons/FingerprintIcon';
import { useAuth } from '../auth/useAuth';
import {
  biometryLabel,
  getSupportedBiometry,
  showBiometricUnavailableAlert,
} from '../auth/biometricStore';
import { isAnyDeviceTrusted } from '../auth/deviceTrust';
import {
  AUTH_REDIRECT_URL,
  DEVICE_TRUSTED_INPUT,
  SIGNIN_FLOW_ID,
  isSignInFlowConfigured,
} from '../config';
import { colors, spacing, typography } from '../theme';
import type { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'SignIn'>;

/**
 * Sign-in runs as a **Descope Flow**, embedded here with `FlowView`. The app
 * collects no credentials itself: the flow's own screens take the email and
 * password, decide whether an OTP is needed, and hand back a finished session.
 * See docs/descope-signin-flow-setup.md for how the flow is built.
 *
 *   Step 1  Screen: email + password
 *   Step 2  Action: Sign In / Password
 *   Step 3  Condition on the `deviceTrusted` client input
 *   Step 4  Untrusted device -> emailed OTP, verify-only (no user creation)
 *   Step 5  End, issuing a session JWT carrying the member's custom claims
 *
 * `FlowView` rather than the browser-based `useFlow` the passkey screen uses:
 * it keeps the member inside the app and returns the session over its JS
 * bridge, so there's no redirect URL involved. The passkey screen needs a
 * browser for an unrelated reason — see its header.
 *
 * Biometric sign-in is deliberately *outside* the flow. It's a local
 * `descope.refresh` against a Keychain-held token, so there is no flow to run
 * and no network round trip beyond the refresh itself.
 */
export default function SignInScreen({ navigation }: Props) {
  const { finishSignIn, signInWithBiometrics } = useAuth();
  const flowUrl = useHostedFlowUrl(SIGNIN_FLOW_ID);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bioName, setBioName] = useState('Biometrics');
  const [bioBusy, setBioBusy] = useState(false);
  /**
   * Undefined until read from the Keychain. The flow must not start before we
   * know this — starting with the wrong value would either demand an OTP the
   * member has already satisfied, or skip one they owe.
   */
  const [deviceTrusted, setDeviceTrusted] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    (async () => {
      const [supported, trusted] = await Promise.all([
        getSupportedBiometry(),
        // The flow renders its own email field, so at this point the app can't
        // know *who* is about to sign in — only whether this handset has ever
        // passed an OTP check. The per-member check happens after sign-in.
        isAnyDeviceTrusted(),
      ]);
      setBioName(biometryLabel(supported));
      setDeviceTrusted(trusted);
    })();
  }, []);

  const onBiometric = async () => {
    setError(null);
    setBioBusy(true);
    const result = await signInWithBiometrics();
    setBioBusy(false);
    if (result.ok) {
      return; // RootNavigator swaps to the Portal on the session change.
    }
    if (result.osUnavailable) {
      showBiometricUnavailableAlert(bioName, result.error);
      return;
    }
    if (result.notEnrolled) {
      setError(
        `${bioName} sign-in isn’t set up yet. Sign in with your password once and you’ll be offered it.`,
      );
      return;
    }
    setError(result.error);
  };

  if (!isSignInFlowConfigured()) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <Text style={styles.title}>Sign in</Text>
        <View style={styles.body}>
          <Text style={styles.bodyTitle}>Sign-in isn’t set up yet</Text>
          <Text style={styles.bodyText}>
            Build the sign-in flow in the Descope Console, then set SIGNIN_FLOW_ID
            (and your Project ID) in src/config/index.ts. See
            docs/descope-signin-flow-setup.md.
          </Text>
        </View>
        <Text style={styles.hint} onPress={() => navigation.goBack()}>
          ← Back
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {!!error && (
        <View style={styles.bannerWrap}>
          <Banner variant="error">{error}</Banner>
        </View>
      )}

      <View style={styles.flowWrap}>
        {deviceTrusted !== undefined && (
          <FlowView
            flowOptions={{
              url: flowUrl,
              // Read by a Condition step in the flow to decide whether to
              // demand an emailed OTP. Client-supplied — a UX optimisation,
              // not a security control. See src/auth/deviceTrust.ts.
              clientInputs: { [DEVICE_TRUSTED_INPUT]: deviceTrusted },
              // Only used if the flow ever falls back to a magic link; the
              // password/OTP path never leaves the embedded view.
              magicLinkRedirect: AUTH_REDIRECT_URL,
            }}
            style={styles.flow}
            onReady={() => setReady(true)}
            onSuccess={completed => {
              setError(null);
              // Applies the session, marks the device trusted and offers
              // biometric enrolment. RootNavigator then swaps to the Portal.
              finishSignIn(completed);
            }}
            onError={e =>
              setError(e.errorDescription || e.errorMessage || 'Sign-in could not be completed.')
            }
          />
        )}
        {(!ready || deviceTrusted === undefined) && (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={colors.brand} />
          </View>
        )}
      </View>

      <View style={styles.alt}>
        <AppButton
          label={`Sign in with ${bioName}`}
          variant="ghost"
          icon={<FingerprintIcon size={18} color={colors.brand} />}
          onPress={onBiometric}
          loading={bioBusy}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  bannerWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
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
  alt: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
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

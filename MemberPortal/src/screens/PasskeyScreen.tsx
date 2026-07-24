import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
// NOTE: useFlow is deprecated in favour of FlowView, but it's used here on
// purpose. useFlow runs the flow in a browser (ASWebAuthenticationSession), so
// passkeys are *web* passkeys on Descope's domain, needing no Associated
// Domains / native setup. FlowView bridges to *native* passkeys, which require
// the iOS Associated Domains entitlement + a hosted AASA — too much setup for
// this POC.
import { useFlow, useHostedFlowUrl, useSession } from '@descope/react-native-sdk';
import AppButton from '../components/AppButton';
import Banner from '../components/Banner';
import KeyIcon from '../components/icons/KeyIcon';
import { promptEnableBiometricLogin } from '../auth/biometricStore';
import {
  AUTH_REDIRECT_URL,
  PASSKEY_FLOW_ID,
  isPasskeyConfigured,
} from '../config';
import { colors, spacing, typography } from '../theme';

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
 * Passkeys (WebAuthn) run through a Descope Flow opened in a **browser**
 * (ASWebAuthenticationSession on iOS / Custom Tabs on Android) via useFlow —
 * see PASSKEY_FLOW_ID in src/config. Because the flow runs on Descope's own
 * hosted domain, the passkey is a *web* passkey tied to that domain, so the
 * app needs no Associated Domains entitlement, no hosted apple-app-site-
 * association, and no Team/bundle matching. On success we activate the session
 * and offer biometric sign-in, exactly like the password/OTP paths.
 *
 * Two modes:
 *   - 'signin' (default, from Login/Welcome) — unauthenticated sign-up-or-in.
 *     manageSession makes a session exist and RootNavigator swaps to the Portal.
 *   - 'signup' (from the Portal) — already signed in, so the flow runs
 *     authenticated and adds a passkey; we return to the Portal on success.
 *
 * Note: passkey creation is unreliable on the iOS Simulator regardless of
 * setup — test on a physical device.
 */
export default function PasskeyScreen({ navigation, route }: Props) {
  const isAddMode = route.params?.mode === 'signup';
  const configured = isPasskeyConfigured();
  const flowUrl = useHostedFlowUrl(PASSKEY_FLOW_ID);
  const flow = useFlow(); // deprecated but intentional — see file header note
  const { manageSession, session } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = isAddMode ? 'Add a passkey' : 'Sign in with a passkey';
  const cta = isAddMode ? 'Add a passkey' : 'Continue with a passkey';

  const runPasskeyFlow = async () => {
    setError(null);
    setBusy(true);
    try {
      // In add-mode the flow runs as the signed-in user (so it attaches a
      // passkey to their account rather than creating a new login).
      const authentication =
        isAddMode && session?.refreshJwt
          ? { flowId: PASSKEY_FLOW_ID, refreshJwt: session.refreshJwt }
          : undefined;
      // On iOS this resolves with the session when the browser flow finishes.
      // The deep link (AUTH_REDIRECT_URL) is used to return the result on
      // Android. See app.json / native URL scheme registration.
      const resp = await flow.start(
        flowUrl,
        AUTH_REDIRECT_URL,
        AUTH_REDIRECT_URL,
        authentication,
      );
      if (!resp.ok || !resp.data) {
        setError(
          resp.error?.errorDescription ||
            (isAddMode ? 'Could not add passkey.' : 'Passkey sign-in failed.'),
        );
        return;
      }
      await manageSession(resp.data);
      await promptEnableBiometricLogin(resp.data.refreshJwt);
      if (isAddMode) {
        // Already authenticated — RootNavigator won't switch stacks, so return
        // to the Portal ourselves. In sign-in mode it swaps automatically.
        navigation.goBack();
      }
    } catch (e) {
      const err = e as { message?: string } | undefined;
      setError(
        err?.message ||
          (isAddMode ? 'Could not add your passkey.' : 'Passkey sign-in failed.'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Text style={styles.title}>{title}</Text>

      {!!error && <Banner variant="error">{error}</Banner>}

      {!configured ? (
        <View style={styles.body}>
          <Text style={styles.bodyTitle}>Passkeys aren’t set up yet</Text>
          <Text style={styles.bodyText}>
            Set PASSKEY_FLOW_ID (and your Descope Project ID) in
            src/config/index.ts, then configure a passkey-enabled flow. See the
            README “Passkeys setup” section.
          </Text>
        </View>
      ) : (
        <View style={styles.body}>
          <Text style={styles.bodyText}>
            {isAddMode
              ? 'Add a passkey to sign in with Face ID, Touch ID, a fingerprint, or a security key — no password needed.'
              : 'Use a passkey — Face ID, Touch ID, a fingerprint, or a security key — to sign in without a password.'}
          </Text>
          <AppButton
            label={cta}
            icon={<KeyIcon size={18} color={colors.white} />}
            onPress={runPasskeyFlow}
            loading={busy}
            style={styles.cta}
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
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.sm },
  bodyTitle: {
    ...typography.label,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  bodyText: {
    color: colors.textMuted,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  cta: { marginTop: spacing.lg },
  hint: {
    textAlign: 'center',
    color: colors.brand,
    fontWeight: '600',
    paddingVertical: spacing.md,
  },
});

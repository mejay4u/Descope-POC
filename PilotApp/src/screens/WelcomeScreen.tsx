import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import AppButton from '../components/AppButton';
import Banner from '../components/Banner';
import FingerprintIcon from '../components/icons/FingerprintIcon';
import KeyIcon from '../components/icons/KeyIcon';
import { useBranding } from '../branding/BrandingContext';
import { useAuth } from '../auth/useAuth';
import {
  biometryLabel,
  getSupportedBiometry,
  showBiometricUnavailableAlert,
} from '../auth/biometricStore';
import { colors, spacing, typography } from '../theme';
import type { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'>;

/**
 * Every way into the app, gathered on one native screen.
 *
 * All three entry points live here rather than being spread across screens,
 * and biometrics in particular is here rather than on the sign-in screen for a
 * concrete reason: sign-in is an embedded web view, the app cannot position a
 * native control against content inside it, and `FlowView` reports no screen
 * changes — so a biometric button placed there stayed visible during the OTP
 * step, offering a shortcut to someone already halfway through a code. Here it
 * is native throughout and can't collide with the flow.
 *
 * There is no "Create Account" on purpose: this pilot is sign-in only. Members
 * are seeded in the Descope Console (Users → + User, with the four custom
 * attributes set). Registration is out of scope — see docs/architecture.md.
 */
export default function WelcomeScreen({ navigation }: Props) {
  const { appName, tagline, Logo } = useBranding();
  const { signInWithBiometrics } = useAuth();
  const heroAnim = useRef(new Animated.Value(0)).current;
  const actionsAnim = useRef(new Animated.Value(0)).current;
  const [bioName, setBioName] = useState('Biometrics');
  const [bioBusy, setBioBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Animated.stagger(120, [
      Animated.timing(heroAnim, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.timing(actionsAnim, { toValue: 1, duration: 420, useNativeDriver: true }),
    ]).start();
  }, [heroAnim, actionsAnim]);

  useEffect(() => {
    // Only labels the button — `getSupportedBiometry` never throws, so this
    // can't hold up the screen.
    getSupportedBiometry().then(supported => setBioName(biometryLabel(supported)));
  }, []);

  /**
   * The button is always shown, even before biometric sign-in is set up, so
   * members can discover the feature — `signInWithBiometrics` distinguishes
   * "not enrolled yet" from a genuine failure so each gets its own message.
   */
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

  return (
    <SafeAreaView style={styles.safe}>
      <Animated.View
        style={[
          styles.hero,
          {
            opacity: heroAnim,
            transform: [
              {
                translateY: heroAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [16, 0],
                }),
              },
            ],
          },
        ]}>
        <Animated.View style={styles.logoWrap}>
          <Logo size={88} />
        </Animated.View>
        <Text style={styles.title}>{appName}</Text>
        <Text style={styles.subtitle}>{tagline}</Text>
      </Animated.View>

      <Animated.View
        style={[
          styles.actions,
          {
            opacity: actionsAnim,
            transform: [
              {
                translateY: actionsAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [16, 0],
                }),
              },
            ],
          },
        ]}>
        {!!error && (
          <View style={styles.bannerWrap}>
            <Banner variant="error">{error}</Banner>
          </View>
        )}
        <AppButton
          label="Sign In"
          onPress={() => navigation.navigate('SignIn')}
          variant="primary"
          style={styles.actionSpacing}
        />
        <AppButton
          label="Sign in with a passkey"
          onPress={() => navigation.navigate('Passkey', { mode: 'signin' })}
          variant="secondary"
          icon={<KeyIcon size={18} color={colors.brand} />}
          style={styles.actionSpacing}
        />
        <AppButton
          label={`Sign in with ${bioName}`}
          onPress={onBiometric}
          variant="ghost"
          icon={<FingerprintIcon size={18} color={colors.brand} />}
          loading={bioBusy}
        />
      </Animated.View>

      <Text style={styles.footer}>
        By continuing you agree to the Terms and Privacy Policy.
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  hero: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  logoWrap: { marginBottom: spacing.lg },
  title: { ...typography.title, textAlign: 'center' },
  subtitle: {
    ...typography.subtitle,
    textAlign: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  actions: { paddingBottom: spacing.md },
  actionSpacing: { marginBottom: spacing.sm },
  bannerWrap: { marginBottom: spacing.sm },
  footer: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 12,
    paddingBottom: spacing.lg,
  },
});

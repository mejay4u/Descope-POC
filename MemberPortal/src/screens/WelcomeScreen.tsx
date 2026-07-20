import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import AppButton from '../components/AppButton';
import PasskeyIcon from '../components/icons/PasskeyIcon';
import FingerprintIcon from '../components/icons/FingerprintIcon';
import { useBranding } from '../branding/BrandingContext';
import { useAuth } from '../auth/useAuth';
import {
  biometryLabel,
  getSupportedBiometry,
  hasBiometricLogin,
} from '../auth/biometricStore';
import { colors, spacing, typography } from '../theme';
import type { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'>;

export default function WelcomeScreen({ navigation }: Props) {
  const { signInWithBiometrics } = useAuth();
  const { appName, tagline, Logo } = useBranding();
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioName, setBioName] = useState('Biometrics');
  const [busy, setBusy] = useState(false);
  const heroAnim = useRef(new Animated.Value(0)).current;
  const actionsAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    (async () => {
      const [enrolled, supported] = await Promise.all([
        hasBiometricLogin(),
        getSupportedBiometry(),
      ]);
      setBioAvailable(enrolled && !!supported);
      setBioName(biometryLabel(supported));
    })();
  }, []);

  useEffect(() => {
    Animated.stagger(120, [
      Animated.timing(heroAnim, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.timing(actionsAnim, { toValue: 1, duration: 420, useNativeDriver: true }),
    ]).start();
  }, [heroAnim, actionsAnim]);

  const onBiometric = async () => {
    setBusy(true);
    const res = await signInWithBiometrics();
    setBusy(false);
    if (!res.ok) {
      setBioAvailable(await hasBiometricLogin());
    }
    // On success the session listener swaps to the Portal automatically.
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
        <View style={styles.logoWrap}>
          <Logo size={88} />
        </View>
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
        <AppButton
          label="Sign In"
          onPress={() => navigation.navigate('Login')}
          variant="primary"
          style={styles.actionSpacing}
        />
        <AppButton
          label="Create Account"
          onPress={() => navigation.navigate('Register')}
          variant="secondary"
          style={styles.actionSpacing}
        />

        <View style={styles.dividerRow}>
          <View style={styles.line} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.line} />
        </View>

        <AppButton
          label="Sign in with a passkey"
          variant="secondary"
          icon={<PasskeyIcon size={18} color={colors.brand} />}
          onPress={() => navigation.navigate('Passkey', { mode: 'signin' })}
          style={bioAvailable ? styles.actionSpacing : undefined}
        />

        {bioAvailable && (
          <AppButton
            label={`Sign in with ${bioName}`}
            variant="secondary"
            icon={<FingerprintIcon size={18} color={colors.brand} />}
            onPress={onBiometric}
            loading={busy}
          />
        )}
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
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.sm,
  },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { marginHorizontal: spacing.sm, color: colors.textMuted, fontSize: 13 },
  footer: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 12,
    paddingBottom: spacing.lg,
  },
});

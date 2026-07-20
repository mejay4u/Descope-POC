import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import AppButton from '../components/AppButton';
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
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioName, setBioName] = useState('Biometrics');
  const [busy, setBusy] = useState(false);

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
      <View style={styles.hero}>
        <View style={styles.logo}>
          <Text style={styles.logoMark}>M</Text>
        </View>
        <Text style={styles.title}>Member Portal</Text>
        <Text style={styles.subtitle}>
          Secure access to your membership, powered by Descope.
        </Text>
      </View>

      <View style={styles.actions}>
        <AppButton
          label="Sign In"
          onPress={() => navigation.navigate('Login')}
          variant="primary"
        />
        <View style={{ height: spacing.sm }} />
        <AppButton
          label="Create Account"
          onPress={() => navigation.navigate('Register')}
          variant="secondary"
        />

        {bioAvailable && (
          <>
            <View style={{ height: spacing.md }} />
            <AppButton
              label={`Sign in with ${bioName}`}
              onPress={onBiometric}
              variant="ghost"
              loading={busy}
            />
          </>
        )}
      </View>

      <Text style={styles.footer}>
        By continuing you agree to the Terms and Privacy Policy.
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  hero: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  logo: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  logoMark: { color: colors.white, fontSize: 44, fontWeight: '800' },
  title: { ...typography.title, textAlign: 'center' },
  subtitle: {
    ...typography.subtitle,
    textAlign: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  actions: { paddingBottom: spacing.md },
  footer: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 12,
    paddingBottom: spacing.lg,
  },
});

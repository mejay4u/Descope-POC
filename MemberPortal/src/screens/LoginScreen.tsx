import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import TextField from '../components/TextField';
import AppButton from '../components/AppButton';
import Banner from '../components/Banner';
import CheckIcon from '../components/icons/CheckIcon';
import EyeIcon from '../components/icons/EyeIcon';
import FingerprintIcon from '../components/icons/FingerprintIcon';
import { useBranding } from '../branding/BrandingContext';
import { useAuth } from '../auth/useAuth';
import {
  biometryLabel,
  getSupportedBiometry,
  hasBiometricLogin,
} from '../auth/biometricStore';
import {
  clearRememberedEmail,
  getRememberedEmail,
  saveRememberedEmail,
} from '../auth/rememberedEmail';
import { colors, spacing, typography } from '../theme';
import type { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const { signInWithEmail, signInWithBiometrics, requestPasswordReset } = useAuth();
  const { Logo } = useBranding();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioName, setBioName] = useState('Biometrics');
  const [bioBusy, setBioBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [enrolled, supported, rememberedEmail] = await Promise.all([
        hasBiometricLogin(),
        getSupportedBiometry(),
        getRememberedEmail(),
      ]);
      setBioAvailable(enrolled && !!supported);
      setBioName(biometryLabel(supported));
      if (rememberedEmail) {
        setEmail(rememberedEmail);
        setRemember(true);
      }
    })();
  }, []);

  const onSubmit = async () => {
    setError(null);
    setResetSent(false);
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setBusy(true);
    const res = await signInWithEmail(email.trim(), password);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (remember) {
      await saveRememberedEmail(email.trim());
    } else {
      await clearRememberedEmail();
    }
    // Success is handled by the session listener in App.tsx.
  };

  const onForgotPassword = async () => {
    setError(null);
    setResetSent(false);
    if (!email.trim()) {
      setError('Enter your email above to reset your password.');
      return;
    }
    setResetBusy(true);
    const res = await requestPasswordReset(email.trim());
    setResetBusy(false);
    if (!res.ok) {
      setError(res.error);
    } else {
      setResetSent(true);
    }
  };

  const onBiometric = async () => {
    setError(null);
    setResetSent(false);
    setBioBusy(true);
    const res = await signInWithBiometrics();
    setBioBusy(false);
    if (!res.ok) {
      setError(res.error);
      setBioAvailable(await hasBiometricLogin());
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          <View style={styles.logoWrap}>
            <Logo size={56} />
          </View>
          <Text style={styles.title}>Sign in</Text>

          {!!error && <Banner variant="error">{error}</Banner>}

          {resetSent && (
            <Banner variant="success">
              Password reset email sent — check {email.trim()} for instructions.
            </Banner>
          )}

          <View style={styles.form}>
            <TextField
              label="Email address"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="username"
            />
            <TextField
              label="Password"
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              textContentType="password"
              rightElement={
                <Pressable onPress={() => setShowPassword(v => !v)} hitSlop={8}>
                  <EyeIcon visible={showPassword} size={20} color={colors.textMuted} />
                </Pressable>
              }
            />

            <View style={styles.optionsRow}>
              <Pressable style={styles.rememberRow} onPress={() => setRemember(v => !v)}>
                <View style={[styles.checkbox, remember && styles.checkboxChecked]}>
                  {remember && <CheckIcon size={12} color={colors.white} />}
                </View>
                <Text style={styles.rememberText}>Remember username</Text>
              </Pressable>
              <Text style={styles.forgotLink} onPress={onForgotPassword}>
                {resetBusy ? 'Sending…' : 'Forgot password?'}
              </Text>
            </View>

            <AppButton
              label="Sign In"
              onPress={onSubmit}
              loading={busy}
              style={bioAvailable ? styles.actionSpacing : undefined}
            />

            {bioAvailable && (
              <AppButton
                label={`Sign in with ${bioName}`}
                variant="secondary"
                icon={<FingerprintIcon size={18} color={colors.brand} />}
                onPress={onBiometric}
                loading={bioBusy}
              />
            )}
          </View>

          <View style={styles.dividerRow}>
            <View style={styles.line} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.line} />
          </View>

          <AppButton
            label="Register"
            variant="secondary"
            onPress={() => navigation.navigate('Register')}
          />

          <Text style={styles.footer}>
            By signing in you agree to our Terms & Privacy Policy.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  logoWrap: { alignItems: 'center', marginBottom: spacing.md },
  title: { ...typography.title, textAlign: 'center', marginBottom: spacing.lg },
  form: { marginBottom: spacing.md },
  optionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  rememberRow: { flexDirection: 'row', alignItems: 'center' },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
  },
  checkboxChecked: { backgroundColor: colors.brand, borderColor: colors.brand },
  rememberText: { color: colors.textMuted, fontSize: 13 },
  forgotLink: { color: colors.brand, fontWeight: '600', fontSize: 13 },
  actionSpacing: { marginBottom: spacing.sm },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { marginHorizontal: spacing.sm, color: colors.textMuted, fontSize: 13 },
  footer: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.lg,
  },
});

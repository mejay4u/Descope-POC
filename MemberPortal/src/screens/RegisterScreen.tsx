import React, { useState } from 'react';
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
import SocialButton, { type SocialProvider } from '../components/SocialButton';
import { useAuth } from '../auth/useAuth';
import { useOAuthDeepLink } from '../auth/useOAuthDeepLink';
import { colors, spacing, typography } from '../theme';
import type { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterScreen({ navigation }: Props) {
  const { signUpWithEmail, signInWithOAuth } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [social, setSocial] = useState<SocialProvider | null>(null);

  useOAuthDeepLink({ onError: setError });

  const onSubmit = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Please enter your name.');
      return;
    }
    if (!emailRe.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    const res = await signUpWithEmail(name.trim(), email.trim(), password);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
    }
  };

  const onSocial = async (provider: SocialProvider) => {
    setError(null);
    setSocial(provider);
    const res = await signInWithOAuth(provider);
    setSocial(null);
    if (!res.ok) {
      setError(res.error);
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
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>Join the Member Portal in seconds.</Text>

          {!!error && (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>{error}</Text>
            </View>
          )}

          <View style={styles.form}>
            <TextField
              label="Full name"
              placeholder="Jane Member"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              textContentType="name"
            />
            <TextField
              label="Email"
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
              placeholder="At least 8 characters"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="newPassword"
            />

            <AppButton label="Create Account" onPress={onSubmit} loading={busy} />

            <Pressable
              style={styles.passkeyLink}
              onPress={() => navigation.navigate('Passkey', { mode: 'signup' })}>
              <Text style={styles.passkeyText}>Register with a passkey</Text>
            </Pressable>
          </View>

          <View style={styles.dividerRow}>
            <View style={styles.line} />
            <Text style={styles.dividerText}>or sign up with</Text>
            <View style={styles.line} />
          </View>

          <SocialButton
            provider="apple"
            onPress={onSocial}
            loading={social === 'apple'}
            disabled={!!social}
          />
          <SocialButton
            provider="microsoft"
            onPress={onSocial}
            loading={social === 'microsoft'}
            disabled={!!social}
          />
          <SocialButton
            provider="google"
            onPress={onSocial}
            loading={social === 'google'}
            disabled={!!social}
          />

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Already a member? </Text>
            <Pressable onPress={() => navigation.navigate('Login')}>
              <Text style={styles.footerLink}>Sign in</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { ...typography.title },
  subtitle: { ...typography.subtitle, marginTop: spacing.xs, marginBottom: spacing.lg },
  banner: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  bannerText: { color: colors.danger, fontSize: 14 },
  form: { marginBottom: spacing.md },
  passkeyLink: { alignSelf: 'center', paddingVertical: spacing.md },
  passkeyText: { color: colors.brand, fontWeight: '600', fontSize: 15 },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.md,
  },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { marginHorizontal: spacing.sm, color: colors.textMuted, fontSize: 13 },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  footerText: { color: colors.textMuted, fontSize: 15 },
  footerLink: { color: colors.brand, fontWeight: '700', fontSize: 15 },
});

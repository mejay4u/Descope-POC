import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import TextField from '../components/TextField';
import AppButton from '../components/AppButton';
import MethodTile from '../components/MethodTile';
import AppleIcon from '../components/icons/AppleIcon';
import MicrosoftIcon from '../components/icons/MicrosoftIcon';
import GoogleIcon from '../components/icons/GoogleIcon';
import MagicLinkIcon from '../components/icons/MagicLinkIcon';
import PasskeyIcon from '../components/icons/PasskeyIcon';
import { useAuth, type SocialProvider } from '../auth/useAuth';
import { useAuthDeepLink } from '../auth/useAuthDeepLink';
import { colors, spacing, typography } from '../theme';
import type { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;
type Method = SocialProvider | 'magiclink';

export default function LoginScreen({ navigation }: Props) {
  const { signInWithEmail, signInWithOAuth, signInWithMagicLink } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState<Method | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  useAuthDeepLink({ onError: setError });

  const onSubmit = async () => {
    setError(null);
    setMagicLinkSent(false);
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setBusy(true);
    const res = await signInWithEmail(email.trim(), password);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
    }
    // Success is handled by the session listener in App.tsx.
  };

  const onSocial = async (provider: SocialProvider) => {
    setError(null);
    setMagicLinkSent(false);
    setMethod(provider);
    const res = await signInWithOAuth(provider);
    setMethod(null);
    if (!res.ok) {
      setError(res.error);
    }
  };

  const onMagicLink = async () => {
    setError(null);
    setMagicLinkSent(false);
    if (!email.trim()) {
      setError('Enter your email above to receive a magic link.');
      return;
    }
    setMethod('magiclink');
    const res = await signInWithMagicLink(email.trim());
    setMethod(null);
    if (!res.ok) {
      setError(res.error);
    } else {
      setMagicLinkSent(true);
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
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in to your Member Portal.</Text>

          {!!error && (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>{error}</Text>
            </View>
          )}

          {magicLinkSent && (
            <View style={styles.successBanner}>
              <Text style={styles.successText}>
                Magic link sent — check {email.trim()} to finish signing in.
              </Text>
            </View>
          )}

          <View style={styles.form}>
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
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="password"
            />

            <AppButton label="Sign In" onPress={onSubmit} loading={busy} />
          </View>

          <View style={styles.dividerRow}>
            <View style={styles.line} />
            <Text style={styles.dividerText}>or continue with</Text>
            <View style={styles.line} />
          </View>

          <View style={styles.methodGrid}>
            <MethodTile
              icon={<AppleIcon size={18} color={colors.text} />}
              label="Apple"
              onPress={() => onSocial('apple')}
              loading={method === 'apple'}
              disabled={!!method}
            />
            <MethodTile
              icon={<GoogleIcon size={18} />}
              label="Google"
              onPress={() => onSocial('google')}
              loading={method === 'google'}
              disabled={!!method}
            />
            <MethodTile
              icon={<MicrosoftIcon size={18} />}
              label="Microsoft"
              onPress={() => onSocial('microsoft')}
              loading={method === 'microsoft'}
              disabled={!!method}
            />
            <MethodTile
              icon={<MagicLinkIcon size={18} color={colors.brand} />}
              label="Magic Link"
              onPress={onMagicLink}
              loading={method === 'magiclink'}
              disabled={!!method}
            />
          </View>

          <AppButton
            label="Sign in with a passkey"
            variant="secondary"
            icon={<PasskeyIcon size={18} color={colors.brand} />}
            onPress={() => navigation.navigate('Passkey', { mode: 'signin' })}
            disabled={!!method}
            style={styles.passkeyButton}
          />

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>New here? </Text>
            <Text
              style={styles.footerLink}
              onPress={() => navigation.navigate('Register')}>
              Create an account
            </Text>
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
  successBanner: {
    backgroundColor: colors.brandSoft,
    borderColor: colors.brand,
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  successText: { color: colors.brandDark, fontSize: 14, fontWeight: '600' },
  form: { marginBottom: spacing.md },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.md,
  },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { marginHorizontal: spacing.sm, color: colors.textMuted, fontSize: 13 },
  methodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  passkeyButton: { marginTop: spacing.xs, marginBottom: spacing.md },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  footerText: { color: colors.textMuted, fontSize: 15 },
  footerLink: { color: colors.brand, fontWeight: '700', fontSize: 15 },
});

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
import Banner from '../components/Banner';
import MethodTile from '../components/MethodTile';
import AppleIcon from '../components/icons/AppleIcon';
import MicrosoftIcon from '../components/icons/MicrosoftIcon';
import GoogleIcon from '../components/icons/GoogleIcon';
import FacebookIcon from '../components/icons/FacebookIcon';
import MagicLinkIcon from '../components/icons/MagicLinkIcon';
import WhatsAppIcon from '../components/icons/WhatsAppIcon';
import PasskeyIcon from '../components/icons/PasskeyIcon';
import { useAuth, type SocialProvider } from '../auth/useAuth';
import { useAuthDeepLink } from '../auth/useAuthDeepLink';
import { colors, spacing, typography } from '../theme';
import type { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;
type Method = SocialProvider | 'magiclink';

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterScreen({ navigation }: Props) {
  const { signUpWithEmail, signInWithOAuth, signUpWithMagicLink } = useAuth();
  const [name, setName] = useState('');
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
    if (!name.trim()) {
      setError('Please enter your name.');
      return;
    }
    if (!emailRe.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    setMethod('magiclink');
    const res = await signUpWithMagicLink(name.trim(), email.trim());
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
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>Join the Member Portal in seconds.</Text>

          {!!error && <Banner variant="error">{error}</Banner>}

          {magicLinkSent && (
            <Banner variant="success">
              Magic link sent — check {email.trim()} to finish creating your account.
            </Banner>
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
          </View>

          <View style={styles.dividerRow}>
            <View style={styles.line} />
            <Text style={styles.dividerText}>or sign up with</Text>
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
              icon={<FacebookIcon size={18} />}
              label="Facebook"
              onPress={() => onSocial('facebook')}
              loading={method === 'facebook'}
              disabled={!!method}
            />
            <MethodTile
              icon={<MagicLinkIcon size={18} color={colors.brand} />}
              label="Magic Link"
              onPress={onMagicLink}
              loading={method === 'magiclink'}
              disabled={!!method}
            />
            <MethodTile
              icon={<WhatsAppIcon size={18} />}
              label="WhatsApp"
              onPress={() => navigation.navigate('WhatsApp')}
              disabled={!!method}
            />
          </View>

          <AppButton
            label="Register with a passkey"
            variant="secondary"
            icon={<PasskeyIcon size={18} color={colors.brand} />}
            onPress={() => navigation.navigate('Passkey', { mode: 'signup' })}
            disabled={!!method}
            style={styles.passkeyButton}
          />

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Already a member? </Text>
            <Text style={styles.footerLink} onPress={() => navigation.navigate('Login')}>
              Sign in
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

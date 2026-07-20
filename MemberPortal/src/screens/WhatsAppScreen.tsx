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
import { useAuth } from '../auth/useAuth';
import { colors, spacing, typography } from '../theme';
import type { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'WhatsApp'>;
type Step = 'phone' | 'code';

// Matches Descope's own phone validation: a leading "+", then 4-15 digits.
const phoneRe = /^\+[1-9]\d{6,14}$/;

/**
 * WhatsApp sign-in: a phone number gets a one-time code over WhatsApp
 * (`otp.signUpOrIn.whatsapp`), then the code is exchanged for a session
 * (`otp.verify.whatsapp`). Works for both new and returning members.
 */
export default function WhatsAppScreen({ navigation }: Props) {
  const { sendWhatsAppOtp, verifyWhatsAppOtp } = useAuth();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSendCode = async () => {
    setError(null);
    if (!phoneRe.test(phone.trim())) {
      setError('Enter your phone number in international format, e.g. +14155551234.');
      return;
    }
    setBusy(true);
    const res = await sendWhatsAppOtp(phone.trim());
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setStep('code');
  };

  const onVerify = async () => {
    setError(null);
    if (code.trim().length < 4) {
      setError('Enter the code you received on WhatsApp.');
      return;
    }
    setBusy(true);
    const res = await verifyWhatsAppOtp(phone.trim(), code.trim());
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
    }
    // Success is handled by the session listener in App.tsx.
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>
            {step === 'phone' ? 'Sign in with WhatsApp' : 'Enter your code'}
          </Text>
          <Text style={styles.subtitle}>
            {step === 'phone'
              ? "We'll send a one-time code to your WhatsApp."
              : `We sent a code to ${phone.trim()}.`}
          </Text>

          {!!error && (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>{error}</Text>
            </View>
          )}

          {step === 'phone' ? (
            <>
              <TextField
                label="Phone number"
                placeholder="+14155551234"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                autoComplete="tel"
              />
              <AppButton label="Send code" onPress={onSendCode} loading={busy} />
            </>
          ) : (
            <>
              <TextField
                label="Verification code"
                placeholder="123456"
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
              />
              <AppButton label="Verify & Sign In" onPress={onVerify} loading={busy} />
              <Text
                style={styles.linkText}
                onPress={() => {
                  setStep('phone');
                  setCode('');
                  setError(null);
                }}>
                Use a different number
              </Text>
            </>
          )}

          <Text style={styles.hint} onPress={() => navigation.goBack()}>
            ← Back to other sign-in options
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
  linkText: {
    textAlign: 'center',
    color: colors.brand,
    fontWeight: '600',
    fontSize: 14,
    paddingVertical: spacing.md,
  },
  hint: {
    textAlign: 'center',
    color: colors.textMuted,
    fontWeight: '600',
    paddingVertical: spacing.md,
  },
});

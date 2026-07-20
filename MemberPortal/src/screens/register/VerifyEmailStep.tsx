import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { JWTResponse } from '@descope/core-js-sdk';
import AppButton from '../../components/AppButton';
import type { AuthResult, VerifyResult } from '../../auth/useAuth';
import { colors, radius, spacing } from '../../theme';
import { sharedStyles } from './styles';

const CODE_LENGTH = 6;
const RESEND_COOLDOWN = 30;

type Props = {
  email: string;
  verifyCode: (email: string, code: string) => Promise<VerifyResult>;
  resend: () => Promise<AuthResult>;
  onVerified: (jwt: JWTResponse) => void;
  onError: (message: string) => void;
};

export default function VerifyEmailStep({ email, verifyCode, resend, onVerified, onError }: Props) {
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const inputs = useRef<Array<TextInput | null>>([]);

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const code = digits.join('');

  const submit = async (fullCode: string) => {
    setBusy(true);
    const res = await verifyCode(email, fullCode);
    setBusy(false);
    if (!res.ok) {
      onError(res.error);
      return;
    }
    onVerified(res.jwt);
  };

  const onDigitChange = (index: number, value: string) => {
    const clean = value.replace(/[^0-9]/g, '').slice(-1);
    const next = [...digits];
    next[index] = clean;
    setDigits(next);
    if (clean && index < CODE_LENGTH - 1) {
      inputs.current[index + 1]?.focus();
    }
    const joined = next.join('');
    if (joined.length === CODE_LENGTH) {
      submit(joined);
    }
  };

  const onKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const onResend = async () => {
    setDigits(Array(CODE_LENGTH).fill(''));
    setCooldown(RESEND_COOLDOWN);
    const res = await resend();
    if (!res.ok) {
      onError(res.error);
    }
  };

  return (
    <View>
      <Text style={sharedStyles.title}>Check your email</Text>
      <Text style={sharedStyles.subtitle}>
        We sent a {CODE_LENGTH}-digit code to {email}. Check your spam folder if you don't see
        it.
      </Text>

      <View style={styles.codeRow}>
        {digits.map((digit, i) => (
          <TextInput
            key={i}
            ref={r => {
              inputs.current[i] = r;
            }}
            value={digit}
            onChangeText={value => onDigitChange(i, value)}
            onKeyPress={({ nativeEvent }) => onKeyPress(i, nativeEvent.key)}
            keyboardType="number-pad"
            maxLength={1}
            style={styles.codeBox}
            textAlign="center"
          />
        ))}
      </View>

      <AppButton
        label="Verify"
        onPress={() => submit(code)}
        loading={busy}
        disabled={code.length < CODE_LENGTH}
        style={sharedStyles.actionSpacing}
      />

      <Text style={styles.resendText}>
        {cooldown > 0 ? (
          `Resend code in ${cooldown}s`
        ) : (
          <Text style={sharedStyles.footerLink} onPress={onResend}>
            Resend code
          </Text>
        )}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  codeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  codeBox: {
    width: 46,
    height: 56,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.surface,
  },
  resendText: { textAlign: 'center', color: colors.textMuted, fontSize: 14 },
});

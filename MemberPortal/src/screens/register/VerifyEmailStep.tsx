import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import AppButton from '../../components/AppButton';
import { maskEmail } from '../../utils/maskEmail';
import { colors, radius, spacing } from '../../theme';
import { sharedStyles } from './styles';

const CODE_LENGTH = 6;
const RESEND_COOLDOWN = 30;

type Props = {
  email: string;
  /** Submits the code into the flow. */
  onSubmit: (code: string) => void;
  /** Asks the flow to send another code (its own interaction, not a re-submit). */
  onResend: () => void;
  busy: boolean;
};

export default function VerifyEmailStep({ email, onSubmit, onResend, busy }: Props) {
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
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

  const submit = (fullCode: string) => {
    if (!busy) {
      onSubmit(fullCode);
    }
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

  const resendCode = () => {
    setDigits(Array(CODE_LENGTH).fill(''));
    setCooldown(RESEND_COOLDOWN);
    onResend();
  };

  return (
    <View>
      <Text style={sharedStyles.title}>Check your email</Text>
      <Text style={sharedStyles.subtitle}>
        We sent a {CODE_LENGTH}-digit code to {maskEmail(email)}. Check your spam folder if you
        don't see it.
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
          <Text style={sharedStyles.footerLink} onPress={resendCode}>
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

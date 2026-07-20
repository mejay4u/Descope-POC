import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import TextField from '../../components/TextField';
import AppButton from '../../components/AppButton';
import CheckIcon from '../../components/icons/CheckIcon';
import type { PasswordPolicy } from '../../auth/useAuth';
import { colors, spacing } from '../../theme';
import { sharedStyles } from './styles';

// Descope's policy only defines a minimum length; this is our own client-side
// cap on how long a password can be (also enforced via the input's maxLength).
const MAX_LENGTH = 20;

type Props = {
  email: string;
  policy: PasswordPolicy;
  onCreateAccount: (password: string) => void;
  busy: boolean;
};

export default function SetPasswordStep({ email, policy, onCreateAccount, busy }: Props) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // The checklist is generated from the live Descope policy (fetched in
  // RegisterScreen), so it can never drift from what the server enforces.
  const rules = useMemo(() => {
    const list = [
      {
        label: `Must be between ${policy.minLength} and ${MAX_LENGTH} characters`,
        valid: password.length >= policy.minLength && password.length <= MAX_LENGTH,
      },
    ];
    if (policy.lowercase) {
      list.push({ label: 'At least one lowercase letter (a–z)', valid: /[a-z]/.test(password) });
    }
    if (policy.uppercase) {
      list.push({ label: 'At least one uppercase letter (A–Z)', valid: /[A-Z]/.test(password) });
    }
    if (policy.number) {
      list.push({ label: 'At least one numeric digit (0–9)', valid: /[0-9]/.test(password) });
    }
    if (policy.nonAlphanumeric) {
      list.push({
        label: 'At least one special character (e.g., @, #, $, !, %)',
        valid: /[^A-Za-z0-9]/.test(password),
      });
    }
    return list;
  }, [policy, password]);

  const allValid = rules.every(r => r.valid);
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

  return (
    <View>
      <Text style={sharedStyles.title}>Set a strong password</Text>
      <Text style={sharedStyles.subtitle}>Set a strong password to secure your account.</Text>

      <TextField label="Email / User ID" value={email} editable={false} />
      <Text style={styles.hintText}>This email is your User ID and will be used to log in.</Text>

      <TextField
        label="Create password"
        placeholder="Enter a password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="newPassword"
        maxLength={MAX_LENGTH}
      />
      <TextField
        label="Confirm password"
        placeholder="Re-enter your password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        textContentType="newPassword"
        maxLength={MAX_LENGTH}
        errorText={
          confirmPassword.length > 0 && !passwordsMatch ? "Passwords don't match" : undefined
        }
      />

      <View style={styles.checklist}>
        <Text style={sharedStyles.reviewSection}>Password must contain:</Text>
        {rules.map(rule => (
          <View key={rule.label} style={styles.checklistRow}>
            <View style={[styles.checklistDot, rule.valid && styles.checklistDotDone]}>
              {rule.valid && <CheckIcon size={12} color={colors.white} />}
            </View>
            <Text style={styles.checklistLabel}>{rule.label}</Text>
          </View>
        ))}
      </View>

      <AppButton
        label="Create account"
        onPress={() => onCreateAccount(password)}
        loading={busy}
        disabled={!allValid || !passwordsMatch}
        style={sharedStyles.actionSpacing}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hintText: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },
  checklist: { marginBottom: spacing.lg },
  checklistRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
  checklistDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  checklistDotDone: { backgroundColor: colors.success, borderColor: colors.success },
  checklistLabel: { flex: 1, color: colors.textMuted, fontSize: 13 },
});

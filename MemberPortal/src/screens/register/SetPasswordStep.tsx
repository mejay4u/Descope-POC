import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import TextField from '../../components/TextField';
import AppButton from '../../components/AppButton';
import CheckIcon from '../../components/icons/CheckIcon';
import { colors, spacing } from '../../theme';
import { sharedStyles } from './styles';
import type { PasswordPolicy } from './types';

type Props = {
  email: string;
  policy: PasswordPolicy;
  /** Sends both values to the API, which validates and creates the account. */
  onCreateAccount: (password: string, confirmPassword: string) => void;
  busy: boolean;
};

/** Strength is derived from the same rules the checklist shows, plus length. */
type Strength = { label: string; color: string; fraction: number };

function strengthOf(password: string, satisfied: number, total: number, policy: PasswordPolicy): Strength {
  if (password.length === 0) {
    return { label: '', color: colors.border, fraction: 0 };
  }
  // Meeting every rule is the floor, not the ceiling — length beyond the
  // minimum is what actually makes a password hard to guess, so a password
  // only reads as Strong once it's comfortably past the minimum.
  const ruleScore = satisfied / total;
  const lengthBonus = Math.min(1, password.length / (policy.minLength + 6));
  const score = ruleScore * 0.6 + lengthBonus * 0.4;

  if (score >= 0.95) {
    return { label: 'Strong', color: colors.success, fraction: 1 };
  }
  if (score >= 0.65) {
    return { label: 'Medium', color: colors.warning, fraction: 0.66 };
  }
  return { label: 'Weak', color: colors.danger, fraction: 0.33 };
}

export default function SetPasswordStep({ email, policy, onCreateAccount, busy }: Props) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // The checklist mirrors the policy the API enforces — it's guidance while
  // typing, not the validation itself.
  const rules = useMemo(() => {
    const list = [
      {
        label: `Must be between ${policy.minLength} to ${policy.maxLength} characters`,
        valid: password.length >= policy.minLength && password.length <= policy.maxLength,
      },
    ];
    if (policy.uppercase) {
      list.push({ label: 'At least one uppercase letter (A–Z)', valid: /[A-Z]/.test(password) });
    }
    if (policy.lowercase) {
      list.push({ label: 'At least one lowercase letter (a–z)', valid: /[a-z]/.test(password) });
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

  const satisfied = rules.filter(r => r.valid).length;
  const allValid = satisfied === rules.length;
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const strength = strengthOf(password, satisfied, rules.length, policy);

  return (
    <View>
      <Text style={sharedStyles.title}>Set a strong password to secure your account</Text>

      <TextField label="Email / User ID" value={email} editable={false} />
      <Text style={styles.hintText}>This email is your User ID and will be used to log in.</Text>

      <TextField
        label="Create Password"
        placeholder="Enter a password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="newPassword"
        maxLength={policy.maxLength}
      />
      {password.length > 0 && (
        <View style={styles.strengthRow}>
          <View style={styles.strengthTrack}>
            <View
              style={[
                styles.strengthFill,
                { backgroundColor: strength.color, flex: strength.fraction },
              ]}
            />
            <View style={{ flex: 1 - strength.fraction }} />
          </View>
          <Text style={[styles.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
        </View>
      )}

      <TextField
        label="Confirm Password"
        placeholder="Re-enter your password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        textContentType="newPassword"
        maxLength={policy.maxLength}
        errorText={
          confirmPassword.length > 0 && !passwordsMatch ? "Passwords don't match" : undefined
        }
      />
      {passwordsMatch && <Text style={styles.matchText}>Passwords match</Text>}

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
        onPress={() => onCreateAccount(password, confirmPassword)}
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
  strengthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },
  strengthTrack: {
    flex: 1,
    flexDirection: 'row',
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginRight: spacing.sm,
  },
  strengthFill: { height: 4 },
  strengthLabel: { fontSize: 12, fontWeight: '700' },
  matchText: {
    color: colors.success,
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

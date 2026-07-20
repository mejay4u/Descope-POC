import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import AppButton from '../../components/AppButton';
import type { FormState } from './types';
import { sharedStyles } from './styles';
import { colors, radius, spacing } from '../../theme';

type Props = {
  form: FormState;
  onEdit: () => void;
  onConfirm: () => void;
};

export default function ReviewInfoStep({ form, onEdit, onConfirm }: Props) {
  return (
    <View>
      <Text style={sharedStyles.title}>Review your information</Text>
      <Text style={sharedStyles.subtitle}>
        Confirm your details below before continuing. Need to make changes?{' '}
        <Text style={sharedStyles.footerLink} onPress={onEdit}>
          Go back to Step 1
        </Text>
        .
      </Text>

      <View style={styles.card}>
        <Text style={sharedStyles.reviewSection}>Personal info</Text>
        <ReviewRow label="First name" value={form.firstName} />
        <ReviewRow label="Last name" value={form.lastName} />
        <ReviewRow label="Date of birth" value={form.dob} />
        <ReviewRow label="Zip code" value={form.zip} />

        <Text style={[sharedStyles.reviewSection, sharedStyles.actionSpacing]}>
          Contact details
        </Text>
        <ReviewRow label="Email address" value={form.email} />
        {!!form.phone && <ReviewRow label="Contact number" value={form.phone} last />}
      </View>

      <AppButton label="Confirm & Continue" onPress={onConfirm} />
    </View>
  );
}

function ReviewRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLast: { borderBottomWidth: 0 },
  label: { color: colors.textMuted, fontSize: 14 },
  value: { color: colors.text, fontSize: 14, fontWeight: '600' },
});

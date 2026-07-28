import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import TextField from '../../components/TextField';
import AppButton from '../../components/AppButton';
import { colors, spacing } from '../../theme';
import { sharedStyles } from './styles';
import { formatSsnInput, ssnRe } from './types';

type Props = {
  /** Submits into the flow, which posts to `/api/completeRegistration`. */
  onSubmit: (ssn: string, memberId: string) => void;
  busy: boolean;
};

/**
 * Phase 4 of the flow: the details used to match the member against Facets.
 * The comparison happens server-side — the BFF pulls MemberInfo from Facets
 * across all tenants and checks it against what's entered here, then returns
 * the subscriber and plan IDs the flow maps into the session's custom claims.
 *
 * The member ID field is optional on purpose: SSN alone is often enough to
 * match, and asking for a card number the member may not have to hand is a
 * good way to lose them at the last step.
 */
export default function MemberInfoStep({ onSubmit, busy }: Props) {
  const [ssn, setSsn] = useState('');
  const [memberId, setMemberId] = useState('');

  const ssnValid = ssnRe.test(ssn);

  return (
    <View>
      <Text style={sharedStyles.title}>Confirm your membership</Text>
      <Text style={sharedStyles.subtitle}>
        We use this to find your plan. It's checked against your health plan's records and never
        leaves our systems.
      </Text>

      <TextField
        label="Social Security number"
        placeholder="123-45-6789"
        value={ssn}
        onChangeText={value => setSsn(formatSsnInput(value))}
        keyboardType="number-pad"
        maxLength={11}
        secureTextEntry
        errorText={ssn.length > 0 && !ssnValid ? 'Enter all nine digits' : undefined}
      />
      <TextField
        label="Member ID (optional)"
        placeholder="As shown on your member card"
        value={memberId}
        onChangeText={setMemberId}
        autoCapitalize="characters"
      />

      <Text style={styles.privacyNote}>
        Your SSN is sent securely and stored encrypted. We only use it to match you to your plan.
      </Text>

      <AppButton
        label="Complete registration"
        onPress={() => onSubmit(ssn, memberId.trim())}
        loading={busy}
        disabled={!ssnValid}
        style={sharedStyles.actionSpacing}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  privacyNote: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
});

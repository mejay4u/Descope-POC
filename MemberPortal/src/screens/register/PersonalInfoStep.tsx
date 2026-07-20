import React from 'react';
import { Text, View } from 'react-native';
import TextField from '../../components/TextField';
import AppButton from '../../components/AppButton';
import { formatDobInput, type FormState } from './types';
import { sharedStyles } from './styles';

type Props = {
  form: FormState;
  onChange: (patch: Partial<FormState>) => void;
  onContinue: () => void;
  busy: boolean;
  onSignIn: () => void;
};

export default function PersonalInfoStep({ form, onChange, onContinue, busy, onSignIn }: Props) {
  return (
    <View>
      <Text style={sharedStyles.title}>Personal information</Text>
      <Text style={sharedStyles.subtitle}>All fields are required unless marked optional.</Text>

      <TextField
        label="First name"
        placeholder="Jane"
        value={form.firstName}
        onChangeText={firstName => onChange({ firstName })}
        autoCapitalize="words"
        textContentType="givenName"
      />
      <TextField
        label="Last name"
        placeholder="Member"
        value={form.lastName}
        onChangeText={lastName => onChange({ lastName })}
        autoCapitalize="words"
        textContentType="familyName"
      />
      <TextField
        label="Date of birth"
        placeholder="MM/DD/YYYY"
        value={form.dob}
        onChangeText={value => onChange({ dob: formatDobInput(value) })}
        keyboardType="number-pad"
        maxLength={10}
      />
      <TextField
        label="Zip code"
        placeholder="12345"
        value={form.zip}
        onChangeText={zip => onChange({ zip })}
        keyboardType="number-pad"
        maxLength={10}
      />
      <TextField
        label="Email address"
        placeholder="you@example.com"
        value={form.email}
        onChangeText={email => onChange({ email })}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="username"
      />
      <TextField
        label="Contact number (optional)"
        placeholder="+14155551234"
        value={form.phone}
        onChangeText={phone => onChange({ phone })}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
      />

      <AppButton label="Continue" onPress={onContinue} loading={busy} />

      <View style={sharedStyles.footerRow}>
        <Text style={sharedStyles.footerText}>Already have an account? </Text>
        <Text style={sharedStyles.footerLink} onPress={onSignIn}>
          Sign in
        </Text>
      </View>
    </View>
  );
}

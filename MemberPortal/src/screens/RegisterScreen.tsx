import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSession } from '@descope/react-native-sdk';
import type { JWTResponse } from '@descope/core-js-sdk';
import TextField from '../components/TextField';
import AppButton from '../components/AppButton';
import Banner from '../components/Banner';
import StepProgress from '../components/StepProgress';
import CheckIcon from '../components/icons/CheckIcon';
import { useAuth, type AuthResult, type VerifyResult } from '../auth/useAuth';
import { promptEnableBiometricLogin } from '../auth/biometricStore';
import { colors, radius, spacing, typography } from '../theme';
import type { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;
type Step = 'personal' | 'verify' | 'review' | 'password' | 'success';

const STEP_INDEX: Record<Step, number> = {
  personal: 1,
  verify: 2,
  review: 3,
  password: 4,
  success: 5,
};
const STEP_LABEL: Record<Step, string> = {
  personal: 'Personal information',
  verify: 'Verify email',
  review: 'Review your information',
  password: 'Set a password',
  success: 'Account created',
};
const TOTAL_STEPS = 5;

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const dobRe = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/;
const zipRe = /^\d{5}(-\d{4})?$/;

/** Auto-inserts "/" separators as digits come in from a number-pad keyboard (no "/" key). */
function formatDobInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)]
    .filter(Boolean)
    .join('/');
}

type FormState = {
  firstName: string;
  lastName: string;
  dob: string;
  zip: string;
  email: string;
  phone: string;
};

export default function RegisterScreen({ navigation }: Props) {
  const { startRegistration, verifyRegistrationCode, completeRegistration } = useAuth();
  const { manageSession } = useSession();

  const [step, setStep] = useState<Step>('personal');
  const [form, setForm] = useState<FormState>({
    firstName: '',
    lastName: '',
    dob: '',
    zip: '',
    email: '',
    phone: '',
  });
  const [jwt, setJwt] = useState<JWTResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const updateForm = (patch: Partial<FormState>) => setForm(prev => ({ ...prev, ...patch }));

  const onPersonalContinue = async () => {
    setError(null);
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError('Please enter your first and last name.');
      return;
    }
    if (!dobRe.test(form.dob.trim())) {
      setError('Please enter your date of birth as MM/DD/YYYY.');
      return;
    }
    if (!zipRe.test(form.zip.trim())) {
      setError('Please enter a valid zip code.');
      return;
    }
    if (!emailRe.test(form.email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    setBusy(true);
    const res = await startRegistration({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || undefined,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setStep('verify');
  };

  const onVerified = (verifiedJwt: JWTResponse) => {
    setJwt(verifiedJwt);
    setError(null);
    setStep('review');
  };

  const onCreateAccount = async (password: string) => {
    if (!jwt) {
      setError('Your session expired — please verify your email again.');
      setStep('verify');
      return;
    }
    setError(null);
    setBusy(true);
    const res = await completeRegistration(form.email.trim(), password, jwt.sessionJwt);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setStep('success');
  };

  const onFinish = async () => {
    if (!jwt) {
      return;
    }
    await manageSession(jwt);
    await promptEnableBiometricLogin(jwt.refreshJwt);
    // Session listener in App.tsx swaps to the Portal automatically.
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          {step !== 'success' && (
            <StepProgress
              current={STEP_INDEX[step]}
              total={TOTAL_STEPS}
              label={STEP_LABEL[step]}
            />
          )}

          {!!error && <Banner variant="error">{error}</Banner>}

          {step === 'personal' && (
            <PersonalInfoStep
              form={form}
              onChange={updateForm}
              onContinue={onPersonalContinue}
              busy={busy}
              onSignIn={() => navigation.navigate('Login')}
            />
          )}

          {step === 'verify' && (
            <VerifyEmailStep
              email={form.email}
              verifyCode={verifyRegistrationCode}
              resend={() =>
                startRegistration({
                  firstName: form.firstName.trim(),
                  lastName: form.lastName.trim(),
                  email: form.email.trim(),
                  phone: form.phone.trim() || undefined,
                })
              }
              onVerified={onVerified}
              onError={setError}
            />
          )}

          {step === 'review' && (
            <ReviewInfoStep
              form={form}
              onEdit={() => setStep('personal')}
              onConfirm={() => setStep('password')}
            />
          )}

          {step === 'password' && (
            <SetPasswordStep email={form.email} onCreateAccount={onCreateAccount} busy={busy} />
          )}

          {step === 'success' && (
            <SuccessStep firstName={form.firstName} onFinish={onFinish} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---- Step 1: Personal information -----------------------------------------

function PersonalInfoStep({
  form,
  onChange,
  onContinue,
  busy,
  onSignIn,
}: {
  form: FormState;
  onChange: (patch: Partial<FormState>) => void;
  onContinue: () => void;
  busy: boolean;
  onSignIn: () => void;
}) {
  return (
    <View>
      <Text style={styles.title}>Personal information</Text>
      <Text style={styles.subtitle}>All fields are required unless marked optional.</Text>

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

      <View style={styles.footerRow}>
        <Text style={styles.footerText}>Already have an account? </Text>
        <Text style={styles.footerLink} onPress={onSignIn}>
          Sign in
        </Text>
      </View>
    </View>
  );
}

// ---- Step 2: Verify email --------------------------------------------------

const CODE_LENGTH = 6;
const RESEND_COOLDOWN = 30;

function VerifyEmailStep({
  email,
  verifyCode,
  resend,
  onVerified,
  onError,
}: {
  email: string;
  verifyCode: (email: string, code: string) => Promise<VerifyResult>;
  resend: () => Promise<AuthResult>;
  onVerified: (jwt: JWTResponse) => void;
  onError: (message: string) => void;
}) {
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
      <Text style={styles.title}>Check your email</Text>
      <Text style={styles.subtitle}>
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
        style={styles.actionSpacing}
      />

      <Text style={styles.resendText}>
        {cooldown > 0 ? (
          `Resend code in ${cooldown}s`
        ) : (
          <Text style={styles.footerLink} onPress={onResend}>
            Resend code
          </Text>
        )}
      </Text>
    </View>
  );
}

// ---- Step 3: Review information --------------------------------------------

function ReviewInfoStep({
  form,
  onEdit,
  onConfirm,
}: {
  form: FormState;
  onEdit: () => void;
  onConfirm: () => void;
}) {
  return (
    <View>
      <Text style={styles.title}>Review your information</Text>
      <Text style={styles.subtitle}>
        Confirm your details below before continuing. Need to make changes?{' '}
        <Text style={styles.footerLink} onPress={onEdit}>
          Go back to Step 1
        </Text>
        .
      </Text>

      <View style={styles.reviewCard}>
        <Text style={styles.reviewSection}>Personal info</Text>
        <ReviewRow label="First name" value={form.firstName} />
        <ReviewRow label="Last name" value={form.lastName} />
        <ReviewRow label="Date of birth" value={form.dob} />
        <ReviewRow label="Zip code" value={form.zip} />

        <Text style={[styles.reviewSection, styles.actionSpacing]}>Contact details</Text>
        <ReviewRow label="Email address" value={form.email} />
        {!!form.phone && <ReviewRow label="Contact number" value={form.phone} last />}
      </View>

      <AppButton label="Confirm & Continue" onPress={onConfirm} />
    </View>
  );
}

function ReviewRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.reviewRow, last && styles.reviewRowLast]}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue}>{value}</Text>
    </View>
  );
}

// ---- Step 4: Set password --------------------------------------------------

function SetPasswordStep({
  email,
  onCreateAccount,
  busy,
}: {
  email: string;
  onCreateAccount: (password: string) => void;
  busy: boolean;
}) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const rules = [
    { label: 'Must be between 14 and 56 characters', valid: password.length >= 14 && password.length <= 56 },
    { label: 'At least one uppercase letter (A–Z)', valid: /[A-Z]/.test(password) },
    { label: 'At least one numeric digit (0–9)', valid: /[0-9]/.test(password) },
    {
      label: 'At least one special character (e.g., @, #, $, !, %)',
      valid: /[^A-Za-z0-9]/.test(password),
    },
  ];
  const allValid = rules.every(r => r.valid);
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

  return (
    <View>
      <Text style={styles.title}>Set a strong password</Text>
      <Text style={styles.subtitle}>Set a strong password to secure your account.</Text>

      <TextField label="Email / User ID" value={email} editable={false} />
      <Text style={styles.hintText}>
        This email is your User ID and will be used to log in.
      </Text>

      <TextField
        label="Create password"
        placeholder="Enter a password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="newPassword"
      />
      <TextField
        label="Confirm password"
        placeholder="Re-enter your password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        textContentType="newPassword"
        errorText={confirmPassword.length > 0 && !passwordsMatch ? "Passwords don't match" : undefined}
      />

      <View style={styles.checklist}>
        <Text style={styles.reviewSection}>Password must contain:</Text>
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
        style={styles.actionSpacing}
      />
    </View>
  );
}

// ---- Step 5: Success --------------------------------------------------------

function SuccessStep({ firstName, onFinish }: { firstName: string; onFinish: () => void }) {
  return (
    <View style={styles.successWrap}>
      <View style={styles.successBadge}>
        <CheckIcon size={32} color={colors.white} />
      </View>
      <Text style={styles.title}>Account created!</Text>
      <Text style={styles.subtitle}>
        Welcome to Member Portal{firstName ? `, ${firstName}` : ''}. Your account is ready to go.
      </Text>
      <AppButton label="Continue to Member Portal" onPress={onFinish} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { ...typography.title, fontSize: 24 },
  subtitle: { ...typography.subtitle, marginTop: spacing.xs, marginBottom: spacing.lg },
  hintText: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },
  actionSpacing: { marginTop: spacing.xs },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  footerText: { color: colors.textMuted, fontSize: 15 },
  footerLink: { color: colors.brand, fontWeight: '700' },
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
  reviewCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  reviewSection: { ...typography.label, fontSize: 13, color: colors.textMuted, marginBottom: spacing.sm },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  reviewRowLast: { borderBottomWidth: 0 },
  reviewLabel: { color: colors.textMuted, fontSize: 14 },
  reviewValue: { color: colors.text, fontSize: 14, fontWeight: '600' },
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
  successWrap: { alignItems: 'center', paddingTop: spacing.xxl },
  successBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
});

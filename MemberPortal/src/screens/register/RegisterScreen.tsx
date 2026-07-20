import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { JWTResponse } from '@descope/core-js-sdk';
import Banner from '../../components/Banner';
import StepProgress from '../../components/StepProgress';
import { useAuth } from '../../auth/useAuth';
import { colors, spacing } from '../../theme';
import type { AuthStackParamList } from '../../navigation/types';
import { EMPTY_FORM, STEP_INDEX, STEP_LABEL, TOTAL_STEPS, type FormState, type Step } from './types';
import PersonalInfoStep from './PersonalInfoStep';
import VerifyEmailStep from './VerifyEmailStep';
import ReviewInfoStep from './ReviewInfoStep';
import SetPasswordStep from './SetPasswordStep';
import SuccessStep from './SuccessStep';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

/**
 * A 5-step registration wizard: Personal Info -> Verify Email -> Review ->
 * Set Password -> Success. See src/services/descopeService.ts for what each
 * step actually calls in Descope, and the README's "Register" section for
 * the full data-flow writeup.
 */
export default function RegisterScreen({ navigation }: Props) {
  const { startRegistration, verifyRegistrationCode, completeRegistration, finishRegistration } =
    useAuth();

  const [step, setStep] = useState<Step>('personal');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [jwt, setJwt] = useState<JWTResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const updateForm = (patch: Partial<FormState>) => setForm(prev => ({ ...prev, ...patch }));

  const startRegistrationRequest = (data: FormState) =>
    startRegistration({
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      email: data.email.trim(),
      phone: data.phone.trim() || undefined,
    });

  const onPersonalContinue = async () => {
    setError(null);
    setBusy(true);
    const res = await startRegistrationRequest(form);
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
    if (jwt) {
      await finishRegistration(jwt);
      // Session listener in App.tsx swaps to the Portal automatically.
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {step !== 'success' && (
            <StepProgress current={STEP_INDEX[step]} total={TOTAL_STEPS} label={STEP_LABEL[step]} />
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
              resend={() => startRegistrationRequest(form)}
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

          {step === 'success' && <SuccessStep firstName={form.firstName} onFinish={onFinish} />}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
});

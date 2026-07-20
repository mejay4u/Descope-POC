import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { JWTResponse } from '@descope/core-js-sdk';
import Banner from '../../components/Banner';
import { useAuth, type PasswordPolicy } from '../../auth/useAuth';
import { DEFAULT_PASSWORD_POLICY } from '../../services/descopeService';
import { colors, spacing } from '../../theme';
import type { AuthStackParamList } from '../../navigation/types';
import { EMPTY_FORM, type FormState, type Step } from './types';
import WizardHeader from './WizardHeader';
import PersonalInfoStep from './PersonalInfoStep';
import VerifyEmailStep from './VerifyEmailStep';
import ReviewInfoStep from './ReviewInfoStep';
import SetPasswordStep from './SetPasswordStep';
import SuccessStep from './SuccessStep';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

/** Which step the header's back button lands on; absent means "leave the wizard". */
const PREVIOUS_STEP: Partial<Record<Step, Step>> = {
  verify: 'personal',
  review: 'verify',
  password: 'review',
};

/**
 * A 5-step registration wizard: Personal Info -> Verify Email -> Review ->
 * Set Password -> Success. See src/services/descopeService.ts for what each
 * step actually calls in Descope, and the README's "Register" section for
 * the full data-flow writeup.
 */
export default function RegisterScreen({ navigation }: Props) {
  const {
    startRegistration,
    verifyRegistrationCode,
    resendRegistrationCode,
    completeRegistration,
    finishRegistration,
    getPasswordPolicy,
  } = useAuth();

  const [step, setStep] = useState<Step>('personal');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [jwt, setJwt] = useState<JWTResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [passwordPolicy, setPasswordPolicy] = useState<PasswordPolicy>(DEFAULT_PASSWORD_POLICY);

  // Fetch the live Descope password policy up front so the "Set a password"
  // step's checklist always matches what the server will actually enforce.
  useEffect(() => {
    let active = true;
    getPasswordPolicy().then(policy => {
      if (active) {
        setPasswordPolicy(policy);
      }
    });
    return () => {
      active = false;
    };
  }, [getPasswordPolicy]);

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
    // password.update authenticates with the refresh token from the verify
    // step (see descopeService.completeRegistration).
    if (!jwt?.refreshJwt) {
      setError('Your session expired — please verify your email again.');
      setStep('verify');
      return;
    }
    setError(null);
    setBusy(true);
    const res = await completeRegistration(form.email.trim(), password, jwt.refreshJwt);
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

  const onHeaderBack = () => {
    setError(null);
    const previous = PREVIOUS_STEP[step];
    if (previous) {
      setStep(previous);
    } else {
      navigation.goBack();
    }
  };

  const showHeader = step !== 'success';

  return (
    <SafeAreaView
      style={styles.safe}
      edges={showHeader ? ['bottom', 'left', 'right'] : ['top', 'bottom', 'left', 'right']}>
      {showHeader && <WizardHeader step={step} onBack={onHeaderBack} />}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
              resend={() => resendRegistrationCode(form.email.trim())}
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
            <SetPasswordStep
              email={form.email}
              policy={passwordPolicy}
              onCreateAccount={onCreateAccount}
              busy={busy}
            />
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

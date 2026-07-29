import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { JWTResponse } from '@descope/core-js-sdk';
import Banner from '../../components/Banner';
import { useAuth } from '../../auth/useAuth';
import { colors, spacing } from '../../theme';
import type { AuthStackParamList } from '../../navigation/types';
import { EMPTY_FORM, PASSWORD_POLICY, type FormState, type Step } from './types';
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
 * The registration wizard: Personal Information -> Verify Email -> Review ->
 * Create Account -> All set.
 *
 * Two backends, split by what each is good at:
 *   - **Descope** proves the member owns the email address (sends and verifies
 *     the OTP) and issues the session. It stores the email and nothing else.
 *   - **The MemberPortal API** stores the member record and the password.
 *
 * The session from the verify step is held here rather than applied — it
 * authenticates the two API calls, and is only activated on the final screen,
 * so the app doesn't jump into the Portal mid-wizard.
 *
 * The design's progress bar counts six steps; step 5 is the membership check
 * (SSN / eligibility), which isn't built yet — see `types.ts`.
 */
export default function RegisterScreen({ navigation }: Props) {
  const {
    startRegistration,
    verifyRegistrationCode,
    resendRegistrationCode,
    saveRegistrationDetails,
    createMemberAccount,
    finishRegistration,
  } = useAuth();

  const [step, setStep] = useState<Step>('personal');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [jwt, setJwt] = useState<JWTResponse | null>(null);
  // Set once the pending record exists in the MemberPortal DB; creating the
  // account needs it to know which record the password belongs to.
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const updateForm = (patch: Partial<FormState>) => setForm(prev => ({ ...prev, ...patch }));

  const onPersonalContinue = async () => {
    setError(null);
    setBusy(true);
    // Descope only needs the email address — the rest of this form is stored by
    // the MemberPortal API once the member has confirmed it on the review step.
    const res = await startRegistration(form.email.trim());
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

  /** Email verified and details confirmed: save the record, then ask for a password. */
  const onReviewConfirm = async () => {
    if (!jwt?.sessionJwt) {
      setError('Your session expired — please verify your email again.');
      setStep('verify');
      return;
    }
    setError(null);
    setBusy(true);
    const res = await saveRegistrationDetails(
      {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        dob: form.dob.trim(),
        zip: form.zip.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
      },
      jwt.sessionJwt,
    );
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setUserId(res.data.userId);
    setStep('password');
  };

  const onCreateAccount = async (password: string, confirmPassword: string) => {
    if (!userId) {
      setError('Your details were not saved — please confirm your information again.');
      setStep('review');
      return;
    }
    if (!jwt?.sessionJwt) {
      setError('Your session expired — please verify your email again.');
      setStep('verify');
      return;
    }
    setError(null);
    setBusy(true);
    const res = await createMemberAccount(userId, password, confirmPassword, jwt.sessionJwt);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setStep('success');
  };

  const onFinish = async () => {
    if (jwt) {
      // The OTP-verify session is still valid — nothing revoked it, since the
      // password never touched Descope.
      await finishRegistration(jwt);
      // Session listener in RootNavigator swaps to the Portal automatically.
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
              onConfirm={onReviewConfirm}
              busy={busy}
            />
          )}

          {step === 'password' && (
            <SetPasswordStep
              email={form.email}
              policy={PASSWORD_POLICY}
              onCreateAccount={onCreateAccount}
              busy={busy}
            />
          )}

          {step === 'success' && <SuccessStep onFinish={onFinish} />}
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

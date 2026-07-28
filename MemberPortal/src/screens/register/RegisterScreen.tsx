import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { JWTResponse } from '@descope/core-js-sdk';
import Banner from '../../components/Banner';
import { useAuth, type PasswordPolicy } from '../../auth/useAuth';
import { DEFAULT_PASSWORD_POLICY } from '../../services/memberApi';
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
 * Set Password -> Success.
 *
 * The two backends split the work:
 *   - **Descope** verifies the email address (steps 1–2) and issues the
 *     session. It stores the email address and nothing else.
 *   - **The MemberPortal .NET API** stores the registration record (step 3,
 *     once the details are confirmed) and the password (step 4).
 *
 * The session from the verify step is held here rather than applied — it
 * authenticates the two API calls, and only gets applied on Success (step 5),
 * so the app doesn't jump into the Portal mid-wizard. See
 * `src/services/memberApi.ts` and the README's "Register" section.
 */
export default function RegisterScreen({ navigation }: Props) {
  const {
    startRegistration,
    verifyRegistrationCode,
    resendRegistrationCode,
    createMemberRegistration,
    setMemberPassword,
    finishRegistration,
    getPasswordPolicy,
  } = useAuth();

  const [step, setStep] = useState<Step>('personal');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [jwt, setJwt] = useState<JWTResponse | null>(null);
  // Set once the registration record exists in the MemberPortal DB; the
  // password step needs it to know which record to attach the password to.
  const [memberId, setMemberId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [passwordPolicy, setPasswordPolicy] = useState<PasswordPolicy>(DEFAULT_PASSWORD_POLICY);

  // Fetch the live password policy up front so the "Set a password" step's
  // checklist always matches what the API will actually enforce.
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

  const onPersonalContinue = async () => {
    setError(null);
    setBusy(true);
    // Descope only needs the email address — everything else on this form is
    // stored by the MemberPortal API on the review step.
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

  /**
   * Email is verified and the details are confirmed: create the member record
   * in the MemberPortal DB before asking for a password, so the password has a
   * record to attach to.
   */
  const onReviewConfirm = async () => {
    if (!jwt?.sessionJwt) {
      setError('Your session expired — please verify your email again.');
      setStep('verify');
      return;
    }
    setError(null);
    setBusy(true);
    const res = await createMemberRegistration(
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
    setMemberId(res.data.memberId);
    setStep('password');
  };

  const onCreateAccount = async (password: string) => {
    if (!memberId) {
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
    const res = await setMemberPassword(memberId, password, jwt.sessionJwt);
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
              onConfirm={onReviewConfirm}
              busy={busy}
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

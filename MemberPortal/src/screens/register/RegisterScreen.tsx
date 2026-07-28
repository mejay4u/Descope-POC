import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { JWTResponse } from '@descope/core-js-sdk';
import Banner from '../../components/Banner';
import { useAuth } from '../../auth/useAuth';
import { useFlowRunner } from '../../services/useFlowRunner';
import type { FlowInput, FlowResult, FlowScreen } from '../../services/flowRunner';
import { REGISTER_FLOW_ID, isRegistrationFlowConfigured } from '../../config';
import { colors, spacing } from '../../theme';
import type { AuthStackParamList } from '../../navigation/types';
import { FLOW_FIELDS, emailFromState, mappingFor } from './flowScreens';
import { EMPTY_FORM, PASSWORD_POLICY, type FormState, type Step } from './types';
import WizardHeader from './WizardHeader';
import PersonalInfoStep from './PersonalInfoStep';
import VerifyEmailStep from './VerifyEmailStep';
import SetPasswordStep from './SetPasswordStep';
import MemberInfoStep from './MemberInfoStep';
import SuccessStep from './SuccessStep';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

/**
 * Registration: a Descope Flow rendered with **this app's own native screens**.
 *
 * The flow runs headlessly (see `services/flowRunner.ts`). Descope keeps
 * driving the logic — sending the OTP, holding the entered data in flow state,
 * and calling the BFF through its connectors at each phase — but it never
 * renders anything. Each response names a screen; we look that name up in
 * `flowScreens.ts`, render the matching native step, and send the member's
 * input back with the screen's interaction ID.
 *
 * Phases, per the sequence diagram:
 *   1. details (email, name, DOB, zip) -> flow state, OTP emailed
 *   2. OTP verified -> flow calls `POST /api/initiateRegistration`; the
 *      Pending member record is created before Descope's shadow user exists
 *   3. password -> flow posts it to the BFF, which validates and stores it
 *   4. SSN / member info -> `POST /api/completeRegistration`, eligibility
 *      checked against Facets, subscriber and plan IDs mapped into claims
 *
 * When the flow reports `completed` it hands back the enriched session JWT,
 * which `finishRegistration` applies.
 */
export default function RegisterScreen({ navigation }: Props) {
  const { finishRegistration } = useAuth();
  const runner = useFlowRunner();

  const [screen, setScreen] = useState<FlowScreen | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [jwt, setJwt] = useState<JWTResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(true);

  /** Applies whatever the flow returned: next screen, done, or an error. */
  const apply = useCallback(
    (result: FlowResult) => {
      if (result.kind === 'error') {
        setError(result.error);
        return;
      }
      if (result.kind === 'completed') {
        setJwt(result.jwt);
        setError(null);
        return;
      }
      setScreen(result.screen);
      // An error that arrives with a screen (a wrong code, say) belongs to
      // that screen, so it replaces rather than clears the banner.
      setError(result.screen.error ?? null);
    },
    [],
  );

  useEffect(() => {
    if (!isRegistrationFlowConfigured()) {
      setStarting(false);
      return;
    }
    let active = true;
    runner.start(REGISTER_FLOW_ID).then(result => {
      if (active) {
        apply(result);
        setStarting(false);
      }
    });
    return () => {
      active = false;
    };
  }, [runner, apply]);

  const submit = async (interactionId: string, input?: FlowInput) => {
    if (!screen) {
      return;
    }
    setError(null);
    setBusy(true);
    const result = await runner.next(screen, interactionId, input);
    setBusy(false);
    apply(result);
  };

  const updateForm = (patch: Partial<FormState>) => setForm(prev => ({ ...prev, ...patch }));

  const onFinish = async () => {
    if (jwt) {
      await finishRegistration(jwt);
      // The session listener in RootNavigator swaps to the Portal.
    }
  };

  // The flow decides which step we're on; the header follows it. Once the flow
  // has completed there's no screen left, so we show our own success step.
  const mapping = screen ? mappingFor(screen.screenId) : undefined;
  const step: Step | undefined = jwt ? 'success' : mapping?.step;

  const onHeaderBack = () => {
    // Steps can't be re-entered: the flow holds the state server-side and has
    // no "go back" interaction, so leaving means abandoning the registration.
    navigation.goBack();
  };

  const showHeader = !!step && step !== 'success';

  return (
    <SafeAreaView
      style={styles.safe}
      edges={showHeader ? ['bottom', 'left', 'right'] : ['top', 'bottom', 'left', 'right']}>
      {showHeader && step && <WizardHeader step={step} onBack={onHeaderBack} />}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {!!error && <Banner variant="error">{error}</Banner>}

          {starting && (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color={colors.brand} />
            </View>
          )}

          {!starting && !isRegistrationFlowConfigured() && (
            <View style={styles.notice}>
              <Text style={styles.noticeTitle}>Registration isn’t set up yet</Text>
              <Text style={styles.noticeText}>
                Build the registration flow in the Descope Console, then set REGISTER_FLOW_ID (and
                your Project ID) in src/config/index.ts. See the README’s “Registration flow setup”
                section.
              </Text>
            </View>
          )}

          {step === 'personal' && (
            <PersonalInfoStep
              form={form}
              onChange={updateForm}
              busy={busy}
              onContinue={() =>
                submit(mapping!.submit, {
                  [FLOW_FIELDS.email]: form.email.trim(),
                  [FLOW_FIELDS.firstName]: form.firstName.trim(),
                  [FLOW_FIELDS.lastName]: form.lastName.trim(),
                  [FLOW_FIELDS.dob]: form.dob.trim(),
                  [FLOW_FIELDS.zip]: form.zip.trim(),
                })
              }
              onSignIn={() => navigation.navigate('Login')}
            />
          )}

          {step === 'verify' && (
            <VerifyEmailStep
              // The flow may echo back the address it sent to; fall back to
              // what the member typed.
              email={emailFromState(screen!.state) ?? form.email}
              busy={busy}
              onSubmit={code => submit(mapping!.submit, { [FLOW_FIELDS.code]: code })}
              onResend={() => submit(mapping!.secondary ?? mapping!.submit)}
            />
          )}

          {step === 'password' && (
            <SetPasswordStep
              email={form.email}
              policy={PASSWORD_POLICY}
              busy={busy}
              onSubmit={(password, confirmPassword) =>
                submit(mapping!.submit, {
                  [FLOW_FIELDS.password]: password,
                  [FLOW_FIELDS.confirmPassword]: confirmPassword,
                })
              }
            />
          )}

          {step === 'member' && (
            <MemberInfoStep
              busy={busy}
              onSubmit={(ssn, memberId) =>
                submit(mapping!.submit, {
                  [FLOW_FIELDS.ssn]: ssn,
                  ...(memberId ? { [FLOW_FIELDS.memberId]: memberId } : {}),
                })
              }
            />
          )}

          {step === 'success' && <SuccessStep firstName={form.firstName} onFinish={onFinish} />}

          {/* The flow asked for a screen this app doesn't know how to render.
              Naming it beats a blank page: it's how you discover the real IDs
              to put in flowScreens.ts. */}
          {!starting && !step && screen && (
            <View style={styles.notice}>
              <Text style={styles.noticeTitle}>Unmapped flow screen</Text>
              <Text style={styles.noticeText}>
                The flow asked for “{screen.screenId}”, which isn’t in SCREEN_MAPPINGS. Add it to
                src/screens/register/flowScreens.ts and pick the step that should render it.
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  loading: { paddingTop: spacing.xxl },
  notice: { paddingTop: spacing.xl },
  noticeTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  noticeText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
});

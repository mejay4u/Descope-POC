/**
 * The seam between the Descope flow and this app's native screens.
 *
 * Running a flow with custom screens means the flow decides *what* to show and
 * we decide *how*. It identifies each screen by an ID, and each action on that
 * screen (submit, resend, …) by an interaction ID — both defined by the flow
 * itself, in the Descope Console. This file is where those IDs are declared,
 * and it is the only file that has to change when the flow does.
 *
 * ⚠️ The IDs below are placeholders matching the four phases of the agreed
 * design. Replace them with the real ones from your flow. The quickest way to
 * find them: run the flow once — `RegisterScreen` shows the unmapped screen ID
 * on screen (and logs it) rather than failing silently, so the flow tells you
 * its own IDs as you walk through it.
 *
 * The `input` keys matter just as much: they're the field names the flow's
 * screen expects, and the connector bodies are built from them. `firstName`
 * here has to be what the flow calls it, or the BFF gets a null.
 */

/** Which native step renders a given flow screen. */
export type StepKind = 'personal' | 'verify' | 'password' | 'member' | 'success';

export type ScreenMapping = {
  /** The flow's screen ID. */
  screenId: string;
  /** Which of our components renders it. */
  step: StepKind;
  /** Interaction ID for the screen's primary action (its submit button). */
  submit: string;
  /** Interaction ID for the secondary action, where a screen has one. */
  secondary?: string;
};

/**
 * Phase 1 collects the details, phase 2 verifies the OTP (and is where the flow
 * calls `POST /api/initiateRegistration`), phase 3 sets the password, phase 4
 * takes SSN/member info for the Facets eligibility check. The flow may or may
 * not end with a screen of its own — if it completes straight after phase 4,
 * the 'success' mapping simply never matches, and RegisterScreen shows its own
 * success step off the completed status instead.
 */
export const SCREEN_MAPPINGS: ScreenMapping[] = [
  { screenId: 'personal-info', step: 'personal', submit: 'submit' },
  { screenId: 'verify-email', step: 'verify', submit: 'submit', secondary: 'resend' },
  { screenId: 'set-password', step: 'password', submit: 'submit' },
  { screenId: 'member-info', step: 'member', submit: 'submit' },
  { screenId: 'success', step: 'success', submit: 'submit' },
];

export function mappingFor(screenId: string): ScreenMapping | undefined {
  return SCREEN_MAPPINGS.find(m => m.screenId === screenId);
}

/**
 * Field names sent back into the flow. Keys are ours, values are the flow's —
 * change the values, not the keys, to match your flow's screen inputs.
 */
export const FLOW_FIELDS = {
  email: 'email',
  firstName: 'firstName',
  lastName: 'lastName',
  dob: 'dob',
  zip: 'zipCode',
  code: 'code',
  password: 'password',
  confirmPassword: 'confirmPassword',
  ssn: 'ssn',
  memberId: 'memberId',
} as const;

/**
 * Values the flow sends *down* for a screen to display, read from
 * `screen.state`. Descope commonly surfaces the login ID it's working with so
 * the OTP screen can say which address the code went to; the name varies by
 * flow, so try a few and fall back to what the member typed.
 */
export function emailFromState(state: Record<string, unknown>): string | undefined {
  for (const key of ['email', 'loginId', 'maskedEmail', 'externalId']) {
    const value = state[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

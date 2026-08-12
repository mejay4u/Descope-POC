/**
 * Pilot App configuration.
 *
 * Descope is the only service this app talks to. Unlike the MemberPortal app in
 * this repo, the Pilot App keeps the **password in Descope** — there is no BFF
 * in the sign-in path at all. Descope authenticates the member and issues a
 * session JWT carrying custom member claims (see `src/auth/claims.ts`).
 *
 * Setup:
 *   1. Get your Project ID from https://app.descope.com/settings/project
 *   2. Paste it into DESCOPE_PROJECT_ID below.
 *   3. Build the flows described in docs/descope-signin-flow-setup.md and put
 *      their IDs in the *_FLOW_ID constants.
 */

// Paste your Descope Project ID here (or wire up react-native-config / .env).
export const DESCOPE_PROJECT_ID = 'YOUR_DESCOPE_PROJECT_ID';

/**
 * The sign-in flow from https://app.descope.com/flows — email + password, then
 * an emailed OTP when the device isn't trusted yet, ending by issuing a session.
 *
 * It's an UNAUTHENTICATED flow. It is embedded with `FlowView` (in-app, no
 * browser) by `src/screens/SignInScreen.tsx`.
 *
 * See docs/descope-signin-flow-setup.md §5 for how to build it.
 */
export const SIGNIN_FLOW_ID: string = 'pilot-sign-in';

/**
 * Name of the client input the sign-in flow reads to decide whether to demand
 * an OTP. The app passes it through `FlowOptions.clientInputs`; the flow
 * branches on it in a Condition step.
 *
 * ⚠️ This is a **client-supplied** value, so it is a UX optimisation and NOT a
 * security boundary — see the warning in `src/auth/deviceTrust.ts`.
 */
export const DEVICE_TRUSTED_INPUT = 'deviceTrusted';

/**
 * Custom URL scheme the hosted passkey flow redirects back through, so the
 * browser can hand control to the app again. Must match the scheme registered
 * in:
 *   - iOS:      ios/PilotApp/Info.plist (CFBundleURLSchemes)
 *   - Android:  android/app/src/main/AndroidManifest.xml (intent-filter)
 * and be listed as an approved redirect URL in the Descope Console.
 */
export const AUTH_REDIRECT_SCHEME = 'pilotapp';
export const AUTH_REDIRECT_URL = `${AUTH_REDIRECT_SCHEME}://auth`;

/**
 * Passkeys (WebAuthn) run through Descope Flows opened in a **browser** rather
 * than embedded — see the header of `src/screens/PasskeyScreen.tsx` for why
 * (short version: it avoids the iOS Associated Domains entitlement entirely).
 *
 * Sign-in and adding a passkey are TWO different flows and must not be swapped:
 *
 *   - PASSKEY_SIGNIN_FLOW_ID — an UNAUTHENTICATED flow behind "Sign in with a
 *     passkey" on the Welcome screen. Pointing this at the add flow renders a
 *     BLANK screen, because that flow needs a logged-in user that doesn't exist
 *     yet.
 *
 *   - PASSKEY_ADD_FLOW_ID — an AUTHENTICATED flow behind the Portal's "Add a
 *     passkey" action. It attaches a passkey to the signed-in member.
 */
export const PASSKEY_SIGNIN_FLOW_ID: string = 'pilot-passkey-signin';
export const PASSKEY_ADD_FLOW_ID: string = 'pilot-passkey-add';

/**
 * A value is still an unedited placeholder if it's empty or begins with the
 * `YOUR_` prefix. Checking the prefix (rather than the whole placeholder
 * string) is deliberate: setting a real value by find-and-replacing the
 * placeholder token must not accidentally rewrite these checks and invert them.
 */
function isPlaceholder(value: string): boolean {
  return value.length === 0 || value.startsWith('YOUR_');
}

/** Whether the sign-in flow is usable (project ID + flow ID set). */
export function isSignInFlowConfigured(): boolean {
  return !isPlaceholder(DESCOPE_PROJECT_ID) && !isPlaceholder(SIGNIN_FLOW_ID);
}

/** Whether usable passkey flows are configured (project ID + both flow IDs set). */
export function isPasskeyConfigured(): boolean {
  return (
    !isPlaceholder(DESCOPE_PROJECT_ID) &&
    !isPlaceholder(PASSKEY_SIGNIN_FLOW_ID) &&
    !isPlaceholder(PASSKEY_ADD_FLOW_ID)
  );
}

export function assertConfigured(): void {
  if (isPlaceholder(DESCOPE_PROJECT_ID)) {
    console.warn('[PilotApp] DESCOPE_PROJECT_ID is not set. Edit src/config/index.ts.');
  }
}

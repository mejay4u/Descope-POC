/**
 * App configuration.
 *
 * The app talks to two backends:
 *   - **Descope** — the identity provider. During registration it only proves
 *     the member owns their email address (sends and verifies the OTP) and
 *     stores that email as the login ID. It never receives the password.
 *   - **The MemberPortal .NET API** — owns the member record: the registration
 *     details captured by the wizard and the password, both stored in the
 *     MemberPortal database. See src/services/memberApi.ts.
 *
 * 1. Get your Project ID from https://app.descope.com/settings/project
 * 2. Paste it into DESCOPE_PROJECT_ID (or wire it up via react-native-config).
 * 3. Point MEMBER_API_BASE_URL at your .NET API.
 */

// Paste your Descope Project ID here (or wire up react-native-config / .env).
export const DESCOPE_PROJECT_ID = 'YOUR_DESCOPE_PROJECT_ID';

/**
 * Base URL of the MemberPortal .NET API — scheme + host (+ port), no trailing
 * path; the endpoint paths live in `src/services/memberApi.ts`.
 *
 *   export const MEMBER_API_BASE_URL = 'https://api.memberportal.example.com';
 *
 * Running against a local .NET dev server from a simulator/emulator:
 *   - iOS Simulator:   'http://localhost:5000'
 *   - Android emulator: 'http://10.0.2.2:5000'  (localhost is the emulator itself)
 * Plain http also needs an ATS exception (iOS) / cleartext traffic enabled
 * (Android) — use https where you can.
 */
export const MEMBER_API_BASE_URL = 'YOUR_MEMBER_API_BASE_URL';

/**
 * Custom URL scheme used as the redirect target for the password-reset email,
 * so the browser can hand control back to the app afterward. Must match the
 * scheme registered in:
 *   - iOS:      ios/MemberPortal/Info.plist (CFBundleURLSchemes)
 *   - Android:  android/app/src/main/AndroidManifest.xml (intent-filter)
 */
export const AUTH_REDIRECT_SCHEME = 'memberportal';
export const AUTH_REDIRECT_URL = `${AUTH_REDIRECT_SCHEME}://auth`;

/**
 * Passkeys (WebAuthn) run through Descope Flows opened in a browser (see
 * src/screens/PasskeyScreen.tsx). Sign-in and adding a passkey are TWO
 * different flows and must not be swapped:
 *
 *   - PASSKEY_SIGNIN_FLOW_ID — an UNAUTHENTICATED flow used by the "Sign in
 *     with a passkey" buttons (Welcome / Login). A "sign-in (passkeys or otp)"
 *     flow works well: it signs in with an existing passkey. Pointing sign-in
 *     at an add/authenticated flow renders a BLANK screen, because that flow
 *     needs a logged-in user that doesn't exist yet.
 *
 *   - PASSKEY_ADD_FLOW_ID — an AUTHENTICATED flow used by the Portal's "Add a
 *     passkey" action. It attaches a passkey to the already-signed-in user.
 *
 * The defaults below match the flow IDs this POC's Descope project uses; change
 * them to your own flow IDs (from https://app.descope.com/flows) if different.
 */
export const PASSKEY_SIGNIN_FLOW_ID: string = 'sign-in-passkeys-or-otp';
export const PASSKEY_ADD_FLOW_ID: string = 'add-passkeys';

/**
 * A value is still an unedited placeholder if it's empty or begins with the
 * `YOUR_` prefix. Checking the prefix (rather than the whole placeholder
 * string) is deliberate: setting a real value by find-and-replacing the
 * placeholder token, e.g. `YOUR_PASSKEY_FLOW_ID` -> `add-passkeys`, must not
 * accidentally rewrite these checks and invert them.
 */
function isPlaceholder(value: string): boolean {
  return value.length === 0 || value.startsWith('YOUR_');
}

/** Whether the MemberPortal .NET API base URL has been filled in. */
export function isMemberApiConfigured(): boolean {
  return !isPlaceholder(MEMBER_API_BASE_URL);
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
    console.warn(
      '[MemberPortal] DESCOPE_PROJECT_ID is not set. Edit src/config/index.ts.',
    );
  }
}

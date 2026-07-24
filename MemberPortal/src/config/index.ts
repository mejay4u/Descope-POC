/**
 * App configuration.
 *
 * Descope is the identity provider (IdP) and the ONLY backend this app talks to.
 * There is no custom server — every auth call goes directly to Descope's hosted
 * service using the Project ID below.
 *
 * 1. Get your Project ID from https://app.descope.com/settings/project
 * 2. Paste it into DESCOPE_PROJECT_ID (or wire it up via react-native-config).
 */

// Paste your Descope Project ID here (or wire up react-native-config / .env).
export const DESCOPE_PROJECT_ID = 'YOUR_DESCOPE_PROJECT_ID';

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

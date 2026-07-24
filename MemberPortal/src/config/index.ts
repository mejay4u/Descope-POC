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
 * Passkeys (WebAuthn) run through a Descope Flow rather than the direct SDK
 * calls the rest of the app uses: the native SDK performs the platform
 * passkey ceremony (Face ID / Touch ID / fingerprint / security key) *inside*
 * the flow, and there is no native passkey bridge to call directly.
 *
 * Set this to the ID of a Flow (in https://app.descope.com/flows) that has
 * passkeys enabled — a "sign up or in" flow is the usual choice so the same
 * button both registers a passkey and signs in with an existing one. Leaving
 * the placeholder simply hides the passkey button (see isPasskeyConfigured).
 *
 * On-device passkeys additionally require domain association:
 *   - iOS:     the `webcredentials:` Associated Domains entitlement + a hosted
 *              apple-app-site-association file.
 *   - Android: a hosted assetlinks.json (Digital Asset Links).
 * See the README "Passkeys setup" section.
 */
export const PASSKEY_FLOW_ID: string = 'YOUR_PASSKEY_FLOW_ID';

/** Whether a usable passkey flow is configured (project ID + flow ID both set). */
export function isPasskeyConfigured(): boolean {
  return (
    DESCOPE_PROJECT_ID !== 'YOUR_DESCOPE_PROJECT_ID' &&
    PASSKEY_FLOW_ID !== 'YOUR_PASSKEY_FLOW_ID' &&
    PASSKEY_FLOW_ID.length > 0
  );
}

export function assertConfigured(): void {
  if (DESCOPE_PROJECT_ID === 'YOUR_DESCOPE_PROJECT_ID') {
    console.warn(
      '[MemberPortal] DESCOPE_PROJECT_ID is not set. Edit src/config/index.ts.',
    );
  }
}

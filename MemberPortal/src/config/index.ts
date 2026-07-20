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
 * Custom URL scheme used as the OAuth (social) redirect target so the browser
 * can hand control back to the app after the user authenticates.
 * Must match the scheme registered in:
 *   - iOS:      ios/MemberPortal/Info.plist (CFBundleURLSchemes)
 *   - Android:  android/app/src/main/AndroidManifest.xml (intent-filter)
 */
export const OAUTH_REDIRECT_SCHEME = 'memberportal';
export const OAUTH_REDIRECT_URL = `${OAUTH_REDIRECT_SCHEME}://auth`;

/**
 * The Descope Flow ID that runs the passkey (WebAuthn) journey.
 * Configure this flow in the Descope Flow editor and enable "Passkeys".
 * Passkeys also require Associated Domains (iOS) / assetlinks.json (Android) —
 * see the README "Passkeys setup" section.
 */
export const PASSKEY_FLOW_ID = 'sign-up-or-in';

export function assertConfigured(): void {
  if (DESCOPE_PROJECT_ID === 'YOUR_DESCOPE_PROJECT_ID') {
    console.warn(
      '[MemberPortal] DESCOPE_PROJECT_ID is not set. Edit src/config/index.ts.',
    );
  }
}

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

export function assertConfigured(): void {
  if (DESCOPE_PROJECT_ID === 'YOUR_DESCOPE_PROJECT_ID') {
    console.warn(
      '[MemberPortal] DESCOPE_PROJECT_ID is not set. Edit src/config/index.ts.',
    );
  }
}

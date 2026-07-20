# Member Portal

A **front-end-only** React Native app (iOS + Android) that uses **Descope** as its
identity provider. There is **no custom backend** — every auth operation talks
directly to Descope's hosted service using your Project ID.

## Features

| Feature | How it's implemented |
| --- | --- |
| **Welcome screen** with *Sign In* / *Create Account* buttons | `src/screens/WelcomeScreen.tsx` |
| **Register** (email + password) | `descope.password.signUp` |
| **Login** (email + password) | `descope.password.signIn` |
| **Social login** — Apple, Microsoft, Google, Facebook | `descope.oauth.start` → browser → deep link → `descope.oauth.exchange` |
| **Magic link** (email) | `descope.magicLink.signIn/signUp.email` → email → deep link → `descope.magicLink.verify` |
| **WhatsApp one-time code** | `descope.otp.signUpOrIn.whatsapp` → code sent over WhatsApp → `descope.otp.verify.whatsapp` (`src/screens/WhatsAppScreen.tsx`) |
| **Biometric sign-in** — Face ID / Touch ID / Fingerprint | Refresh token stored in the Keychain/Keystore behind biometrics (`react-native-keychain`), then `descope.refresh`. The app **asks** before enabling it (never silently) after any successful sign-in. Also offered as its own tile on the Login screen once enabled. |
| **Passkeys** (WebAuthn) | Runs a Descope **Flow** in `FlowView` (native passkey ceremony) |
| **Member portal / home** | `src/screens/PortalScreen.tsx` — profile, biometric toggle, sign out |

Session state is gated in `src/navigation/RootNavigator.tsx`: while a session
exists the app shows the Portal, otherwise the Welcome/Login/Register flow.

## Project structure

```
src/
  config/index.ts          # Descope Project ID, auth redirect scheme, passkey flow ID
  theme/                   # colors, spacing, typography
  components/              # AppButton, TextField, MethodTile, icons/
  auth/
    useAuth.ts             # register / login / social / magic link / biometric / logout
    useAuthDeepLink.ts     # completes social + magic link sign-in from the redirect deep link
    biometricStore.ts      # biometric-gated Keychain storage of the refresh token
  navigation/              # RootNavigator + route types
  screens/                 # Welcome, Login, Register, Passkey, WhatsApp, Portal
App.tsx                    # wraps everything in Descope's <AuthProvider>
```

## 1. Prerequisites

- Node.js ≥ 18.18 (project built with v24)
- React Native CLI environment — see
  https://reactnative.dev/docs/set-up-your-environment
- **iOS:** macOS + Xcode 15+ and CocoaPods (iOS cannot be built on Windows)
- **Android:** Android Studio + JDK 17, an emulator or device

## 2. Configure Descope (required)

1. Create a project at https://app.descope.com and copy the **Project ID** from
   https://app.descope.com/settings/project
2. Paste it into [`src/config/index.ts`](src/config/index.ts):
   ```ts
   export const DESCOPE_PROJECT_ID = 'P2xxxxxxxxxxxxxxxxxxxxxxxx';
   ```
3. In the Descope Console → **Authentication Methods**, enable **Passwords**,
   **Magic Link**, and **OTP** (with the **WhatsApp** delivery method turned on
   — this requires a WhatsApp Business sender configured in the Console).
4. In **Authentication Methods → Social**, configure the **Apple**, **Microsoft**,
   **Google**, and **Facebook** OAuth providers (client IDs/secrets from each
   provider).

## 3. Install & run

```bash
npm install

# Android
npm run android

# iOS (macOS only)
cd ios && pod install && cd ..
npm run ios
```

## 4. Native configuration (already wired up)

These are already set in this repo — listed so you know what powers each feature.

### Social + magic link redirect (deep link)
Social sign-in opens the provider in the browser, and magic link sign-in opens
the emailed link; both return to the app via the same custom scheme
**`memberportal://auth`** (see `AUTH_REDIRECT_URL` in `src/config/index.ts`).

- **iOS** — `ios/MemberPortal/Info.plist` registers the `memberportal` URL scheme,
  and `ios/MemberPortal/AppDelegate.swift` forwards the URL to `RCTLinkingManager`.
- **Android** — `android/app/src/main/AndroidManifest.xml` has a `VIEW`
  intent-filter for `memberportal://auth` on a `singleTask` MainActivity.

> In the Descope Console, add `memberportal://auth` to the project's list of
> **approved redirect URLs** for both OAuth and Magic Link.

### Biometrics
- **iOS** — `NSFaceIDUsageDescription` is set in `Info.plist`.
- **Android** — `USE_BIOMETRIC` / `USE_FINGERPRINT` permissions are in the manifest.

### Passkeys setup (extra platform work required)
Passkeys use a Descope **Flow** rendered in `FlowView`. To make the native
passkey ceremony work you must associate your app with a web domain:

1. In the Descope Flow editor, create/enable a flow with **Passkeys** and set
   `PASSKEY_FLOW_ID` in `src/config/index.ts` (default `sign-up-or-in`).
2. **iOS** — add the **Associated Domains** capability in Xcode with
   `webcredentials:<your-domain>`; host `/.well-known/apple-app-site-association`.
3. **Android** — host `/.well-known/assetlinks.json` for your domain and package.
4. **Apple sign-in** additionally needs the *Sign in with Apple* capability in Xcode.

See the Descope docs: https://docs.descope.com (Mobile → React Native, and
Passkeys / WebAuthn).

## 5. How each auth method flows

- **Email/password** → `useAuth().signUpWithEmail` / `signInWithEmail` →
  `manageSession(resp.data)` sets the active session → app shows the Portal.
- **Social** → `signInWithOAuth(provider)` opens the browser; on return
  `useAuthDeepLink` exchanges the `code` and sets the session.
- **Magic link** → `signInWithMagicLink` / `signUpWithMagicLink` emails a link;
  on return `useAuthDeepLink` verifies the `t` token and sets the session.
- **WhatsApp** → `WhatsAppScreen` collects a phone number, sends a code via
  `sendWhatsAppOtp`, then `verifyWhatsAppOtp` exchanges the entered code for a
  session.
- **Biometric** → after any successful sign-in the app *asks* (native confirm
  dialog, never silent) whether to save the refresh token behind biometrics.
  The Welcome screen and the Login screen's method grid then show a biometric
  option, which reads the token (OS prompt) and calls `descope.refresh`.
- **Passkey** → the *Sign in / Register with a passkey* buttons open
  `PasskeyScreen`, which runs the passkey Flow and calls `manageSession` on
  success.

### Troubleshooting: biometric enrollment doesn't "stick"
`enableBiometricLogin` does **not** require `SECURITY_LEVEL.SECURE_HARDWARE`
(no Secure Enclave) — the iOS Simulator and some older devices don't have one,
which used to make the Keychain write throw and silently fail. If you're
testing Face ID in the **Simulator**, you also need to turn it on yourself:
**Features → Face ID → Enrolled**, then approve prompts via **Features → Face
ID → Matching Face**.

## Notes & limitations

- This is a POC. There is intentionally no backend — Descope **is** the backend.
- iOS builds require a Mac; on Windows you can build and run the Android app.
- For App Store release, Apple requires **native** *Sign in with Apple*; the
  passkey Flow path (with the Apple capability) satisfies this. The web-OAuth
  Apple button here is fine for development/Android.

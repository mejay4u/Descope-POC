# Member Portal

A **front-end-only** React Native app (iOS + Android) that uses **Descope** as its
identity provider. There is **no custom backend** — every auth operation talks
directly to Descope's hosted service using your Project ID.

## Features

| Feature | How it's implemented |
| --- | --- |
| **Welcome screen** with *Sign In* / *Create Account* buttons | `src/screens/WelcomeScreen.tsx` |
| **Login** — email + password, show/hide password, "Remember username", "Forgot password?" | `descope.password.signIn` / `descope.password.sendReset` (`src/screens/LoginScreen.tsx`) |
| **Register** — 5-step wizard (personal info → verify email → review → set password → success) | `descope.otp.signUp.email` → `otp.verify.email` → `password.update` (`src/screens/register/`) |
| **Biometric sign-in** — Face ID / Touch ID / Fingerprint | Refresh token stored in the Keychain/Keystore behind biometrics (`react-native-keychain`), then `descope.refresh`. The app **asks** before enabling it (never silently) after any successful sign-in. Shown as its own button on the Login screen once enabled. |
| **Member portal / home** | `src/screens/PortalScreen.tsx` — profile, biometric toggle, sign out |

Session state is gated in `src/navigation/RootNavigator.tsx`: while a session
exists the app shows the Portal, otherwise the Welcome/Login/Register flow.

This app intentionally matches a specific design reference (Welcome + Sign In
+ multi-step Create Account) rather than offering every Descope-supported
method — no social login, magic link, WhatsApp OTP, or passkeys. Those are
straightforward to add back through the same `descopeService.ts` pattern if a
future design calls for them.

## Project structure

```
src/
  config/index.ts          # Descope Project ID, auth redirect scheme (used by password reset)
  theme/                   # colors, spacing, typography
  branding/                # BrandingContext (injectable logo/app name/tagline/button), DefaultLogo
  services/
    descopeService.ts      # framework-agnostic wrapper — every raw `descope.*` call lives here
    useDescopeService.ts   # binds descopeService to the current useDescope() instance
  components/              # AppButton (branding-injectable), DefaultAppButton, TextField,
                            # StepProgress, Banner, icons/
  auth/
    useAuth.ts             # React binding over descopeService — session state + biometric prompts
    biometricStore.ts      # biometric-gated Keychain storage of the refresh token
    rememberedEmail.ts     # local (non-biometric) Keychain storage for "Remember username"
  navigation/              # RootNavigator + route types
  screens/
    register/               # RegisterScreen (orchestrator) + one file per wizard step
    WelcomeScreen.tsx, LoginScreen.tsx, PortalScreen.tsx
App.tsx                    # wraps everything in Descope's <AuthProvider> + <BrandingProvider>
```

### Architecture: service layer + dependency injection

- **`descopeService.ts`** is the only place in the app that calls `descope.*`
  directly. It takes the SDK instance as a constructor argument
  (`createDescopeService(sdk)`) and returns plain async methods — no React,
  no hooks — so it's trivial to unit test or reuse outside a component.
  `useAuth` is a thin React layer on top of it: it calls the service, then
  applies the resulting session (`manageSession`/biometric-enrollment
  prompt), which *is* inherently React-context-bound.
- **Branding is dependency-injected via `BrandingContext`.** `App.tsx` wraps
  the tree in `<BrandingProvider>`; screens read `appName` / `tagline` /
  `Logo` via `useBranding()` instead of hardcoding them (see
  `WelcomeScreen.tsx` / `LoginScreen.tsx`). `AppButton` is itself just a
  selector — it renders whatever `Button` component the branding config
  supplies, falling back to `DefaultAppButton`. To white-label the app for a
  different deployment, pass a `value` prop into `BrandingProvider` in
  `App.tsx`:
  ```tsx
  <BrandingProvider value={{ appName: 'Acme Health', Logo: AcmeLogo }}>
  ```
  No screen code needs to change — every button and the logo/app name update
  automatically everywhere they're used.

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
3. In the Descope Console → **Authentication Methods**, enable **Passwords**
   and **OTP** with the **Email** delivery method (used by the registration
   wizard).

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

### Password reset redirect
`descope.password.sendReset` is passed the custom scheme
**`memberportal://auth`** (see `AUTH_REDIRECT_URL` in `src/config/index.ts`)
as its redirect URL. The app doesn't currently handle an incoming deep link
for this (there's no OAuth/magic-link flow left to complete) — the user
resets their password on the web page Descope emails them, then comes back
and signs in normally. The scheme registration below is left in place in
case a future feature needs it again:

- **iOS** — `ios/MemberPortal/Info.plist` registers the `memberportal` URL scheme,
  and `ios/MemberPortal/AppDelegate.swift` forwards the URL to `RCTLinkingManager`.
- **Android** — `android/app/src/main/AndroidManifest.xml` has a `VIEW`
  intent-filter for `memberportal://auth` on a `singleTask` MainActivity.

### Biometrics
- **iOS** — `NSFaceIDUsageDescription` is set in `Info.plist`.
- **Android** — `USE_BIOMETRIC` / `USE_FINGERPRINT` permissions are in the manifest.

## 5. How each auth method flows

- **Email/password sign-in** → `useAuth().signInWithEmail` →
  `manageSession(resp.data)` sets the active session → app shows the Portal.
  "Remember username" (checked by default once set) saves the email locally
  via `rememberedEmail.ts` and pre-fills it on the next launch.
- **Forgot password** → `requestPasswordReset` calls `descope.password.sendReset`,
  inline on the Login screen.
- **Register** → `screens/register/RegisterScreen.tsx` orchestrates a 5-step
  wizard, each step its own component in the same folder:
  1. *Personal information* (name, DOB, zip, email, phone) → `startRegistration`
     calls `descope.otp.signUp.email`, creating an unverified user and emailing
     a 6-digit code.
  2. *Verify email* → `verifyRegistrationCode` calls `descope.otp.verify.email`,
     which returns a session — held in local state, **not** applied yet (so the
     app doesn't jump into the Portal mid-wizard).
  3. *Review your information* — read-only confirmation, editable by going
     back to step 1.
  4. *Set a password* → `completeRegistration` calls `descope.password.update`
     with the held session token, attaching a password to the account.
  5. *Success* → tapping "Continue" calls `finishRegistration`, which finally
     applies the held session (`manageSession` + the biometric-enrollment
     prompt) — that's what shows the Portal.

  Date of birth and zip code are collected by the UI but **not yet persisted**
  — Descope's client-side `User` type only supports name/email/phone. Storing
  them as custom user attributes needs either a Descope Flow action or the
  server-side Management SDK; wiring that up is a follow-up once the
  corresponding Descope Flow exists.
- **Biometric** → after any successful sign-in the app *asks* (native confirm
  dialog, never silent) whether to save the refresh token behind biometrics.
  The Login screen then shows a "Sign in with Face ID/Fingerprint" button,
  which reads the token (OS prompt) and calls `descope.refresh`.

### Troubleshooting: biometric enrollment doesn't "stick"
`enableBiometricLogin` does **not** require `SECURITY_LEVEL.SECURE_HARDWARE`
(no Secure Enclave) — the iOS Simulator and some older devices don't have one,
which used to make the Keychain write throw and silently fail. If you're
testing Face ID in the **Simulator**, you also need to turn it on yourself:
**Features → Face ID → Enrolled**, then approve prompts via **Features → Face
ID → Matching Face**.

## Notes & limitations

- This is a POC. There is intentionally no backend — Descope **is** the backend.
- **TODO:** persist date of birth / zip code (collected in the Register wizard)
  as Descope custom user attributes once the corresponding Descope Flow is
  built — see "How each auth method flows → Register" above.
- iOS builds require a Mac; on Windows you can build and run the Android app.

# Member Portal

A React Native app (iOS + Android) that uses **Descope** as its identity
provider, with member data kept in its own database behind a .NET API.

**Registration is a native wizard driven by the SDK.** The app runs the screens
itself and calls `descope.otp.signUp/verify.email` to prove the member owns
their email address, then calls the .NET API to store the member record and the
password. No Descope-hosted UI, no flow to configure.

| | Descope | .NET Registration API |
| --- | --- | --- |
| **Owns** | the email address (login ID), sessions, biometrics, passkeys | the member record: name, DOB, zip, contact number — **and the password** |
| **During registration** | sends and verifies the email OTP; issues the session | stores the record, then hashes and stores the password |
| **Never sees** | the password, or any profile field | — |

Registration information is **not** stored in Descope: its user record is a
passwordless, email-only record. The server-side contract is in
[`docs/dotnet-registration-api.md`](../docs/dotnet-registration-api.md).

## Features

| Feature | How it's implemented |
| --- | --- |
| **Welcome screen** with *Sign In* / *Create Account* buttons | `src/screens/WelcomeScreen.tsx` |
| **Login** — email + password, show/hide password, "Remember username", "Forgot password?" | `descope.password.signIn` / `descope.password.sendReset` (`src/screens/LoginScreen.tsx`) |
| **Register** — a 6-step native wizard | Personal Information → Verify Email → Review → Create Account → *(5: membership check, not built)* → All set (`src/screens/register/`). `descope.otp.signUp.email` → `otp.verify.email` for the email check, then `POST /api/initiateRegistration` and `POST /api/registration/password` on the .NET API (`src/services/memberApi.ts`) |
| **Biometric sign-in** — Face ID / Touch ID / Fingerprint | Explicit OS biometric prompt (`react-native-biometrics`) gating a Keychain-stored refresh token (`react-native-keychain`), then `descope.refresh` + `descope.me`. The app **asks** before enabling it (never silently) after any successful sign-in. The Login screen always shows the biometric button so the feature is discoverable: if biometrics is disabled at the OS level a native alert shows the OS's own message (with an Open Settings shortcut); if it isn't set up in-app yet the user is pointed at password sign-in; after 5 failed scans the button hides for that visit and the user is asked to use their password. The Portal's enable/disable toggle is likewise always visible, disabled (with the OS message on tap) while OS-level biometrics is off. |
| **Passkey sign-in** — WebAuthn (Face ID / Touch ID / fingerprint / security key) | Runs a Descope **Flow** in a browser via `useFlow().start()` (`src/screens/PasskeyScreen.tsx`), making it a *web* passkey on Descope's domain, so **no iOS Associated Domains entitlement / hosted AASA is required**. Entry points: a "Sign in with a passkey" button on both the Welcome and Login screens (`mode: 'signin'`), and an "Add a passkey" action in the Portal (`mode: 'signup'`, runs authenticated). Gated on the two `PASSKEY_*_FLOW_ID`s in `src/config` — see "Passkeys setup" below. |
| **Inactivity auto sign-out** | `src/auth/InactivityGate.tsx` — after a period with no interaction (default 5 min, incl. time backgrounded) the session is cleared. Because sign-out keeps the biometric-stored refresh token, the user returns to the Login screen and signs back in with Face ID / Touch ID / fingerprint. |
| **Member portal / home** | `src/screens/PortalScreen.tsx` — profile, biometric toggle, add-a-passkey, sign out |

Session state is gated in `src/navigation/RootNavigator.tsx`: while a session
exists the app shows the Portal, otherwise the Welcome/Login/Register flow. On a
**cold start** (the app was killed and reopened — detected via `auth/coldStart.ts`)
the persisted session is cleared before routing, so the app opens on the sign-in
flow rather than silently restoring the Portal. The biometric token is kept, so
Face ID / Touch ID sign-in still works from there.

This app intentionally matches a specific design reference (Welcome + Sign In
+ multi-step Create Account) rather than offering every Descope-supported
method — no social login, magic link, or WhatsApp OTP. Those are
straightforward to add back through the same `descopeService.ts` pattern if a
future design calls for them. Passkeys are the exception: they can't be driven
by a direct SDK call from React Native, so they run through a Descope Flow
(see "Passkeys setup").

## Project structure

```
src/
  config/index.ts          # Descope Project ID, member API base URL, passkey flow IDs
  theme/                   # colors, spacing, typography
  branding/                # BrandingContext (injectable logo/app name/tagline/button), DefaultLogo
  services/
    descopeService.ts      # framework-agnostic wrapper — every raw `descope.*` call lives here
    useDescopeService.ts   # binds descopeService to the current useDescope() instance
    memberApi.ts           # client for the .NET API (member record + password)
  components/              # AppButton (branding-injectable), DefaultAppButton, TextField,
                            # StepProgress, Banner, icons/
  auth/
    useAuth.ts             # React binding over descopeService — session state + biometric prompts
    biometricStore.ts      # biometric-gated Keychain storage of the refresh token
    rememberedEmail.ts     # local (non-biometric) Keychain storage for "Remember username"
  navigation/              # RootNavigator + route types
  screens/
    register/              # RegisterScreen (wizard orchestrator) + one component per step
    WelcomeScreen.tsx, LoginScreen.tsx, PasskeyScreen.tsx, PortalScreen.tsx
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
- **`memberApi.ts`** is the same idea for the .NET API: plain async functions
  (no SDK to inject, so no factory), returning the same
  `{ ok: true, data } | { ok: false, error }` shape with an already-user-facing
  error message. Screens reach both services through `useAuth`.
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
3. In the Descope Console → **Authentication Methods**, enable **OTP** with the
   **Email** delivery method (used by the registration flow). **Passwords** is
   only needed for the existing Descope-backed sign-in — registration doesn't
   set a password there.

## 2b. Configure the .NET API (required for registration)

Point the app at your registration API in [`src/config/index.ts`](src/config/index.ts):

```ts
export const MEMBER_API_BASE_URL = 'https://api.memberportal.example.com';
```

From a simulator/emulator against a local dev server, use `http://localhost:5000` (iOS) or
`http://10.0.2.2:5000` (Android — `localhost` is the emulator itself). Plain `http` also needs an ATS
exception on iOS and `usesCleartextTraffic` on Android, so prefer https.

Until this is set, the wizard's steps 1–2 (email + OTP) still work and steps 3–4 fail with "The
Member Portal service is not configured."

The two endpoints, their request/response shapes and how the API validates the Descope token are
documented in [`docs/dotnet-registration-api.md`](../docs/dotnet-registration-api.md).

### Passkeys setup (optional)

The passkey buttons (Welcome, Login, and the Portal's "Add a passkey") run a
Descope **Flow** in a **browser** — `useFlow().start()` with
ASWebAuthenticationSession on iOS / Custom Tabs on Android
(`src/screens/PasskeyScreen.tsx`). Because the flow runs on Descope's own hosted
domain, the passkey is a **web passkey** tied to that domain, so there's **no
iOS Associated Domains entitlement / apple-app-site-association and no Android
assetlinks.json** to set up.

(`FlowView` would keep it in-app, but it bridges to *native* passkeys, which do
need the Associated Domains entitlement — and its ceremony misbehaves on the iOS
Simulator. Registration doesn't use flows at all — it's a native wizard on
direct SDK calls.)

To enable it:

1. In the Console → **Flows**, create (or pick) two flows: a **sign-in** flow
   with passkeys enabled, and an **add-passkey** flow. They're different because
   signing in (logged out) and adding a passkey to an existing account (logged
   in) are different operations — reusing the add flow for sign-in shows a blank
   screen.
2. Put the flow IDs in [`src/config/index.ts`](src/config/index.ts):
   ```ts
   export const PASSKEY_SIGNIN_FLOW_ID = 'sign-in-passkeys-or-otp'; // Welcome/Login
   export const PASSKEY_ADD_FLOW_ID = 'add-passkeys';               // Portal "Add a passkey"
   ```
   (`isPasskeyConfigured()` gates the buttons on both flow IDs plus the Project
   ID.) That's the only setup — no redirect URLs, no native entitlements.

**Testing note:** passkey creation can be unreliable on the **iOS Simulator**
(errors like `Could not register system wide server: -25204`). If it misbehaves,
sign the Simulator into iCloud and enroll Face ID (Features → Face ID →
Enrolled), or test on a physical device.

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
- **Register** → `screens/register/RegisterScreen.tsx` orchestrates the wizard,
  each step its own component in the same folder:
  1. *Personal Information* (name, DOB, zip, email, optional contact number) →
     `startRegistration` calls `descope.otp.signUp.email` with **the email
     alone**, creating a passwordless, email-only user and emailing a 6-digit
     code. The rest of the form stays in local state for now.
  2. *Verify Email* → `verifyRegistrationCode` calls `descope.otp.verify.email`,
     which returns a session — held in local state, **not** applied yet (so the
     app doesn't jump into the Portal mid-wizard). It authenticates steps 3–4.
  3. *Review Your Information* — read-only confirmation, editable by going back
     to step 1. "Confirm & Continue" is what writes the record:
     `saveRegistrationDetails` → `POST /api/initiateRegistration`, returning the
     `userId`. Writing it here rather than the moment the OTP is verified means
     edits on the review step can't leave a stale record behind.
  4. *Create Account* → `createMemberAccount` → `POST
     /api/registration/password`. **Descope never receives the password.** The
     API hashes it and promotes the pending record to a real user. The on-screen
     checklist and strength meter are generated from `PASSWORD_POLICY` in
     `types.ts` — keep it in step with the API's `PasswordPolicy` config.
  5. *(Membership check — not built.)* The design's progress bar counts six
     steps; step 5 is the SSN/eligibility check. The wizard currently skips
     straight to the success screen, and the stepper still counts to six so the
     numbering doesn't shift when it lands.
  6. *All set* → "Go to Dashboard" calls `finishRegistration`, which finally
     applies the session held since step 2 (`manageSession` + the
     biometric-enrollment prompt) — that's what shows the Portal. That session
     is still valid because no password change ever revoked it.
- **Biometric** → after any successful sign-in the app *asks* (native confirm
  dialog, never silent) whether to save the refresh token for biometric
  sign-in. The Login screen then shows a "Sign in with Face ID/Fingerprint"
  button, which shows an explicit OS biometric prompt
  (`react-native-biometrics`), reads the token from the Keychain, and calls
  `descope.refresh` (+ `descope.me` for the user profile). Signing out with
  biometrics enabled only locks the app locally — the refresh token isn't
  revoked server-side, which is what lets biometrics unlock it again.

  The prompt is app-level (LocalAuthentication / BiometricPrompt) rather than
  Keychain access control, for two reasons: the iOS **Simulator doesn't
  enforce Keychain biometric access control** (reads silently succeed with no
  Face ID sheet), and combining both mechanisms would double-prompt on real
  devices. The token stays encrypted at rest in the Keychain, device-only.

### Troubleshooting: testing Face ID in the Simulator
Enable it yourself: **Features → Face ID → Enrolled**, then approve the
prompt via **Features → Face ID → Matching Face** when it appears.

## Notes & limitations

- This is a POC. Descope is the IdP; the .NET registration API owns member data
  and passwords, and doesn't live in this repo — only the app that calls it.
- **Registration needs the API running.** Steps 1–2 work against Descope alone;
  steps 3–4 need `MEMBER_API_BASE_URL` pointed at a reachable service.
- **Step 5 (membership/eligibility) isn't built** — no SSN, no Facets lookup, no
  subscriber/plan claims. An earlier draft is on the AUTH-API repo's
  `claude/registration-descope-passthru` branch.
- **Sign-in still goes through Descope** (`descope.password.signIn`). Since
  registration stores the password in the .NET database instead, that call only
  succeeds for accounts Descope already holds a password for — until sign-in is
  pointed at that database. Same for "Forgot password", which currently sends
  Descope's own reset email. Newly registered members can still get in via the
  OTP/passkey sign-in flow.
- Biometric sign-in and passkeys are unaffected: both work off the Descope
  session/refresh token, not the password.
- iOS builds require a Mac; on Windows you can build and run the Android app.

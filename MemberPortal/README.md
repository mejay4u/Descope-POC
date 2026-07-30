# Member Portal

A React Native app (iOS + Android) that uses **Descope** as its identity
provider, with member data kept in its own database behind a .NET API.

**Registration is a Descope Flow.** The flow — built in the Console — renders the
screens, verifies the email by OTP, and its **engine calls the .NET API
server-to-server** through HTTP connectors to store the member record and the
password. The app is a thin host: it embeds the flow in a `FlowView` and applies
the session the flow finishes with. It never collects the data and never calls
the API itself.

| | Descope | .NET Registration API |
| --- | --- | --- |
| **Owns** | the email address (login ID), sessions, biometrics, passkeys | the member record: name, DOB, zip, contact number — **and the password** |
| **During registration** | renders the screens, sends and verifies the email OTP, calls the API, issues the session | stores the record, then hashes and stores the password |
| **Never sees** | the password, or any profile field | — |

Registration information is **not** stored in Descope: its user record is a
passwordless, email-only record. (The details do pass through Descope's *flow
state* in transit — see [`docs/architecture.md`](../docs/architecture.md).)
Build instructions for the flow are in
[`docs/descope-registration-flow-setup.md`](../docs/descope-registration-flow-setup.md);
the server-side contract is in
[`docs/dotnet-registration-api.md`](../docs/dotnet-registration-api.md).

## Features

| Feature | How it's implemented |
| --- | --- |
| **Welcome screen** with *Sign In* / *Create Account* buttons | `src/screens/WelcomeScreen.tsx` |
| **Login** — email + password, show/hide password, "Remember username", "Forgot password?" | `descope.password.signIn` / `descope.password.sendReset` (`src/screens/LoginScreen.tsx`) |
| **Register** — a Descope Flow embedded in the app | `src/screens/RegisterScreen.tsx` hosts the flow with `FlowView` + `useHostedFlowUrl(REGISTER_FLOW_ID)`. Descope renders Personal Information → Verify Email → Create Account, and its engine calls `POST /api/initiateRegistration` and `POST /api/registration/password`. Only the final "You're all set!" screen stays native (`src/screens/register/SuccessStep.tsx`), so the biometric-enrollment prompt keeps happening in our UI |
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

This app intentionally offers a specific set of methods rather than every
Descope-supported one — no social login, magic link, or WhatsApp OTP. Those are
straightforward to add through the same `descopeService.ts` pattern if a future
design calls for them.

**Sign-in is native and SDK-driven; registration and passkeys are flows.** The
Figma designs for the registration steps (Personal Information, Verify Email,
Review, Create Account) are rebuilt as flow screens in the Console — the app
can't render them, because it never sees the entered values. That is the cost of
having Descope's engine make the API calls; the reasoning is recorded in
[`docs/architecture.md`](../docs/architecture.md).

## Project structure

```
src/
  config/index.ts          # Descope Project ID, registration flow ID, passkey flow IDs
  theme/                   # colors, spacing, typography
  branding/                # BrandingContext (injectable logo/app name/tagline/button), DefaultLogo
  services/
    descopeService.ts      # framework-agnostic wrapper — every raw `descope.*` call lives here
    useDescopeService.ts   # binds descopeService to the current useDescope() instance
  components/              # AppButton (branding-injectable), DefaultAppButton, TextField,
                            # Banner, icons/
  auth/
    useAuth.ts             # React binding over descopeService — session state + biometric prompts
    biometricStore.ts      # biometric-gated Keychain storage of the refresh token
    rememberedEmail.ts     # local (non-biometric) Keychain storage for "Remember username"
  navigation/              # RootNavigator + route types
  screens/
    RegisterScreen.tsx     # hosts the Descope registration flow in a FlowView
    register/              # SuccessStep ("You're all set!") + shared styles
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
- **There is no client for the .NET API**, deliberately. The app used to have a
  `memberApi.ts`; under the flow architecture the Descope engine makes those
  calls, so the app has no base URL to configure and no member data to post.
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

## 2b. Build the registration flow (required for registration)

Registration runs entirely inside a Descope flow, so it has to exist before the
Create Account button does anything. Build it by following
[`docs/descope-registration-flow-setup.md`](../docs/descope-registration-flow-setup.md),
then put its ID in [`src/config/index.ts`](src/config/index.ts):

```ts
export const REGISTER_FLOW_ID = 'member-registration';
```

`isRegistrationFlowConfigured()` gates the screen on this plus the Project ID —
until both are set, Create Account shows a "not set up yet" panel instead of an
empty webview.

**The .NET API is not configured in the app at all.** Its base URL lives on the
Descope **connectors**, because Descope is what calls it. That also means the
API has to be reachable from Descope's cloud — a tunnel or a deployed
environment, never `localhost` or `10.0.2.2`.

The two endpoints, their request/response shapes and the connector-key auth are
documented in [`docs/dotnet-registration-api.md`](../docs/dotnet-registration-api.md),
and the reasoning behind the split is in [`docs/architecture.md`](../docs/architecture.md).

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
Simulator. Registration uses `FlowView` precisely because it has no such
requirement: it's ordinary screens plus an OTP, so keeping it in-app is free.)

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
- **Register** → `screens/RegisterScreen.tsx` renders a `FlowView` pointed at
  `useHostedFlowUrl(REGISTER_FLOW_ID)` and then gets out of the way. Everything
  up to the session happens inside the flow:
  1. *Personal Information* (name, DOB, zip, email, optional contact number) —
     a flow screen; the values live in Descope's **flow state**, not in the app.
  2. *Verify Email* — the flow sends and verifies a 6-digit OTP.
  3. The flow's connector calls `POST /api/initiateRegistration`, and captures
     the returned `userId` into flow state. Descope then creates its
     passwordless, **email-only** user.
  4. *Create Account* — a flow screen; its connector calls `POST
     /api/registration/password` with that `userId`. **Descope never receives
     the password.** The API hashes it and promotes the pending record to a real
     user. The screen's rules must match the API's `PasswordPolicy` config —
     they're configured in two different places now, so they can drift.
  5. *(Membership check — not built.)* Phase 4 of the sequence diagram: the
     SSN/eligibility lookup. The flow ends after the password call.
  6. The flow finishes and hands the app a session over `FlowView`'s
     `onSuccess`. The app **holds** it rather than applying it immediately —
     applying it would swap the navigator to the Portal and the native
     *All set* screen would never be seen. "Go to Dashboard" then calls
     `finishRegistration`, which applies it (`manageSession` + the
     biometric-enrollment prompt).
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
  and passwords, and doesn't live in this repo — nor does the flow that calls
  it, which is Console configuration.
- **Registration needs the flow built and the API reachable from Descope's
  cloud.** Nothing about it can be tested from the app alone.
- **The registration steps now live in a vendor console, not in git** — they
  aren't code-reviewed, unit-tested or revertible with `git revert`, and edits
  reach members instantly with no app-release gate. That is an accepted cost of
  having Descope's engine call the API; see `docs/architecture.md`.
- **Phase 4 (membership/eligibility) isn't built** — no SSN, no Facets lookup, no
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

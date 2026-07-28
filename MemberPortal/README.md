# Member Portal

A React Native app (iOS + Android) that uses **Descope** as its identity
provider, with member data kept in **ARTS DB** behind a .NET BFF.

**Registration is driven by a Descope Flow but rendered with this app's own
native screens.** The flow runs *headlessly*: Descope keeps the logic, the OTP
delivery, and — the point of the passthru model — the HTTP connectors calling
the BFF at each phase, while the app renders every screen itself. No webview,
no Descope-styled UI. The app never calls the BFF directly; it feeds input into
the flow and applies the enriched session JWT the flow finishes with.

| | Descope | .NET BFF (+ ARTS DB / Facets) |
| --- | --- | --- |
| **Owns** | the email address (login ID), the flow UI and state, sessions, biometrics, passkeys | the member record: name, DOB, zip, SSN/member info — **and the password** |
| **During registration** | collects the input, verifies the OTP, calls the BFF, mints the enriched JWT | stores the record, validates and stores the password, checks eligibility against Facets |
| **Never sees** | the password, or any profile field | — |

Registration information is **not** stored in Descope: its user record is a
passwordless, email-only shadow record, created only after the BFF confirms the
member record exists. The server-side contract is in
[`docs/dotnet-registration-api.md`](../docs/dotnet-registration-api.md).

## Features

| Feature | How it's implemented |
| --- | --- |
| **Welcome screen** with *Sign In* / *Create Account* buttons | `src/screens/WelcomeScreen.tsx` |
| **Login** — email + password, show/hide password, "Remember username", "Forgot password?" | `descope.password.signIn` / `descope.password.sendReset` (`src/screens/LoginScreen.tsx`) |
| **Register** — a Descope Flow with native screens | `descope.flow.start`/`flow.next` in custom-screen mode (`src/services/flowRunner.ts`) driving one native step per flow screen (`src/screens/register/`). The flow's four phases (details → OTP → password → SSN/eligibility) and the BFF calls behind them are configured in the Descope Console — see "Registration flow setup" |
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
  config/index.ts          # Descope Project ID, flow IDs, auth redirect scheme
  theme/                   # colors, spacing, typography
  branding/                # BrandingContext (injectable logo/app name/tagline/button), DefaultLogo
  services/
    descopeService.ts      # framework-agnostic wrapper — every raw `descope.*` call lives here
    useDescopeService.ts   # binds descopeService to the current useDescope() instance
    flowRunner.ts          # drives a Descope flow headlessly (custom screens)
    useFlowRunner.ts       # binds flowRunner to the current useDescope() instance
  components/              # AppButton (branding-injectable), DefaultAppButton, TextField,
                            # StepProgress, Banner, icons/
  auth/
    useAuth.ts             # React binding over descopeService — session state + biometric prompts
    biometricStore.ts      # biometric-gated Keychain storage of the refresh token
    rememberedEmail.ts     # local (non-biometric) Keychain storage for "Remember username"
  navigation/              # RootNavigator + route types
  screens/
    register/              # RegisterScreen (drives the flow) + one component per
                            # flow screen + flowScreens.ts (the ID mapping)
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
- **`flowRunner.ts`** is the same pattern for flows: `createFlowRunner(sdk)`
  wraps `flow.start` / `flow.next` in custom-screen mode and normalizes each
  response into one of three things the UI cares about — *render this screen*,
  *here's your session*, or *this failed*. `RegisterScreen` is then a small
  state machine over that, and `useAuth` contributes only
  `finishRegistration` to apply the resulting session.
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

## 2b. Registration flow setup (required for registration)

Registration is a Descope Flow, so most of it is built in the Console rather
than in this repo. The app only needs the flow's ID:

```ts
export const REGISTER_FLOW_ID = 'member-registration';
```

`isRegistrationFlowConfigured()` gates the screen on that plus the Project ID;
until both are set, the Register screen says so instead of failing silently.

### Matching the flow's screens to the app's

The flow runs with **custom screens**: it decides what to show and the app
decides how to render it. Descope identifies each screen by an ID and each
action on it by an interaction ID, both defined by the flow. The mapping lives
in one file — [`src/screens/register/flowScreens.ts`](src/screens/register/flowScreens.ts) —
and it's the only thing that needs changing when the flow changes:

```ts
{ screenId: 'verify-email', step: 'verify', submit: 'submit', secondary: 'resend' }
```

The IDs shipped there are placeholders. To find the real ones, run the flow
once: any screen the app doesn't recognise is displayed by name ("The flow asked
for *x*, which isn't in SCREEN_MAPPINGS") rather than rendering blank, so the
flow tells you its own IDs as you step through it. `FLOW_FIELDS` in the same
file maps our field names to the flow's input names — get these wrong and the
connector posts nulls to the BFF.

In the Console → **Flows**, the flow needs four phases and three HTTP connector
calls to the BFF:

| Phase | Flow screens | Calls the BFF |
| --- | --- | --- |
| 1. Collect details | email, first name, last name, DOB, zip → held in flow state; OTP emailed | — |
| 2. Verify + sync | OTP entry and validation | `POST /api/initiateRegistration` → member record created *Pending*, returns userID. The Descope user (email-only shadow record) is created **after** this succeeds |
| 3. Password | password + confirmation | posts them to the BFF, which validates and stores the hash |
| 4. Complete | SSN / member info | `POST /api/completeRegistration` → eligibility checked against Facets; `subscriberId` and `planId` come back and are mapped into custom JWT claims |

Each of those screens is rendered natively by the matching component in
`src/screens/register/` — the flow supplies the steps and the logic, not the
look. It ends by issuing the enriched session JWT, which arrives as a
`completed` status and is applied by `finishRegistration`.

The BFF side of this — endpoint shapes, how Descope authenticates to it, the
data model, and the open questions still to settle — is documented in
[`docs/dotnet-registration-api.md`](../docs/dotnet-registration-api.md).

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
Simulator. Registration uses a different mechanism again: a headless flow with
native screens, which involves no passkey ceremony at all.)

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
- **Register** → `screens/register/RegisterScreen.tsx` starts the flow, then
  loops: read the screen the flow asked for, render the matching native step,
  send the member's input back with that screen's interaction ID. The four
  phases, their order, and the BFF calls between them live in the flow (see
  "Registration flow setup" above) — the app supplies the UI and nothing else,
  and never calls the BFF itself. When the flow reports `completed` it returns
  the enriched session JWT; `finishRegistration` applies it (`manageSession` +
  the biometric-enrollment prompt), which swaps the navigator to the Portal.

  Errors come back two ways and are handled differently: a `failed` status ends
  the flow, while a wrong OTP arrives as an error *attached to the same screen*,
  so the step re-renders with the message rather than dropping the member out.

  There's no going back a step — the flow holds its state server-side, so the
  wizard header's back button leaves registration rather than returning to the
  previous screen.
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

- This is a POC. Descope is the IdP; the .NET BFF owns member data and
  passwords. Neither the flow (Descope Console) nor the BFF lives in this repo —
  only the app that hosts them.
- **Registration can't be exercised from this repo alone.** It needs the flow
  built in the Console with its connectors pointed at a running BFF. Until
  `REGISTER_FLOW_ID` is set the Register screen says so rather than failing
  silently.
- **Sign-in still goes through Descope** (`descope.password.signIn`). Since
  registration stores the password in ARTS DB instead, that call only succeeds
  for accounts Descope already holds a password for — until the login flow
  proxies password validation to the BFF (Login Flow A in the sequence
  diagram). Same for "Forgot password", which currently sends Descope's own
  reset email. Newly registered members can still get in via the OTP/passkey
  sign-in flow.
- Biometric sign-in and passkeys are unaffected: both work off the Descope
  session/refresh token, not the password.
- iOS builds require a Mac; on Windows you can build and run the Android app.

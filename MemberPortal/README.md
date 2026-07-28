# Member Portal

A React Native app (iOS + Android) that uses **Descope** as its identity
provider, with member data kept in the **MemberPortal database** behind a .NET
API.

The split matters, and it's deliberate:

| | Descope | MemberPortal .NET API |
| --- | --- | --- |
| **Owns** | the email address (login ID), sessions, biometrics, passkeys | the member record: name, date of birth, zip, phone — **and the password** |
| **During registration** | emails the OTP and verifies it; that's all | stores the registration record, then the password the member chooses |
| **Never sees** | the password, or any profile field | — |

So registration information is **not** stored in Descope. Descope's only job
there is proving the member owns the email address; the account it creates is a
passwordless, email-only skeleton record.

## Features

| Feature | How it's implemented |
| --- | --- |
| **Welcome screen** with *Sign In* / *Create Account* buttons | `src/screens/WelcomeScreen.tsx` |
| **Login** — email + password, show/hide password, "Remember username", "Forgot password?" | `descope.password.signIn` / `descope.password.sendReset` (`src/screens/LoginScreen.tsx`) |
| **Register** — 5-step wizard (personal info → verify email → review → set password → success) | `descope.otp.signUp.email` → `otp.verify.email` for the email check only, then `POST /api/registrations` and `POST /api/registrations/{id}/password` on the MemberPortal API (`src/screens/register/`, `src/services/memberApi.ts`) |
| **Biometric sign-in** — Face ID / Touch ID / Fingerprint | Explicit OS biometric prompt (`react-native-biometrics`) gating a Keychain-stored refresh token (`react-native-keychain`), then `descope.refresh` + `descope.me`. The app **asks** before enabling it (never silently) after any successful sign-in. The Login screen always shows the biometric button so the feature is discoverable: if biometrics is disabled at the OS level a native alert shows the OS's own message (with an Open Settings shortcut); if it isn't set up in-app yet the user is pointed at password sign-in; after 5 failed scans the button hides for that visit and the user is asked to use their password. The Portal's enable/disable toggle is likewise always visible, disabled (with the OS message on tap) while OS-level biometrics is off. |
| **Passkey sign-in** — WebAuthn (Face ID / Touch ID / fingerprint / security key) | Embeds a Descope **Flow** with `FlowView` (`src/screens/PasskeyScreen.tsx`). FlowView does the passkey ceremony as a *web* passkey on Descope's domain and returns the session via its JS bridge, so **no iOS Associated Domains entitlement / hosted AASA and no redirect-URL config are required**. Entry points: a "Sign in with a passkey" button on both the Welcome and Login screens (`mode: 'signin'`), and an "Add a passkey" action in the Portal (`mode: 'signup'`, runs authenticated). Gated on the two `PASSKEY_*_FLOW_ID`s in `src/config` — see "Passkeys setup" below. |
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
  config/index.ts          # Descope Project ID, MemberPortal API base URL, auth redirect scheme
  theme/                   # colors, spacing, typography
  branding/                # BrandingContext (injectable logo/app name/tagline/button), DefaultLogo
  services/
    descopeService.ts      # framework-agnostic wrapper — every raw `descope.*` call lives here
    useDescopeService.ts   # binds descopeService to the current useDescope() instance
    memberApi.ts           # client for the MemberPortal .NET API (registration record + password)
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
- **`memberApi.ts`** is the same idea for the MemberPortal .NET API: plain
  async functions (no SDK to inject, so no factory), returning the same
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
   **Email** delivery method (used by the registration wizard). **Passwords**
   is only needed for the existing Descope-backed sign-in — registration no
   longer sets a password there.

## 2b. Configure the MemberPortal API (required for registration)

Point the app at your .NET API in [`src/config/index.ts`](src/config/index.ts):

```ts
export const MEMBER_API_BASE_URL = 'https://api.memberportal.example.com';
```

From a simulator/emulator against a local dev server, use
`http://localhost:5000` (iOS) or `http://10.0.2.2:5000` (Android — `localhost`
is the emulator itself). Plain `http` also needs an ATS exception on iOS and
`usesCleartextTraffic` on Android, so prefer https.

Until this is set, the wizard's steps 1–2 (email + OTP) still work and steps
3–4 fail with "The Member Portal service is not configured."

### MemberPortal API contract

Three endpoints, all called from `src/services/memberApi.ts`. The first two are
authenticated with the Descope **session JWT** from the OTP-verify step, sent as
`Authorization: Bearer <sessionJwt>` — that token is the app's proof the email
was just verified, so validate it server-side (standard Descope JWT validation
against your project's JWKS) and take the email from its claims rather than
trusting the request body.

**1. `POST /api/registrations`** — store the registration record.

```jsonc
// request
{
  "firstName": "Jane",
  "lastName": "Member",
  "dateOfBirth": "1985-04-23",   // ISO; the form collects MM/DD/YYYY
  "zipCode": "12345",
  "email": "jane@example.com",
  "phone": "+14155551234"        // null when not provided
}
// 201 Created
{ "memberId": "8f3c…", "status": "Pending" }
```

The email is the natural key. If the member abandoned an earlier attempt and
starts over, return the existing pending record (`200 OK` with the same
`memberId`) instead of a duplicate-key error, so the retry can carry on. The
record stays *Pending* until a password is set.

**2. `POST /api/registrations/{memberId}/password`** — set the password.

```jsonc
// request
{ "password": "…" }
// 204 No Content   (200 with a body is fine too — the app ignores it)
```

The API hashes and stores it. This password is what sign-in must be validated
against; it is never sent to Descope.

**3. `GET /api/registrations/password-policy`** — the rules the wizard's
checklist renders (unauthenticated).

```jsonc
{ "minLength": 8, "lowercase": true, "uppercase": true, "number": true, "nonAlphanumeric": true }
```

Optional: if it's missing or unreachable the app falls back to
`DEFAULT_PASSWORD_POLICY` in `memberApi.ts`. Enforce the same rules server-side
regardless — the checklist is a UI affordance, not validation.

Errors are read from ASP.NET Core's ProblemDetails (`detail` / `title`) or its
validation shape (`errors`), or a plain `{ "message": "…" }`, and shown to the
member as-is, so return something a member can act on ("That date of birth
doesn't match our records"), not an internal exception.

### Passkeys setup (optional)

The passkey buttons (Welcome, Login, and the Portal's "Add a passkey") embed a
Descope **Flow** with **`FlowView`** (`src/screens/PasskeyScreen.tsx`). FlowView
runs the flow in an in-app web view and:

- performs the passkey ceremony via an internal web-auth session on Descope's
  own domain, so it's a **web passkey** — **no iOS Associated Domains
  entitlement / apple-app-site-association and no Android assetlinks.json**, and
- returns the finished session straight through its JS bridge (`onSuccess`), so
  there's **no custom-scheme redirect URL to configure**.

(The SDK also offers a browser-based `useFlow().start()`, but that one needs the
flow to redirect back to a registered app scheme — easy to misconfigure and the
reason sign-in didn't return. FlowView avoids all of it.)

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
- **Register** → `screens/register/RegisterScreen.tsx` orchestrates a 5-step
  wizard, each step its own component in the same folder. Descope handles
  steps 1–2; the MemberPortal API handles steps 3–4:
  1. *Personal information* (name, DOB, zip, email, phone) → `startRegistration`
     calls `descope.otp.signUp.email` with **the email address only**, creating
     a passwordless skeleton user and emailing a 6-digit code. The rest of the
     form stays in local state for now.
  2. *Verify email* → `verifyRegistrationCode` calls `descope.otp.verify.email`,
     which returns a session — held in local state, **not** applied yet (so the
     app doesn't jump into the Portal mid-wizard). It's used to authenticate
     steps 3 and 4.
  3. *Review your information* — read-only confirmation, editable by going back
     to step 1. "Confirm & Continue" is what writes the record:
     `createMemberRegistration` → `POST /api/registrations`, storing the whole
     form (including date of birth and zip) in the MemberPortal DB and
     returning the `memberId`. Creating it here rather than the moment the OTP
     is verified means edits made on the review step can't leave a stale record
     behind.
  4. *Set a password* → `setMemberPassword` → `POST
     /api/registrations/{memberId}/password`. **Descope never receives the
     password.** The on-screen requirements checklist is generated from the
     live policy the API returns (fetched up front by `RegisterScreen`,
     falling back to `DEFAULT_PASSWORD_POLICY`), so it can't drift from what
     the server enforces — the only client-only rule is the max length cap
     (`MAX_LENGTH` in `SetPasswordStep`).
  5. *Success* → tapping "Continue" calls `finishRegistration`, which finally
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

- This is a POC. Descope is the IdP; the MemberPortal .NET API owns member data
  and passwords (see "MemberPortal API contract" above — the app calls it, this
  repo doesn't implement it).
- **Sign-in still goes through Descope** (`descope.password.signIn`). Since
  registration no longer stores a password there, that call only succeeds for
  accounts Descope already holds a password for — until the Descope login flow
  proxies password validation to the MemberPortal API (Login Flow A in the
  sequence diagram). Same for "Forgot password", which currently sends
  Descope's own reset email. Newly registered members can still get in via the
  OTP/passkey sign-in flow.
- Biometric sign-in and passkeys are unaffected: both work off the Descope
  session/refresh token, not the password.
- iOS builds require a Mac; on Windows you can build and run the Android app.

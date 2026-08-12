# Pilot App — architecture and the decisions behind it

The short version: **Descope holds the credentials, authenticates the member, and issues a session JWT
carrying their claims.**

There is no backend in the sign-in path. The app talks to Descope and to nothing else.

## Scope

This pilot builds **sign-in only**. Members are seeded by hand in the Descope Console; there is no
registration, no account recovery, and no profile management. The question it exists to answer is
narrow and practical:

> Does the sign-in experience we want — password, OTP, passkey, biometrics, with member claims in the
> token — actually work end to end?

Everything below serves that question. Anything that doesn't is deliberately absent.

## The four sign-in paths

| Path | Mechanism | Where it lives |
| --- | --- | --- |
| Email + password | Descope flow, embedded via `FlowView` | `src/screens/SignInScreen.tsx` |
| Emailed OTP | a step *inside* that flow, on untrusted devices | the flow — setup guide §5 |
| Passkey | a browser-hosted Descope flow (`useFlow`) | `src/screens/PasskeyScreen.tsx` |
| Device biometrics | Keychain-held refresh token → `descope.refresh` | `src/auth/biometricStore.ts` |

Only the first two run the sign-in flow. That single fact drives the claims decision below, and it is
the most important thing to understand about this app.

## Sign-in is a flow, not SDK calls

The password screen, the OTP screen and the branching between them are built in the Descope Console and
rendered inside the app by `FlowView`. The app collects no credentials itself.

What that buys: one place to change the sign-in sequence, and screens that can be reordered without an
app release.

What it costs, stated plainly: the steps, their order and their validation live in vendor configuration
rather than in git. They are not code-reviewed, not unit-tested, and not revertible with a `git revert`.
Flow edits also reach members instantly, with no release gate. For a pilot that trade is fine — the
sequence is still being decided, and changing it in a console beats changing it in code. It deserves a
fresh look before this pattern carries into production.

Biometric sign-in is deliberately *outside* the flow: it's a local `descope.refresh` against a token in
the Keychain, so there is no flow to run.

## Why the OTP is there

The OTP is not decoration. Passkeys and biometrics both **bind a credential to a device**, and binding
to a device that only ever proved knowledge of a password is weak — a stolen password would be enough
to mint a passkey. Requiring an emailed code first means we know the person holding the handset also
controls the mailbox before anything is bound to it.

So the rule is: an untrusted device must pass an OTP; once it has, it's trusted and later password
sign-ins skip the code. Passkey and biometric sign-in never see an OTP, because those credentials were
themselves issued behind one.

## Why passkeys run in a browser

An embedded `FlowView` passkey would be a **native** passkey, which on iOS needs an Associated Domains
entitlement (`webcredentials:`), an Apple Team ID and bundle ID registered in the Descope Console, and a
hosted AASA file. A browser-hosted flow creates a **web** passkey on Descope's own domain and needs none
of that.

The cost is a browser sheet rather than a native Face ID sheet. With no Apple Team ID available for this
pilot, that's the right trade. Moving to native passkeys later is an entitlement plus a config change,
not a rewrite — the flows themselves don't change.

## Where claims come from

Requirement: the session token carries `memberId`, `plan`, `subscriberId` and `lobs`.

**Resolution: a Descope JWT Template**, projecting the member's user custom attributes into every token
the project issues.

The obvious alternative — a flow's **Custom Claims action** — is easier to configure and quietly broken
for this app, because two of the four sign-in paths never run the sign-in flow:

| Sign-in path | Runs the sign-in flow? | Flow action | JWT Template |
| --- | --- | --- | --- |
| Email + password | yes | ✅ | ✅ |
| Emailed OTP | yes | ✅ | ✅ |
| Passkey | no — a different flow | ❌ | ✅ |
| Biometrics | no — a token refresh | ❌ | ✅ |

The biometric row is the one that bites. Biometric sign-in calls `descope.refresh`, which re-issues the
session token with no flow involved at any point. Members on either of the bottom two rows would get
tokens with no claims — and they'd be the members using the app most often, since those are the fast
paths.

The consequence to be aware of: a JWT Template reads **user custom attributes**, so the four values are
stored in Descope. See the first known gap below.

The Portal screen renders the decoded claims, so a template that isn't assigned is visible immediately
rather than discovered later when a downstream service rejects a token.

## Known gaps and open questions

- **Member data is stored in Descope.** Four custom attributes per member. Whether an identity provider
  is an acceptable home for plan and subscriber identifiers is a policy question — BAA scope, what
  counts as a third party *processing* the data — not a technical one. It should be answered in writing
  before this pilot takes real member records. If the answer is no, the claims have to be minted
  somewhere we control, which changes the token design but not the sign-in flows.

- **The trusted-device flag is client-supplied, so it is not a security boundary.** `deviceTrusted` is
  read from the Keychain by the app and passed into the flow as a client input; a modified build can
  assert `true` and skip the OTP entirely. Fine for a pilot, not for production. Closing it means the
  decision moving server-side — a device registry keyed to a server-issued device token, or Descope's
  own trusted-device support if it fits. See `src/auth/deviceTrust.ts`.

- **The app can't know who is signing in before the flow starts.** The flow renders its own email field,
  so at mount time the app only knows whether *any* member has trusted this handset. On a shared device,
  member B can skip the OTP because member A trusted it. Fixing it means asking for the email on a
  native screen first, which trades away the single-flow design.

- **Sign-out deliberately keeps device trust.** Otherwise every sign-out would re-trigger the OTP, which
  defeats the point. Uninstalling the app clears it, since the Keychain entry is app-scoped.

- **No registration, and no password reset.** Members are seeded by hand in the Console. Sign-up is out
  of scope, and so is the question of who should own the password long term.

- **Token consumption by other services is not designed.** Deferred until sign-in is proven. What exists
  is a stub of the facts a consumer will need: [`dotnet-token-notes.md`](dotnet-token-notes.md).

- **Nothing has been run on a device.** The app was built and verified in a Linux container — `tsc`,
  ESLint and Jest are clean, but iOS cannot be compiled there and the Android Gradle config could not be
  parsed (no JDK 17 toolchain available). `pod install` and every runtime behaviour — Face ID, WebAuthn,
  the embedded flow — are unverified. The manual checklist in the [README](../README.md) is the first
  real test.

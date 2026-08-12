# Pilot App — architecture and the decisions behind it

The short version: **Descope holds the credentials, authenticates the member, and issues a session JWT
carrying their claims. Nothing else is involved.**

There is no backend in the sign-in path. That is the defining difference from the MemberPortal app in
this repo, and it is deliberate.

## How this differs from MemberPortal, and why

MemberPortal was built on a constraint: Descope stores **nothing but the email address**, and the
password lives in a .NET database. That produced a known dead end, recorded in its own
`docs/architecture.md`:

> **Sign-in doesn't work for members registered this way.** The password is in our database, and
> `descope.password.signIn` doesn't know about it.

The Pilot App doesn't solve that. It sidesteps it, to answer a different question first: *does the
sign-in experience we want — password, OTP, passkey, biometrics, with claims in the token — actually
work?* Answering that with Descope holding the password takes days rather than weeks, and nothing
learned is wasted if the credential model later moves back.

| | MemberPortal | Pilot App |
| --- | --- | --- |
| Password stored in | the .NET database | **Descope** |
| Sign-in path | doesn't work yet | Descope flow, embedded |
| Backend calls during auth | connector calls to a BFF | **none** |
| Claims | a .NET-minted enriched token (planned) | **Descope JWT Template** |
| Registration | a Descope flow | **not built** — members are seeded by hand |

If the pilot succeeds, the open question for the real system is which of these two credential models to
carry forward. That is a decision this pilot is meant to *inform*, not one it makes.

## The four sign-in paths

| Path | Mechanism | Where it lives |
| --- | --- | --- |
| Email + password | Descope flow, embedded via `FlowView` | `src/screens/SignInScreen.tsx` |
| Emailed OTP | a step *inside* that flow, on untrusted devices | the flow, §5 of the setup guide |
| Passkey | a browser-hosted Descope flow (`useFlow`) | `src/screens/PasskeyScreen.tsx` |
| Device biometrics | Keychain-held refresh token → `descope.refresh` | `src/auth/biometricStore.ts` |

Only the first two run the sign-in flow. That single fact drives the claims decision below.

### Why the OTP is there

The OTP is not decoration. Passkeys and biometrics both **bind a credential to a device**, and binding
to a device that only ever proved knowledge of a password is weak — a stolen password would be enough
to mint a passkey. Requiring an emailed code first means we know the person holding the handset also
controls the mailbox before anything is bound to it.

So the rule is: an untrusted device must pass an OTP; once it has, it's trusted and later password
sign-ins skip the code. Passkey and biometric sign-in never see an OTP, because those credentials were
themselves issued behind one.

### Why passkeys run in a browser

An embedded `FlowView` passkey would be a **native** passkey, which on iOS needs an Associated Domains
entitlement (`webcredentials:`), an Apple Team ID and bundle ID registered in the Descope Console, and a
hosted AASA. A browser-hosted flow creates a **web** passkey on Descope's own domain and needs none of
that.

The cost is a browser sheet rather than a native Face ID sheet. For a pilot with no Apple Team ID
available, that's the right trade. Moving to native passkeys later is a config change plus an
entitlement, not a rewrite — the flows themselves don't change.

## Where claims come from

Requirement: the session token carries `memberId`, `plan`, `subscriberId` and `lobs`.

**Resolution: a Descope JWT Template**, projecting the member's user custom attributes into every token
the project issues.

The alternative — a flow's **Custom Claims action** — is easier to configure and quietly broken for this
app. It only affects the token that flow issues, and two of the four sign-in paths never run the
sign-in flow:

- **Biometric sign-in is a refresh.** `descope.refresh` re-issues the session token with no flow
  involved.
- **Passkey sign-in runs a different flow entirely.**

Members using either would get tokens with no claims — and they'd be the members using the app most
often, since those are the fast paths. A JWT Template covers all four because it applies at issuance,
including on refresh.

This is the same conclusion MemberPortal's architecture doc reached ("What is *not* the answer: a
flow's Custom Claims action"), for the same reason. The difference is what follows from it: MemberPortal
rejected the template too, because it would mean putting member data in Descope, and chose a
.NET-minted token instead. **This pilot accepts that cost** — the four attributes live in Descope. That
is a real divergence and it needs a decision before any of this goes near production data.

The Portal screen renders the decoded claims, so a template that isn't assigned is visible immediately
rather than discovered later when a downstream service rejects a token.

## Known gaps and open questions

- **The trusted-device flag is client-supplied, so it is not a security boundary.** `deviceTrusted` is
  read from the Keychain by the app and passed into the flow as a client input; a modified build can
  assert `true` and skip the OTP entirely. Fine for a pilot, not for production. Closing it means the
  decision moving server-side — a device registry keyed to a server-issued device token, or Descope's
  own trusted-device support if it fits. See `src/auth/deviceTrust.ts`.

- **Member data now sits in Descope.** Four custom attributes per member. MemberPortal's whole design
  exists to avoid exactly this. Whether that's acceptable is a policy question (BAA scope, what counts
  as a third party *processing* the data), not a technical one, and it should be answered in writing
  before the pilot takes real member records.

- **The app can't know who is signing in before the flow starts.** The flow renders its own email
  field, so at mount time the app only knows whether *any* member has trusted this handset, not whether
  *this* member has (`isAnyDeviceTrusted` vs `isDeviceTrusted`). On a shared device, member B could skip
  the OTP because member A trusted it. A native email screen before the flow would fix it, at the cost
  of the single-flow design.

- **No registration.** Members are seeded by hand in the Console. Anything about sign-up — including
  whether the password should be set in Descope at all — is out of scope here.

- **Sign-out deliberately keeps device trust.** Otherwise every sign-out would re-trigger the OTP,
  which defeats the point. Uninstalling the app clears it, since the Keychain entry is app-scoped.

- **The .NET integration is not designed.** Deferred on purpose until sign-in is proven. What exists is
  a stub of the token facts a consumer will need: [`dotnet-token-notes.md`](dotnet-token-notes.md).

- **Nothing has been run on a device.** The app was built and verified in a Linux container — `tsc`,
  ESLint and Jest are clean, but iOS cannot be compiled there. `pod install` and every runtime
  behaviour (Face ID, WebAuthn, the embedded flow) are unverified. The manual checklist in the
  [README](../README.md) is the first real test.

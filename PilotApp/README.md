# Pilot App

A React Native member portal that does one thing: **sign in**, four ways, with Descope as the identity
provider and no backend in the path.

| Path | How |
| --- | --- |
| Email + password | a Descope flow, embedded in the app |
| Emailed OTP | a step inside that flow, on devices we don't trust yet |
| Passkey | a browser-hosted Descope flow (web passkey) |
| Device biometrics | Face ID / Touch ID / fingerprint unlocking a stored refresh token |

The session JWT carries four custom member claims — `memberId`, `plan`, `subscriberId`, `lobs` — put
there by a Descope **JWT Template**, so they survive a token refresh and appear on every path. The
Portal screen renders them, which is how you can see at a glance that the setup worked.

There is **no registration**: members are seeded by hand in the Descope Console. This is a pilot for the
sign-in half only — see [`docs/architecture.md`](docs/architecture.md) for what that scope deliberately
leaves out.

## Getting it running

**Order matters — do the Console work first.** The app can't do anything without a project ID and a
flow to run.

1. **Build the Descope side**: follow [`docs/descope-signin-flow-setup.md`](docs/descope-signin-flow-setup.md)
   end to end, including its §7 test. That guide is self-contained and needs no code.
2. **Configure the app** — edit `src/config/index.ts`:
   ```ts
   export const DESCOPE_PROJECT_ID = 'P2xxxxxxxxxxxxxxxxxx'; // yours
   ```
   The three flow IDs already default to the names the guide uses (`pilot-sign-in`,
   `pilot-passkey-signin`, `pilot-passkey-add`). Change them only if you named yours differently.
3. **Install and run:**
   ```sh
   npm install
   cd ios && pod install && cd ..   # macOS only
   npm run ios                      # or: npm run android
   ```

Requires Node ≥ 22.11 and the standard React Native environment.

### Test on a real device

The Simulator will get you through password + OTP, but not the rest:

- **Passkey creation is unreliable on the iOS Simulator** regardless of configuration.
- **Face ID on the Simulator** needs Features → Face ID → Enrolled, and it never exercises the real
  Keychain access-control behaviour.

## Manual test checklist

Nothing below has been run — the app was built in a Linux container where iOS can't be compiled. This
is the first real verification, in order:

1. **Fresh install → password sign-in.** The OTP is demanded. Sign-in completes.
2. **The Portal shows all four claims** under "Token claims", with the values you seeded. This is what
   proves the JWT Template is assigned and correct. If it says *Missing*, go back to setup §4.
3. **Sign out, sign in again with the password.** The OTP is **skipped** — the device is trusted now.
4. **Accept the biometric prompt** when offered. Sign out. Sign in with Face ID / fingerprint.
   **The four claims are still present.** This is the important one: it's the refresh path, and the
   whole reason a JWT Template was chosen over a flow's Custom Claims action.
5. **Add a passkey from the Portal.** Sign out. Sign in with the passkey from the Welcome screen.
   Claims still present.
6. **Delete and reinstall the app.** The OTP is demanded again — the trusted-device record was
   app-scoped and went with it.

Also worth checking: an unknown email **fails** rather than creating an account (setup §5 step 2
explains why that's a real risk), and a wrong password fails.

## How it's built

```
src/
  config/index.ts        project ID, flow IDs, redirect scheme
  screens/
    WelcomeScreen        entry point — password or passkey
    SignInScreen         hosts the embedded sign-in flow (FlowView)
    PasskeyScreen        browser-hosted passkey flow, sign-in and add modes
    PortalScreen         signed-in view; renders the decoded claims
  auth/
    claims.ts            decodes the session JWT (hand-rolled base64url — RN has no atob)
    deviceTrust.ts       the trusted-device flag that gates the OTP
    biometricStore.ts    Keychain-held refresh token behind an OS prompt
    useAuth.ts           applies sessions, biometric sign-in, sign-out
    passkeyStore.ts      local "passkey added" hint for the Portal
    coldStart.ts         forces sign-in after the app is killed
    InactivityGate.tsx   auto sign-out after 5 minutes idle
  services/
    descopeService.ts    the only direct Descope SDK calls: refresh and logout
```

Password and OTP are **not** SDK calls — they're steps inside the embedded flow, which hands back a
finished session. That's why `descopeService.ts` is nearly empty.

### Checks

```sh
npx tsc --noEmit    # types
npm run lint        # eslint
npm test            # jest — covers the JWT claim decoding
```

All three pass. They cover the decoding logic and nothing about the auth flows themselves, which only
exist on a device.

## Docs

| | |
| --- | --- |
| [`docs/descope-signin-flow-setup.md`](docs/descope-signin-flow-setup.md) | **Start here.** Building the flows and the JWT Template in the Console |
| [`docs/architecture.md`](docs/architecture.md) | The decisions, what they trade away, and the known gaps |
| [`docs/dotnet-token-notes.md`](docs/dotnet-token-notes.md) | Stub: what a .NET consumer will need. Deliberately not designed yet |

## Known gaps

The two worth knowing before you demo this:

- **The trusted-device flag is client-supplied and is not a security boundary.** A modified build can
  skip the OTP. It's a UX optimisation for a pilot.
- **Member data lives in Descope** — four custom attributes per member, because that's where a JWT
  Template reads from. Whether an identity provider is an acceptable home for plan and subscriber
  identifiers is a policy decision, not a technical one, and it should be settled before real member
  records go in.

Both are covered properly in [`docs/architecture.md`](docs/architecture.md).

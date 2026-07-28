# Setting up the registration flow in Descope

Step by step for building the passthru registration flow in the Descope Console and wiring it to this
app. Follow it in order — the connectors have to exist before the flow can call them, and the flow has
to exist before the app has IDs to map.

**Before you start**, know which half you're building. The flow owns the *logic*: it collects input,
sends and verifies the OTP, calls the BFF, and mints the session JWT. The app owns only the *rendering*
— that's [BYOS](https://docs.descope.com/flows/screens/byos), "Bring Your Own Screen". Descope's own
guidance is that BYOS is for exceptional cases (deeply embedded native experiences, strict compliance),
because you give up changing the auth UI without an app release. That's the trade this POC has chosen.

> UI labels move between Console releases. Where a label here doesn't match what you see, the concept
> is still right — find the equivalent rather than assuming the step is wrong.

## 0. Prerequisites

1. A Descope project. Copy the **Project ID** from
   [Project Settings](https://app.descope.com/settings/project) into
   `MemberPortal/src/config/index.ts`.
2. **Authentication Methods → OTP → Email** enabled. This is the only auth method registration needs;
   Passwords is *not* used here, since the password lives in the BFF.
3. The BFF running and reachable **from Descope's servers** — not from your laptop. A localhost URL
   will not work: connectors are called server-to-server from Descope's cloud, so during development
   you need a public tunnel (ngrok, Cloudflare Tunnel) or a deployed environment.
4. A connector key generated and configured in the BFF (`ConnectorAuth:Keys`). You'll paste the same
   value into each connector's headers.

## 1. Create the three connectors

**Connectors → + Connector → Generic HTTP Client.** Build one per BFF call. See the
[Generic HTTP Connector guide](https://docs.descope.com/connectors/connector-configuration-guides/network/generic-http).

For each, set:

- **Base URL** — where the BFF is reachable from the internet.
- **Headers** — `Content-Type: application/json` and your connector key header
  (`X-Connector-Key: <the key>`). This is what authenticates the call; without it the BFF returns 401.
- **Method** — `POST`.

| Connector | Path | Body fields | Used in |
| --- | --- | --- | --- |
| `bff-initiate-registration` | `/api/initiateRegistration` | `email`, `firstName`, `lastName`, `dateOfBirth`, `zipCode` | Phase 2, after OTP verify |
| `bff-set-password` | `/api/registration/password` | `userId`, `password`, `confirmPassword` | Phase 3 |
| `bff-complete-registration` | `/api/completeRegistration` | `email`, `ssn`, `memberId` | Phase 4 |

Two things worth getting right now rather than debugging later:

- **`dateOfBirth` must be ISO `yyyy-MM-dd`.** The app's form collects MM/DD/YYYY. Either convert it in
  the flow before the connector, or have the screen collect it in ISO form. A mismatch here fails
  model binding on a `DateOnly` and you get a 400 that doesn't obviously say why.
- **Turn on "Include response headers in Context"** (or the equivalent) if you want anything from the
  response available downstream. You need the response *body* in phase 2 and phase 4 regardless —
  `userId` from the first, `memberInfo`/`planInfo` from the last.

## 2. Create the flow

**Flows → + Flow.** Give it an ID you'll recognise — `member-registration` is what the app's config
example uses. It must be an **unauthenticated** flow: it runs for someone who has no account yet.

Build the steps in this order.

### Phase 1 — collect the details, send the OTP

1. A **screen** with inputs for email, first name, last name, date of birth and ZIP.
2. An **OTP → Send** action (email), targeted at the email from that screen.

Descope holds everything the screen collected in flow state, so you don't need to store it anywhere
yourself — later steps can still read it.

### Phase 2 — verify, then call the BFF

3. A **screen** for the 6-digit code, with a submit action and a **resend** action.
4. An **OTP → Verify** action.
5. A **connector step** running `bff-initiate-registration`, mapping the phase-1 fields into the body.
6. Keep the response's `userId` — phase 3 needs it. Set it into flow state / a variable via the
   editor's variable picker.

The ordering is the point of the whole design: the BFF is called **after** verification, so a record
existing in the BFF's database already means the address was verified. Don't reorder these.

7. **Create the user.** This is where Descope's own passwordless shadow record gets created (email
   only, no password) — after the BFF confirms, so a BFF failure leaves no orphan Descope user.

### Phase 3 — password

8. A **screen** with password + confirm password.
9. A **connector step** running `bff-set-password`, with `userId` from step 6.

Descope never stores this password. That's deliberate, and it's why sign-in has to be validated against
the BFF later.

### Phase 4 — eligibility

10. A **screen** for SSN and optional member ID.
11. A **connector step** running `bff-complete-registration`.
12. A **Custom Claims** action mapping the response into the JWT — `subscriberId` from
    `memberInfo.subscriberId` and `planId` from `planInfo.planId`. See
    [Custom Claims](https://docs.descope.com/flows/actions/custom-claims).
13. End the flow so it **issues a session JWT**. If it ends without one, the app gets a `completed`
    status with no `authInfo` and shows "Registration finished but returned no session."

Add a failure branch off step 11: the BFF distinguishes *not eligible* (their details are wrong — let
them retry) from *lookup failed* (Facets is down — tell them to come back). Collapsing both into one
dead end will make the last screen feel broken.

## 3. Read the IDs out of the builder

This is the step that connects the flow to the app. In the flow builder, **expand a screen's details**:
the **interaction IDs** appear on the screen widget, and the expected **inputs and outputs** in the
panel on the right.

For each of the four screens, write down:

- the **screen ID**
- the **interaction ID** of its submit action (and of *resend* on the OTP screen)
- the exact **input field names** the screen expects

## 4. Wire them into the app

Put them in `MemberPortal/src/screens/register/flowScreens.ts` — the only file that needs to change:

```ts
export const SCREEN_MAPPINGS: ScreenMapping[] = [
  { screenId: 'your-screen-id', step: 'personal', submit: 'your-interaction-id' },
  { screenId: '…',              step: 'verify',   submit: '…', secondary: 'resend-id' },
  { screenId: '…',              step: 'password', submit: '…' },
  { screenId: '…',              step: 'member',   submit: '…' },
];

export const FLOW_FIELDS = {
  email: 'email',        // keys are ours, values are the flow's input names
  firstName: 'firstName',
  …
};
```

Then set the flow ID in `MemberPortal/src/config/index.ts`:

```ts
export const REGISTER_FLOW_ID = 'member-registration';
```

`FLOW_FIELDS` matters as much as the screen IDs: those names become the connector's request body, so a
wrong one sends `null` to the BFF and the record is created with a missing field rather than failing
loudly.

**You don't have to guess any of this.** Run the app and start registration — a screen the app doesn't
recognise renders as *"The flow asked for 'x', which isn't in SCREEN_MAPPINGS"*, so walking the flow
once tells you its own IDs.

## 5. Test in this order

1. **The BFF alone**, with `requests.http` in the AUTH-API repo — all three calls, plus the 401 path.
   If this doesn't pass, nothing else will.
2. **Each connector**, using the Console's test/run facility, before involving the flow.
3. **The flow in the Console runner** — it will use Descope's own screens, which is fine and actually
   useful: it isolates flow logic from the app's rendering.
4. **The app**, last.

Debugging in that order saves a lot of time. When something fails in the app, drop back a level rather
than guessing which half is wrong.

## Known rough edges

- **Going back a step isn't supported.** The flow holds its state server-side and the app's runner has
  no "back" interaction, so the wizard header's back button leaves registration entirely. If you want
  real back navigation, add explicit back interactions to the screens and map them.
- **Session expiry mid-flow.** A member who walks away between phases may return to a dead execution.
  The app surfaces the flow's error; it doesn't resume automatically.
- **The BFF's pending record has its own lifetime** (`Registration:SessionLifetimeMinutes`, default 60)
  independent of the flow's. If they disagree wildly you'll get confusing failures at phase 3 or 4 —
  keep them roughly aligned.

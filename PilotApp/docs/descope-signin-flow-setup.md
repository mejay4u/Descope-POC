# Building the Pilot App sign-in in Descope

Step-by-step for **phase 1**: everything that happens in the Descope Console. Console work only — no
code. When it's done you'll have a sign-in flow that takes an email and password, demands an emailed
OTP on devices it doesn't trust, and issues a session JWT carrying four custom member claims —
**testable on its own** in the Console's flow runner, before the app is pointed at it.

Work through it in order. §3 and §4 (the claims) are independent of §5 (the flow), but §7's test needs
both.

> **On labels:** the Console changes between releases. Where a label here doesn't match what you see,
> the concept still holds — find the equivalent rather than assuming the step is wrong. `docs.descope.com`
> blocks automated fetches, so these steps are written from Descope's documented structure and have not
> been replayed against a live console.

## What you're building

| # | Piece | Why it exists |
| --- | --- | --- |
| §2 | Password + Email OTP + Passkeys enabled | the three authentication methods this pilot uses |
| §3 | Four user custom attributes | where the member's claim values are stored |
| §4 | A JWT Template | what copies those values into every token |
| §5 | `pilot-sign-in` flow | password, then OTP when the device isn't trusted |
| §6 | `pilot-passkey-signin` + `pilot-passkey-add` | passkeys, in a browser rather than in-app |

## 1. Prerequisites

**Use a dedicated Descope project for this pilot.** Every step below changes project-wide settings —
enabling Passwords, adding custom attributes, assigning a JWT Template — and those apply to every app
pointed at the project. Starting clean means nothing here can surprise something else.

Copy the **Project ID** from **Project Settings**; the app needs it in `src/config/index.ts`.

## 2. Authentication methods

Under **Authentication Methods**, enable:

| Method | Used for |
| --- | --- |
| **Passwords** | the primary sign-in credential |
| **OTP → Email** | the step-up code on untrusted devices |
| **Passkeys (WebAuthn)** | passkey sign-in and enrolment |

Also under project settings, add **`pilotapp://auth`** to the **approved redirect URLs**. The
browser-hosted passkey flow returns through it; without it the flow completes and the app sits there
having received nothing.

**Password policy:** set it here, and write down what you chose. This is the only place it's defined —
keep it that way. A policy duplicated anywhere else drifts, and the symptom is a member being rejected
for a password the screen just accepted.

## 3. Custom attributes

**Users → Custom Attributes.** Create four:

| Attribute | Type | Example |
| --- | --- | --- |
| `memberId` | string (text) | `M-1001` |
| `plan` | string (text) | `GOLD-PPO` |
| `subscriberId` | string (text) | `S-42` |
| `lobs` | multi-value / array if offered, otherwise text | `medicare,commercial` |

Use these names exactly. The app reads them verbatim in `src/auth/claims.ts`, and a mismatch shows up
as a claim that's silently absent rather than as an error.

`lobs` is the one to watch: depending on the attribute type Descope may project it as a JSON array or
as a comma-separated string. The app accepts **both** — `toStringArray` in `claims.ts` normalises them
— so either type is fine here.

## 4. The JWT Template — the step that makes claims work everywhere

**Project Settings → JWT Templates → + Template**, for the **session token** (not the refresh token).

Map each attribute into a claim of the same name:

```json
{
  "memberId": "{{user.customAttributes.memberId}}",
  "plan": "{{user.customAttributes.plan}}",
  "subscriberId": "{{user.customAttributes.subscriberId}}",
  "lobs": "{{user.customAttributes.lobs}}"
}
```

The placeholder syntax for user attributes is whatever your Console's template editor documents in its
own side panel — read it there rather than trusting the exact spelling above.

Then **assign the template to the project** (or to the application, if your Console scopes it that
way). An unassigned template silently does nothing, which looks exactly like a template that doesn't
work.

### Why a template and not the flow's Custom Claims action

The flow's Custom Claims action is easier to find and it is the wrong tool here. It only affects the
token *that flow* issues. This pilot has four ways in, and two of them never run the sign-in flow:

| Sign-in path | Runs `pilot-sign-in`? | Claims from a flow action | Claims from a JWT Template |
| --- | --- | --- | --- |
| Email + password | yes | ✅ | ✅ |
| Emailed OTP (inside that flow) | yes | ✅ | ✅ |
| Passkey | no — a different flow | ❌ | ✅ |
| Biometrics | no — a token refresh | ❌ | ✅ |

The biometric row is the one that bites. Biometric sign-in calls `descope.refresh`, and a refresh
re-issues the session token from the template — no flow involved at any point. Use a template.

## 5. The sign-in flow

**Flows → + Flow.** Start from a **blank** flow, not the Flow Library — library flows arrive pre-wired
for sign-up and unpicking that takes longer than building these five steps. It must be
**unauthenticated**: it runs for someone with no session.

Give it the ID **`pilot-sign-in`** (this is the default in `src/config/index.ts`, so matching it means
no code change).

### The builder

The canvas opens with a start step. Click the **blue `+` at the top left**, pick a category, search,
then **drag onto the canvas**. Wire steps by dragging from one step's output handle to the next step's
input.

### Step 1 — Screen: email + password

A screen with two inputs and a submit button:

| Field | Notes |
| --- | --- |
| `email` | the login ID |
| `password` | masked |

### Step 2 — Action: Sign In / Password

Wire the screen into a **password sign-in** action, configured against the `email` and `password`
fields from step 1.

Use a **sign-in only** action, not a "sign up or in" composite. This matters: sign-up-or-in composites
**create the user** if they don't exist — Descope's own description of them says so. This pilot has no
registration at all; members are seeded by hand in §7. An unknown email should fail, not quietly become
an account, and a typo'd address should not leave a half-made user behind.

### Step 3 — Condition on `deviceTrusted`

Add a **Condition** step reading the **client input** named `deviceTrusted`.

The app supplies this through `FlowOptions.clientInputs` when it mounts the flow — see
`src/screens/SignInScreen.tsx`. In the Console it appears wherever your version exposes flow/client
inputs in the condition editor.

Branch:
- `deviceTrusted == true` → skip to step 5
- otherwise → step 4

Treat a missing or non-`true` value as untrusted. The safe default is to ask for the code.

> ⚠️ **This is not a security control.** `deviceTrusted` comes from the client, so a modified build can
> assert `true` and skip the OTP. It's a UX optimisation for a pilot. Making it real means deciding
> server-side — see "Known gaps" in [`architecture.md`](architecture.md).

### Step 4 — Emailed OTP, verify only

On the untrusted branch, add an email OTP step that **verifies against the already-known login ID**.

**Do not use `Sign Up or In / OTP / Email` here.** Same reason as step 2: it creates users. By this
point the member has already authenticated with a password, so all you want is a code sent to their
address and checked. Configure it against the `email` from step 1 so they aren't asked to type it
again, and confirm the code screen exposes a **resend** action.

### Step 5 — End, issuing a session

Both branches terminate at a step that **ends the flow issuing a session JWT**.

If the flow ends without one, the app receives a completed status carrying no session and nothing
happens — the member taps through and stays on the sign-in screen. This is the single most likely thing
to get wrong.

## 6. The two passkey flows

Passkeys need **two separate flows**, and they are not interchangeable — pointing sign-in at the add
flow renders a **blank screen**, because that flow expects a logged-in user who doesn't exist yet.

| Flow ID | Authenticated? | Used by |
| --- | --- | --- |
| `pilot-passkey-signin` | no | "Sign in with a passkey" on the Welcome screen |
| `pilot-passkey-add` | **yes** | "Add a passkey" in the Portal |

Both are opened in a **browser** by the app, not embedded. That's deliberate: a flow on Descope's own
hosted domain creates a *web* passkey tied to that domain, so the app needs no iOS Associated Domains
entitlement, no hosted `apple-app-site-association`, and no Apple Team ID. The trade-off is a browser
sheet instead of a native Face ID sheet. See the header of `src/screens/PasskeyScreen.tsx`.

Both must end by redirecting back to **`pilotapp://auth`** with the session.

## 7. Test it before touching the app

Seed a member first — **Users → + User**:

- login ID: your own email (you need to receive the OTP)
- set a password
- fill in all four custom attributes from §3

Then run `pilot-sign-in` in the **Console's flow runner** and confirm:

1. Email + password signs in; a wrong password fails.
2. An unknown email **fails** rather than creating a user (check the Users list after).
3. The OTP arrives, verifies, and offers resend. (The runner has no client input, so `deviceTrusted`
   is absent — which is the untrusted branch. That's the path you want to see here.)
4. The flow completes and issues a session.
5. **Decode the session JWT** — paste it into jwt.io, or any decoder — and confirm `memberId`, `plan`,
   `subscriberId` and `lobs` are all present with the values you seeded.

Step 5 is the one that proves §4. If the claims are missing, the template is either unassigned or its
attribute references are misspelled; the flow itself is fine.

## Done when

- The Project ID is recorded, and in `src/config/index.ts`.
- All three flow IDs are recorded (defaults: `pilot-sign-in`, `pilot-passkey-signin`,
  `pilot-passkey-add`).
- `pilotapp://auth` is an approved redirect URL.
- A seeded test member exists with all four attributes.
- The flow runner completes end to end **and the decoded JWT carries the four claims**.

## Gotchas

**A flow that ends without issuing a session looks like a flow that works.** Every screen renders, the
member taps through, and the app receives a "completed" with nothing in it. Check step 5 first when
sign-in "does nothing".

**The Console runner can't exercise the trusted-device branch.** It has no client input to pass, so it
always takes the OTP path. Testing the skip requires the app — see the manual checklist in the
[README](../README.md).

**Don't use a "sign up or in" composite anywhere in this flow.** Steps 2 and 4 both call this out. It
creates users on the way past, which turns a typo'd email into a real account.

**Claims appear on the *session* token, not the refresh token.** If you decode the wrong one they'll
look absent.

**Flow edits are live.** There's no app release between changing a flow here and members seeing it.
Treat these flows as production configuration.

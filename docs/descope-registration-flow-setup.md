# Building the registration flow in Descope

Step-by-step for **delivery phase 1**: build the flow in the Descope Console. This is console work
only — no code. When it's done you'll have a flow that collects the member's details, verifies their
email by OTP, creates the user, takes a password, and issues a session, **testable on its own** in the
Console runner.

The two calls to our BFF are deliberately left out until delivery phase 3, so this phase doesn't
depend on the backend existing or being reachable.

> **On labels:** the Console changes between releases. Where a label here doesn't match what you see,
> the concept still holds — find the equivalent rather than assuming the step is wrong. These steps
> come from Descope's documented structure; docs.descope.com blocks automated fetches, so they haven't
> been verified against a live console.

## What you're building

| Diagram step | What it is here |
| --- | --- |
| 1–2 | Screen: Personal Information → data held in **flow state** |
| 3–5, **10** | Action: `Sign Up or In / OTP / Email` — one composite that sends the code, verifies it, **and** creates the email-only shadow record |
| 6–9 | *(gap — connector 1 to the BFF, delivery phase 3)* |
| 11–12 | Screen: Create Account (password + confirm) |
| 13–15 | *(gap — connector 2 to the BFF, delivery phase 3)* |
| 16 | End the flow, issuing a session JWT |

Note where step 10 landed: the diagram creates the user *after* the BFF confirms, and that isn't
buildable — the OTP action creates it up front. See §6.

Descope holds **nothing but the email address**. That is the fixed constraint — no name, no date of
birth, no phone, and never the password.

## 1. Prerequisites

1. A Descope project. Copy the **Project ID** from Project Settings — delivery phase 2 needs it.
2. **Authentication Methods → OTP → Email** enabled. That's the only method this flow uses. Do **not**
   enable Passwords for this: the password goes to our database, not Descope.

## 2. Create the flow

- **Flows → + Flow.** Start from a **blank** flow, *not* the Flow Library. Library flows arrive
  pre-wired for a conventional sign-up, and unpicking that takes longer than building these steps.
- It must be **unauthenticated** — it runs for someone who has no account yet.
- Give it an ID you'll recognise, e.g. `member-registration`. **Write it down**; it goes into the app's
  `REGISTER_FLOW_ID` in delivery phase 2.

## 3. How the builder works

The canvas opens with a start step. To add anything: click the **blue `+` at the top left**, pick a
category, search for what you want, then **drag it onto the canvas**. Wire steps together by dragging
from one step's output handle to the next step's input.

The categories used here:

| Category | For |
| --- | --- |
| **Screen** | anything the member sees — opens the widget-based Screen Builder |
| **Action** | the OTP exchange — one composite action, see §5 |
| **Connector** | the two BFF calls (delivery phase 3) |
| **Condition** | branching on a failed BFF call (delivery phase 3) |

## 4. Screen — Personal Information

Add a **Screen** step and build it with these inputs:

| Field | Required | Notes |
| --- | --- | --- |
| `email` | yes | becomes the login ID |
| `firstName` | yes | |
| `lastName` | yes | |
| `dateOfBirth` | yes | **collect as ISO `yyyy-MM-dd` if you can** — see "Gotchas" |
| `zipCode` | yes | `12345` or `12345-6789` |
| `contactNumber` | no | on the Figma form; not in the diagram's step-6 body |

Plus a submit button.

**Write down the exact field names.** Delivery phase 3 maps them into the connector's request body, and
a mismatch sends `null` to the BFF rather than failing loudly — the member gets a record with a missing
field instead of an error.

## 5. OTP — one action, not three

**There is no standalone "Send OTP" action, and no separate "Verify OTP".** The Add Action dialog
offers composites; the one to use is:

> **`Sign Up or In / OTP / Email`**

It does the whole exchange — collects the login ID, sends the code, shows the code screen, verifies it,
**and creates the user**. Drop it on the canvas and it expands into those steps; edit the screens it
brings with it rather than adding your own.

Configure it against the `email` field from §4, and **map nothing else into it**. If your version
offers user-attribute mapping on sign-up, leave it empty — Descope holds the email address and nothing
more.

Use the **"Sign Up or In"** variant, not a sign-up-only one. That's what makes the resume path work: a
member who abandoned registration already exists in Descope, and sign-up-only would refuse them at the
door.

Edit the code screen it generates to match the Figma *Verify Email* design, and confirm it exposes a
**resend** action.

## 6. There is no separate "create the user" step

The §5 action already created the shadow record — its own description says so: *"Users that try to sign
in but don't exist in the Descope users table will be automatically created."* Don't add a Create User
action; you'd be creating a user that exists.

⚠️ **This settles the ordering question, and not in the diagram's favour.** Diagram step 10 puts user
creation *after* the BFF confirms, so a BFF failure leaves no orphan Descope user. That sequence cannot
be built: the composite creates the user when the OTP is sent, before verification and well before the
BFF is called. There is no arrangement of these steps that produces the diagram's order.

What it costs: a member who abandons after entering their email leaves an email-only Descope user with
no matching record on our side. It self-heals — they return, the same action signs them in, and
`initiateRegistration` hands back the same `userId` — but orphans accumulate, so they want a scheduled
cleanup. Take this back to whoever owns the diagram; the drawing needs to change, not the flow.

## 8. Screen — Create Account (password)

A screen with `password` and `confirmPassword`.

Configure its validation to match the Figma checklist **exactly**:

- 14–56 characters
- at least one uppercase letter
- at least one lowercase letter
- at least one digit
- at least one special character

These must equal the .NET `PasswordPolicy` config. If they drift, the screen accepts a password and the
BFF then rejects it — which reads as a broken app.

## 9. End the flow

Terminate the flow so it **issues a session JWT**.

If it ends without one, the app receives a completed status carrying no session and shows *"Registration
finished but returned no session."* That's the single most likely thing to get wrong here.

## 10. Leave the two connector gaps

Leave the wiring points where the BFF calls will be inserted in delivery phase 3:

- immediately after the **§5** OTP action — connector 1, `initiateRegistration`
- after **§8** (password screen) — connector 2, the password call

Until then the flow runs end to end without touching our backend, which is exactly what makes this
phase independently testable.

## 11. Test it

Run the flow in the **Console's flow runner** and confirm:

- every screen renders and validates as expected
- the OTP email arrives and verifies
- a user is created carrying **only** an email address — check the Users list
- the flow completes and issues a session

## Done when

- The flow ID is recorded.
- The screens' field names are written down (delivery phase 3 needs them).
- The runner completes end to end.
- The step-10 ordering change (§6) has been raised with whoever owns the diagram.

## Gotchas

**`dateOfBirth` must reach the BFF as ISO `yyyy-MM-dd`.** The .NET binds it to a `DateOnly`. If the
screen collects MM/DD/YYYY, convert before the connector in delivery phase 3, or you get a 400 that
doesn't explain itself.

**The Figma has a Review screen (step 3) that the diagram doesn't.** With Descope rendering the
screens, the app can't show it — the app never sees the entered values. Either add a review screen to
this flow between §5 and §8, or accept that the step disappears. Decide before building §8, since it
changes the screen count members see.

**Abandoned registrations leave orphan Descope users.** A consequence of §6: the shadow record is
created when the OTP is sent, so anyone who quits at the code screen leaves an email-only user with
nothing behind it. Harmless individually — they self-heal on return — but they need a cleanup job
before this goes anywhere near production.

**Flow edits are live edits.** There's no app release gate between changing a screen here and members
seeing it. Smaller blast radius than BYOS — there are no screen IDs for the app to drift against — but
still worth treating the flow as production configuration.

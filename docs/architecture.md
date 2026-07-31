# Member Portal — architecture and the decisions behind it

The short version: **Descope verifies email addresses, runs the registration flow, and issues
sessions. We own everything else.**

| | Descope | MemberPortal .NET API |
| --- | --- | --- |
| Holds | the email address (login ID), sessions, biometric/passkey bindings | the member record, the **password**, and later the eligibility data |
| Does | renders the registration flow, sends and verifies the OTP, calls our API, mints the session | stores the record, hashes the password, and will mint the enriched token |
| Never sees | the password, or any profile field | — |

Nothing but the email address is *stored* in Descope. That is the fixed constraint everything below
follows from. Note the word: during registration the member's details do pass through Descope's **flow
state** in transit — see "Open questions".

## Registration

A **Descope flow**, built in the Console and embedded in the app with `FlowView`. The app hosts it and
nothing more: it never collects the data and never calls the API.

| Phase | What runs | Who calls |
| --- | --- | --- |
| 1 | Screens collect email, name, DOB, zip; OTP emailed | Descope |
| 2 | OTP verified → `POST /api/initiateRegistration` → record stored **Pending**, `userId` returned → Descope creates its passwordless shadow record | Descope engine → our API |
| 3 | Password screen → `POST /api/registration/password` → password hashed, record promoted to a real user | Descope engine → our API |
| — | Flow issues the session; the app shows "You're all set!" and applies it | Descope → app |
| 4 | SSN / eligibility / plan lookup | **not built** |

Both API calls are authenticated with a **connector key** — a shared secret in a header, configured on
the Descope connector. There is no member token on them; the caller is Descope's engine.

Build instructions for the flow: [`descope-registration-flow-setup.md`](descope-registration-flow-setup.md).
The API contract: [`dotnet-registration-api.md`](dotnet-registration-api.md).

## The decisions, and what they rule out

### Registration is a flow, not SDK calls

An earlier iteration had the app orchestrate registration with direct SDK calls (`otp.signUp.email`,
`otp.verify.email`) and call the API itself with the member's session token. That is the more common
pattern for a mobile app plus an IdP, and it is simpler: business logic stays in version-controlled,
testable code rather than console configuration.

We build the flow instead because the sequence diagram requires the **Descope engine** to call the
BFF, and because it keeps the API off the public path for member devices. The costs are real and worth
stating: the registration steps, their order and their validation now live in a vendor console rather
than in git, so they are not code-reviewed, not unit-tested, and not revertible with a `git revert`.
Flow edits also reach members instantly, with no app-release gate.

**Descope renders the screens** (not BYOS). That means the Figma designs for Personal Information,
Verify Email, Review and Create Account are rebuilt as flow screens; only "You're all set!" stays
native. BYOS would have kept the native designs but couples the app to screen and interaction IDs that
a console edit can break in already-shipped apps — Descope's own guidance limits it to exceptional
cases.

### Where claims live

Requirement: the session token should carry member claims (subscriber, plan). Constraint: only the
email is stored in Descope. Those collide — a claim inside a Descope-issued token means Descope holds
that value at issuance.

**Resolution: the .NET API mints its own enriched token.** Descope proves identity; the Auth API
validates that token and issues its own RS256 JWT carrying LOBs, plan IDs and subscriber — which it
already does today for password sign-in. Downstream services validate ours. Descope's token stays a
pure authentication artifact.

The alternative — a Descope **JWT Template** projecting user custom attributes into claims — works and
survives refresh, but requires putting subscriber and plan IDs into Descope.

What is *not* the answer: a flow's Custom Claims action. Those apply only to the token that flow
issues. Members signing in with biometrics (a refresh) or a passkey (a different flow) never run the
registration flow, so their tokens wouldn't carry the claims.

`DescopeUserId` exists on the member record for the exchange, but is **currently always null**: the
flow creates its shadow record only *after* `initiateRegistration` returns, so there is no id to
record at that moment. Until a later step populates it, the Descope-to-member link is the email.

### What Descope is used for beyond registration

Sessions, and the two features that are genuinely hard to build well: **biometric sign-in** (refresh
token gated behind an OS biometric prompt) and **passkeys** (WebAuthn via a hosted flow). Neither
depends on where member data lives, and neither is affected by the registration architecture.

## Known gaps and open questions

- **Sign-in doesn't work for members registered this way.** The password is in our database, and
  `descope.password.signIn` doesn't know about it. Closing it means the app posting credentials to our
  API, the API validating them and then minting a Descope session via an **embedded link**
  (`generateEmbeddedLink` + magic-link verify), so Descope still never sees a password. That's the next
  real piece of work, and the natural moment to build the token exchange.
- **Flow state is not "nothing shared".** The member's details sit in Descope's flow state during
  registration. Whether that is purely transient is Descope's implementation detail; for a payer system
  the question is usually whether a third party *processes* the data at all, which affects BAA scope
  regardless of retention. Worth confirming in writing rather than inferring.
- **Step 10's ordering is not buildable as drawn — confirmed.** The diagram creates the Descope user
  only after our API confirms, so a failed call leaves no orphan. Descope's OTP step is a single
  composite action (`Sign Up or In / OTP / Email`) that creates the user when it sends the code, so
  creation always precedes our call. The diagram needs updating. The cost is orphan email-only users
  from abandoned registrations; they self-heal on return, but want a cleanup job.
- **Password policy is defined twice** — on the flow's password screen and in the API's config. Drift
  means members are rejected after typing a password the screen accepted.
- **Step 4 (eligibility) isn't built**, and with it the subscriber/plan values the enriched token is
  meant to carry.
- **The .NET service has never been compiled here** (no SDK available in this environment), so expect
  build errors on the first real `dotnet build`.

# Member Portal — architecture and the decisions behind it

The short version: **Descope verifies email addresses and issues sessions. We own everything else.**

| | Descope | MemberPortal .NET API |
| --- | --- | --- |
| Holds | the email address (login ID), sessions, biometric/passkey bindings | the member record, the **password**, and later the eligibility data |
| Does | sends and verifies the email OTP; mints the session token | stores the record, hashes the password, and will mint the enriched token |
| Never sees | the password, or any profile field | — |

Nothing but the email address is shared with Descope. That is the fixed constraint everything below
follows from.

## Registration

A six-step native wizard in the app. Steps 1–2 are Descope, 3–4 are ours, 5 isn't built yet.

| Step | Screen | What runs |
| --- | --- | --- |
| 1 | Personal Information | `descope.otp.signUp.email(email)` — **email only** — creates a passwordless Descope user and emails a code |
| 2 | Verify Email | `descope.otp.verify.email` returns a session, held in app state, not yet applied |
| 3 | Review Your Information | `POST /api/initiateRegistration` stores the reviewed record, returns `userId` |
| 4 | Create Account | `POST /api/registration/password` hashes the password and promotes the record to a real user |
| 5 | *(membership check)* | Not built — SSN / eligibility / plan lookup |
| 6 | All set | The held session is applied; the app lands on the Portal |

Both API calls carry the Descope session JWT as a bearer token; the API validates it against Descope's
JWKS and cross-checks the email claim against the body. The API also records the token's `sub` as
`DescopeUserId` on the member — see "Where claims live" below for why.

## The decisions, and what they rule out

### The app calls the API; Descope does not

The original sequence diagram had Descope's flow engine calling the API through HTTP connectors
("passthru"), with the app rendering the flow's screens. We build it the other way: the app
orchestrates and calls the API directly, with the IdP doing authentication only.

Why: enrollment rules — age limits, ZIP formats, password policy, resume-on-retry, duplicate handling
— are business logic. In code they are version-controlled, unit-tested, code-reviewed and revertible.
In a flow they are configuration in a vendor console, changed instantly and invisibly, with an app
release cycle that can't keep up. Descope's own guidance limits Bring Your Own Screen to exceptional
cases for the same reason.

**The one condition that would reverse this:** if the API must not be internet-facing. If network
policy forbids it, passthru wins and the console coupling is the price. That question is worth
putting to the security team explicitly rather than inferring — it is the only argument that beats
the above. (An earlier passthru implementation is on the AUTH-API repo's
`claude/registration-descope-passthru` branch if it ever comes back.)

Note this changes the *transport*, not the architecture: the data boundaries in the table above are
exactly what the diagram specifies.

### Where claims live

Requirement: the session token should carry member claims (subscriber, plan). Constraint: only the
email is shared with Descope. Those collide — a claim inside a Descope-issued token means Descope
holds that value at issuance.

**Resolution: the .NET API mints its own enriched token.** Descope proves identity; the Auth API
validates that token and issues its own RS256 JWT carrying LOBs, plan IDs and subscriber — which it
already does today for password sign-in. Downstream services validate ours. Descope's token stays a
pure authentication artifact, and the "email only" constraint holds literally.

`DescopeUserId` on the member record exists for exactly this: it maps a Descope subject to a member
without matching on email.

The alternative — a Descope **JWT Template** projecting user custom attributes into claims — works and
survives refresh, but requires putting subscriber and plan IDs into Descope. Available if the team
decides that's acceptable.

Note what is *not* the answer: a flow's Custom Claims action. Those apply to the token that flow
issues. Members signing in with biometrics (a refresh) or a passkey (a different flow) never run the
registration flow, so their tokens wouldn't carry the claims.

### What Descope is still used for

Email OTP, sessions, and the two features that are genuinely hard to build well: **biometric sign-in**
(refresh token gated behind an OS biometric prompt) and **passkeys** (WebAuthn via a hosted flow).
Neither depends on where member data lives.

## Known gaps

- **Sign-in doesn't work for members registered this way.** The password is in our database, and
  `descope.password.signIn` doesn't know about it. Pointing sign-in at the API is the next real piece
  of work.
- **Step 5 (eligibility) isn't built**, and with it the subscriber/plan values the enriched token is
  meant to carry.
- **Orphaned Descope users.** A member who verifies their email and then abandons the wizard leaves a
  Descope user with no member record. It self-heals if they return — `startRegistration` falls back to
  `otp.signIn.email` for an existing address — so the residue is only unused records from people who
  never come back. Worth a cleanup job eventually, not a correctness problem.
- **The .NET service has never been compiled here** (no SDK available in this environment), so expect
  to shake out build errors on first `dotnet build`.

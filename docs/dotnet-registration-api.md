# Build the registration BFF endpoints (.NET) — Descope passthru model

> Standalone handoff brief, written for the AUTH-API repo. Source of truth is
> the sequence diagram *"AHC Descope - Login Flow - Registration - Descope -
> Passthru"*; the step numbers below match its numbered arrows.

## Architecture

Registration runs **inside a Descope Flow**. The member fills in the flow's
screens, Descope holds the entered data in flow state, and **the Descope engine
calls your BFF** over HTTP connectors at three points. Your BFF owns the member
record in **ARTS DB** and the eligibility check against **Facets**.

Descope stores only a passwordless shadow record — the email address, nothing
else — and at the end issues a session JWT enriched with custom claims built
from data you return.

The single most important consequence: **these calls come from Descope's
servers, not from the mobile app.** There is no member-held session JWT on
them. Auth between Descope and the BFF is connector-level (see "Authenticating
the calls" below).

## The flow, phase by phase

**Phase 1 — Upfront data collection & OTP generation.** The member enters email,
first name, last name, DOB and zip into the Descope flow (1). The flow holds the
form in flow state (2) and emails an OTP (3). Your BFF is not called yet.

**Phase 2 — OTP verification & backend sync.** The member enters the OTP (4) and
Descope validates it (5). Only then does the flow call
**`POST /api/initiateRegistration` with `{email, firstName, lastName, dob,
zipCode}`** (6). You store the member record in ARTS DB (7) in **Pending**
state (8) and return **`200` with `{emailID/userID}`** (9). Descope then creates
its passwordless shadow record, email only (10).

Note the ordering: the ARTS DB record is created *before* the Descope user
exists. If your call fails, no shadow record is created — the member record is
the source of truth and Descope follows it.

**Phase 3 — Update password.** The member enters password + confirm password
(11, 12) and the flow posts **`{userID, password, confirmpassword}`** to the BFF
(13). You validate the password against policy, update the record in ARTS DB
(14) and return `200 OK` (15); the flow advances (16).

⚠️ The diagram shows this hitting `/api/initiateRegistration` again — the same
path as step 6 with a completely different payload. Treat that as a diagram
slip unless someone confirms otherwise: give it its own route (e.g.
`POST /api/registration/password`). If it really must share the path, the
handler has to branch on payload shape, which is worth avoiding.

**Phase 4 — Complete registration.** The member enters SSN / member info (17,
18) and the flow posts **`POST /api/completeRegistration` with `{email,
SSN/MemberInfo}`** (19). You fetch MemberInfo from **Facets across all
tenants** (20, 21), compare it against what the member submitted, and return
**registration complete status `true` along with MemberInfo and PlanInfo** (22).
Descope maps **`subscriberId` and `planId` into custom JWT claims** (23) and
issues the enriched session JWT to the member (24).

## Endpoints to implement

| # | Endpoint | Request | Response |
| --- | --- | --- | --- |
| 6 | `POST /api/initiateRegistration` | `{ email, firstName, lastName, dob, zipCode }` | `200` `{ userId, email }` — record created Pending |
| 13 | `POST /api/registration/password` *(see slip above)* | `{ userId, password, confirmPassword }` | `200 OK` |
| 19 | `POST /api/completeRegistration` | `{ email, ssn, memberInfo… }` | `200` `{ complete: true, memberInfo, planInfo }` incl. `subscriberId`, `planId` |

Confirm the exact response field names with whoever configures the Descope
connectors — the flow maps them into claims, so the names have to match on both
sides. Same for `dob`'s format; agree on ISO `yyyy-MM-dd` unless the flow sends
something else.

## Authenticating the calls

Not a member JWT — the caller is Descope, machine to machine:

- Authenticate the connector: a bearer token or API key that Descope's connector
  config sends and you verify, or mTLS if the team prefers. Keep the secret in
  configuration/secret storage, never in source.
- TLS is mandatory: phase 3 puts a plaintext password in the request body.
- Consider an IP allow-list if Descope publishes egress ranges, as defense in
  depth — not as the only control.
- Reject anything unauthenticated. Because the flow only calls you *after* it has
  validated the OTP, a properly authenticated call is your evidence the email was
  verified — but that guarantee is only as strong as the connector credential, so
  treat it accordingly.

## Data model (suggested)

`Member`: `UserId`, `Email` (unique), `FirstName`, `LastName`, `DateOfBirth`,
`ZipCode`, `PasswordHash`, `Status` (`Pending` → `Active` → `Complete`),
`SubscriberId`, `PlanId`, SSN, `CreatedAt`, `UpdatedAt`.

Hash the password with ASP.NET Core Identity's `PasswordHasher<T>`, bcrypt or
Argon2 — never a bare SHA — and never log it or let it reach request-logging
middleware.

**SSN and member info are PHI/PII.** Encrypt at rest, keep them out of logs and
error responses, mask anywhere they're echoed back, and check what your
retention policy requires. This is a payer system; treat the whole record as
regulated data.

Make `initiateRegistration` idempotent on email: a member who abandons the flow
and starts over must not hit a duplicate-key error — return the existing Pending
record. Decide explicitly what happens when the email is already **Complete**
(most likely: refuse, with a message the flow can show).

## Errors

Return ProblemDetails with a `detail` a member could act on. Whatever the flow
is configured to display comes from your response body, so no stack traces, and
nothing containing SSN or other PHI.

Failure cases worth designing now: Facets returns no match for the SSN/member
info; Facets is unreachable; the submitted info contradicts Facets; the member
is found but not eligible. Each needs a distinct, non-leaky response the flow
can branch on.

## Open questions to settle before building

1. Is the phase-3 call really on `/api/initiateRegistration`, or its own route?
2. Exact response field names Descope maps to claims (`subscriberId`, `planId`).
3. Is `email` or `userID` the key on `completeRegistration`? The diagram shows
   `email` at step 19 but `userID` at step 13.
4. What "compare MemberInfo against Facets data" must match on, and what a
   mismatch does to the registration.
5. Whether anything else belongs in the enriched JWT beyond subscriber and plan.

## If work already exists on `Registration-Story`

Check it against this model before extending it. Anything written on the
assumption that the **mobile app** calls these endpoints with a member's Descope
session JWT needs revisiting: in the passthru design the caller is Descope, the
auth is a connector credential, and the endpoint names above are the ones the
flow will use.

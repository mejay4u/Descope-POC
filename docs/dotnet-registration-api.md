# Build the MemberPortal registration API (.NET)

> Handoff prompt for the agent building the .NET side. The mobile client is
> already written and calling these endpoints — see
> `MemberPortal/src/services/memberApi.ts` in this repo (branch
> `claude/registration-memberportal-storage-9vlx1w`) for the exact client.

## What we're building and why

A React Native member portal app uses **Descope** as its identity provider, but
member data must **not** live in Descope. Descope's only job during
registration is proving the member owns their email address — it sends and
verifies an email OTP, and keeps the email as the login ID. The account it
creates is a passwordless, email-only shadow record.

Everything else — first name, last name, date of birth, zip code, phone, **and
the password** — belongs in the MemberPortal database, behind the .NET API you
are building. Descope must never receive the password.

Your job: the three endpoints below, the data model behind them, and Descope
JWT validation on the two authenticated ones.

## What the mobile app already does

The registration wizard has five steps. Steps 1–2 are Descope; steps 3–4 are you.

1. **Personal information** — the member fills in first name, last name, date of
   birth (MM/DD/YYYY), zip, email, optional phone. On Continue the app calls
   Descope's `otp.signUp.email(email)` with *the email alone*. This creates the
   email-only shadow user in Descope and emails a 6-digit code. Nothing is sent
   to your API yet; the form stays in the app's memory.
2. **Verify email** — the member enters the code; the app calls Descope's
   `otp.verify.email`, which returns a session (`sessionJwt` + `refreshJwt`).
   The app holds that session without activating it.
3. **Review your information** — read-only confirmation of what they typed, with
   an edit path back to step 1. Tapping **Confirm & Continue** is what calls
   **your** `POST /api/registrations`, storing the record and getting back a
   `memberId`. (The write happens here rather than the moment the OTP is
   verified so that edits on the review screen can't leave a stale record
   behind.)
4. **Set a password** — the checklist is rendered from your
   `GET /api/registrations/password-policy`; the app additionally caps length at
   20 characters client-side. Tapping Create account calls your
   **`POST /api/registrations/{memberId}/password`**.
5. **Success** — the app activates the Descope session it has been holding since
   step 2 and the member lands in the portal.

Both writes send the Descope session JWT from step 2 as
`Authorization: Bearer <sessionJwt>`. The app times out after 15 seconds. It is
a mobile client, so no CORS is needed.

## Endpoints to implement

### 1. `POST /api/registrations` — store the registration record

Authenticated (Descope bearer token).

```jsonc
// request
{
  "firstName": "Jane",
  "lastName": "Member",
  "dateOfBirth": "1985-04-23",   // ISO yyyy-MM-dd
  "zipCode": "12345",
  "email": "jane@example.com",
  "phone": "+14155551234"        // null when not provided
}

// 201 Created
{ "memberId": "8f3c…", "status": "Pending" }
```

`memberId` is yours to generate (a GUID is fine); the app treats it as an opaque
string and sends it back on the password call. Only `memberId` is required in
the response — `status` is informational.

**Resume behavior:** the email is the natural key. If a *Pending* record already
exists for that email (the member abandoned an earlier attempt), return `200 OK`
with the same `memberId` instead of a duplicate-key error, so the retry
continues where it left off.

**Already registered:** if the email belongs to a completed/active member,
return `409 Conflict` with a message the member can act on — the app displays
your error text verbatim (see "Errors" below). Something like *"An account
already exists for this email address. Please sign in."*

### 2. `POST /api/registrations/{memberId}/password` — set the password

Authenticated (Descope bearer token).

```jsonc
// request
{ "password": "…" }

// 204 No Content     (a 200 with a body is fine too — the app ignores it)
```

Hash it (ASP.NET Core Identity's `PasswordHasher<T>` or bcrypt/Argon2 — not a
bare SHA), store it against the member record, and move the record from
*Pending* to *Active*. Enforce the password policy server-side here; the
client-side checklist is a UI affordance, not validation. Never log the
password, and make sure it can't land in request-logging middleware.

This password is what sign-in will later be validated against. Do not forward it
to Descope.

### 3. `GET /api/registrations/password-policy` — the rules the wizard renders

Unauthenticated (it's just the rules).

```jsonc
{
  "minLength": 8,
  "lowercase": true,
  "uppercase": true,
  "number": true,
  "nonAlphanumeric": true
}
```

If this endpoint is missing or unreachable the app falls back to those exact
defaults, so it's optional — but whatever you return here must match what
endpoint 2 actually enforces, or members will hit rejections the checklist said
were fine.

## Authenticating the two writes

The bearer token is a **Descope session JWT**. Validate it properly — it is the
only proof the app has that this email address was just verified.

- Standard JWT validation against the project's JWKS
  (`https://api.descope.com/<projectId>/.well-known/jwks.json` — confirm the URL
  and issuer format against current Descope docs). `AddJwtBearer` with the
  metadata address works; Descope also publishes a .NET SDK if you'd rather use
  its session-validation helper.
- The `sub` claim is the **Descope user ID**. Store it on the member record — it
  is the durable link between the Descope shadow record and your row, and it
  costs nothing since it's already in the token. Today the only thing tying the
  two together is the email string.
- **Do not trust the `email` in the request body.** Cross-check it against the
  authenticated user. Descope session JWTs don't necessarily carry the email as
  a claim by default; if it isn't there, either configure the project to include
  it as a custom claim or resolve it with the Descope Management SDK
  (load-user-by-id, using a management key held server-side). If the body email
  doesn't match the token's user, reject with `403`.
- On endpoint 2, also verify the `{memberId}` in the path belongs to the
  authenticated user — otherwise anyone with a valid session could set someone
  else's password.

## Data model (suggested)

A `Member` record with: `MemberId`, `DescopeUserId` (from `sub`), `Email`
(unique), `FirstName`, `LastName`, `DateOfBirth`, `ZipCode`, `Phone`,
`PasswordHash`, `Status` (`Pending` | `Active`), `CreatedAt`, `UpdatedAt`.

Keep the password hash out of any DTO that gets serialized back to a client.

## Errors

The app surfaces your error message to the member as-is. It reads, in order:
ASP.NET Core ProblemDetails `detail`, then the first entry of the validation
`errors` dictionary, then `title`, then a plain `{ "message": "…" }`, falling
back to the status code if none are present.

So return something a member can act on ("That date of birth doesn't match our
records"), never an internal exception or stack trace.

## Out of scope for now — but design for it

Sign-in still goes through Descope's own password check, which will fail for
members registered this way since Descope has no password for them. The
follow-up is *Login Flow A: password proxy validation* — either a Descope flow
that calls a validation endpoint on your API, or the app calling your API
directly for login. Don't build it yet, but keep the password hashing and lookup
shaped so a "validate these credentials" endpoint is a small addition.

Also on the roadmap: enriching the Descope session JWT with custom claims
(memberId, subscriber and plan info). That has to come from your side via the
Descope Management SDK — the mobile app can't set claims that anyone should
trust.

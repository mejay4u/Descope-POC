# MemberPortal registration API — the contract the app depends on

The two endpoints the app calls after Descope has verified the member's email. Implemented in the
**AUTH-API** repo under `registration/`; this document is the app's side of the agreement.

See [`architecture.md`](architecture.md) for why the split is drawn this way.

## Who calls, and with what

The **mobile app** calls these directly — not Descope. Every call carries the Descope session JWT the
app received from `otp.verify.email`:

```
Authorization: Bearer <descope session jwt>
```

That token is the only evidence these endpoints have that the email address was verified, so it must
be validated, not merely decoded: signature against Descope's JWKS for the project
(`https://api.descope.com/<projectId>/.well-known/jwks.json`), issuer equal to the project ID, and
lifetime. The app times out after 15 seconds.

## 1. `POST /api/initiateRegistration`

Stores the reviewed registration details and returns the pending record's id.

```jsonc
// request
{
  "email": "jane@example.com",
  "firstName": "Jane",
  "lastName": "Member",
  "dateOfBirth": "1985-04-23",   // ISO; the app's form collects MM/DD/YYYY and converts
  "zipCode": "12345",
  "contactNumber": "123-456-7890" // null when not provided
}

// 200
{ "userId": "8f3c…", "email": "jane@example.com", "status": "Pending" }
```

Required behavior:

- **Cross-check the email** against the token's email claim; `403` on mismatch. A valid token for one
  address must not be able to register another. (Descope projects vary on whether the session token
  carries an email claim — if yours doesn't, add it as a custom claim or resolve it via the Management
  SDK rather than skipping the check.)
- **Record the token's `sub`** as `DescopeUserId` on the member. This is what lets the Auth API later
  exchange a validated Descope token for its own enriched token without matching on email.
- **Resume, don't duplicate.** A member who abandons the wizard and starts again must get the same
  `userId` back rather than a duplicate-key error. An expired pending record is replaced.
- **`409`** if the email already has a completed account.

## 2. `POST /api/registration/password`

The Create Account button. Sets the password and creates the account.

```jsonc
// request
{ "userId": "8f3c…", "password": "…", "confirmPassword": "…" }

// 201
{ "userId": "8f3c…", "email": "jane@example.com", "username": "jane@example.com" }
```

Required behavior:

- Hash it (PBKDF2 / bcrypt / Argon2 — not a bare SHA) and promote the pending record to a real user
  **under the same id**, so the identifier the app has held since call 1 stays valid.
- Enforce the password policy server-side. The app's checklist mirrors it but is not validation.
- Never log the password or let it reach request-logging middleware.

## Password policy

The app's checklist (`PASSWORD_POLICY` in `src/screens/register/types.ts`) and the API's
`PasswordPolicy` config must agree, or members are told one thing and refused for another. Current
values, from the Create Account design:

| Rule | Value |
| --- | --- |
| Length | 14–56 characters |
| Uppercase | required |
| Lowercase | required |
| Digit | required |
| Special character | required |

## Errors

The app shows your message to the member as-is. It reads, in order: ProblemDetails `detail`, the first
entry of the validation `errors` dictionary, `title`, then a plain `{ "message": … }`, falling back to
the status code. Return something a member can act on, never an internal exception.

## Not in this contract

- **Step 5 — membership/eligibility** (SSN, plan lookup, subscriber and plan IDs). Deferred.
- **Sign-in.** The password lives in this database now, so sign-in has to be validated against it —
  currently unresolved, and the next piece of work.
- **The enriched token.** The Auth API mints it; it isn't part of the registration wizard.

# MemberPortal registration API — the contract the flow depends on

The two endpoints called during registration, implemented in the **AUTH-API** repo under
`registration/` (branch `claude/registration-descope-passthru`). This document is the Descope side of
the agreement — what the flow's connectors send, and what they must get back.

See [`architecture.md`](architecture.md) for why the split is drawn this way, and
[`descope-registration-flow-setup.md`](descope-registration-flow-setup.md) for building the flow that
makes these calls.

## Who calls, and with what

**Descope's flow engine calls these, server to server.** The mobile app does not — it hosts the flow
and never touches this API. There is no member session token on these requests, because at the moment
they fire the member has no session yet.

```
Content-Type: application/json
X-Connector-Key: <shared secret>
```

That key is load-bearing in a way that's easy to miss. The flow only reaches these endpoints *after*
it has verified the OTP, so the key is the **only** evidence the API has that the email address was
verified at all. Anyone who can present it can create a registration for any address. Treat it like a
signing key: store it in Key Vault, never in source, and rotate it by configuring two keys at once.

The API accepts a list of keys and compares in constant time without short-circuiting on the first
match. Startup fails if neither a key nor the development `AllowAnonymous` escape hatch is set.

**Reachability:** connectors run from Descope's cloud, so the API must be publicly resolvable —
`localhost`, `10.0.2.2` and private addresses will not work. A tunnel (ngrok, Cloudflare Tunnel) or a
deployed environment is a prerequisite for testing the flow end to end.

## 1. `POST /api/initiateRegistration`

Fired by the connector immediately after the OTP is verified. Stores the details the flow has been
holding in flow state, and returns the pending record's id.

```jsonc
// request
{
  "email": "jane@example.com",
  "firstName": "Jane",
  "lastName": "Member",
  "dateOfBirth": "1985-04-23",    // ISO yyyy-MM-dd — see the note below
  "zipCode": "12345",
  "contactNumber": "123-456-7890" // optional; omit or null
}

// 200
{ "userId": "8f3c…", "email": "jane@example.com", "status": "Pending" }
```

Required behavior:

- **Resume, don't duplicate.** A member who abandons the flow and starts again gets the same `userId`
  back rather than a duplicate-key error. An expired pending record is replaced.
- **`409`** if the email already has a completed account.
- Store the record as **Pending**. It is not an account yet — no password, no sign-in.

The flow must capture `userId` from the response into flow state; call 2 is useless without it.

> **`dateOfBirth` must arrive as ISO `yyyy-MM-dd`.** If the flow screen collects MM/DD/YYYY, convert
> before the connector fires — a `DateOnly` bind failure returns a 400 that doesn't explain itself.

> There is **no `emailVerified` flag** in the request or the schema. Verification is proven by the
> ordering (the connector fires only after the OTP step) plus the connector key. That is the whole
> argument, which is why the key matters as much as it does.

## 2. `POST /api/registration/password`

Fired after the flow's password screen. Sets the password and creates the account.

```jsonc
// request
{ "userId": "8f3c…", "password": "…", "confirmPassword": "…" }

// 201
{ "userId": "8f3c…", "email": "jane@example.com", "username": "jane@example.com" }
```

Required behavior:

- Hash it (PBKDF2 / bcrypt / Argon2 — not a bare SHA) and promote the pending record to a real user
  **under the same id**, so the identifier the flow captured in call 1 stays valid.
- Enforce the password policy server-side. The flow screen's validation mirrors it but is not
  validation.
- Never log the password or let it reach request-logging middleware.

**Descope never receives this password.** That is the fixed constraint, and it is also why sign-in
does not yet work for members registered this way — see `architecture.md`.

> ⚠️ The sequence diagram draws **both** calls against `/api/initiateRegistration` (steps 6 and 13)
> with different bodies. Read as a copy-paste slip: the password call keeps its own route. If it
> genuinely has to share the path, the handler would need to branch on payload shape — worth avoiding.

## Password policy

The flow's password screen and the API's `PasswordPolicy` config must agree, or members are told one
thing and refused for another. This is now the **only** place the two can drift, since the app no
longer renders the password screen. Current values, from the Create Account design:

| Rule | Value |
| --- | --- |
| Length | 14–56 characters |
| Uppercase | required |
| Lowercase | required |
| Digit | required |
| Special character | required |

## Errors

Responses are ProblemDetails. The flow's connector step needs a **failure branch** on each call, or a
`400`/`409`/`500` dead-ends the member on a spinner with nothing on screen. Route the failure to a
screen that shows the API's `detail` — it is written to be read by a member — and offer a way back.

`401` means the connector key is wrong or missing. That is a configuration fault, not something a
member can act on; show a generic message and alert on it.

## Not in this contract

- **Phase 4 — membership/eligibility** (SSN, Facets lookup, subscriber and plan IDs). Deferred.
- **Sign-in.** The password lives in this database now, so sign-in has to be validated against it —
  currently unresolved, and the next piece of work.
- **The enriched token.** The Auth API mints it; it is not part of registration.
- **`DescopeUserId`.** The column and plumbing exist, but nothing populates it: under this ordering
  the Descope user is created *after* call 1 returns, so there is no `sub` to record. Until a later
  step populates it, the Descope↔member link is the email address.

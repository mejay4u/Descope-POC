# .NET token consumption — notes, not a design

**Status: deferred on purpose.** The plan is to design this *after* sign-in is proven working on a
device. This file exists so that when that conversation starts, nobody has to re-derive the basics.

Nothing here has been implemented or tested. There is no .NET code alongside this app.

## What the app will have to hand over

After a successful sign-in the app holds a `DescopeSession` (see `useSession()`):

| Token | What it's for |
| --- | --- |
| `sessionJwt` | short-lived; the one you'd send as `Authorization: Bearer …` |
| `refreshJwt` | long-lived; **stays on the device** — never send it to a service |

## Validating the session JWT

It's an RS256 JWT signed by Descope. A consumer validates it the standard way:

| | Value |
| --- | --- |
| Algorithm | RS256 |
| Issuer (`iss`) | your Descope **Project ID** |
| Subject (`sub`) | the Descope user ID |
| Signing keys | Descope's JWKS endpoint for the project |

Get the exact issuer string and JWKS URL from the Descope Console rather than assuming a format — and
prefer Descope's own .NET/backend SDK over hand-rolling validation if one is available for your target
framework, since it handles key rotation and caching.

**Validate the signature server-side.** The app deliberately does not (`src/auth/claims.ts` decodes
only, and says why): a client verifying a token it was just handed proves nothing. The service is where
it matters.

## Claims to expect

Put there by the project's JWT Template (`descope-signin-flow-setup.md` §4):

| Claim | Type | Notes |
| --- | --- | --- |
| `memberId` | string | |
| `plan` | string | |
| `subscriberId` | string | |
| `lobs` | array **or** comma-separated string | depends on the Descope attribute type — the app normalises both, and a .NET consumer will need to as well |

Plus the standard `iss`, `sub`, `exp`, `iat`.

Claims are present on **every** sign-in path including biometric refresh and passkey — that's the whole
reason a JWT Template was chosen over a flow action. See `architecture.md`.

## Questions to settle when this is actually designed

- **Does .NET consume Descope's token directly, or exchange it for its own?** This pilot puts the claims
  in Descope's token, so a service can read them straight off it. The alternative is treating Descope's
  token as a pure authentication artifact and minting an enriched token of your own from it — more
  moving parts, but it keeps member data out of the identity provider and lets you add claims without
  touching Descope. That's a genuine fork, and it interacts with the next question.
- **Whether member data should live in Descope at all.** A JWT Template reads user custom attributes, so
  choosing it put `plan` and `subscriberId` in the identity provider. See "Known gaps" in
  [`architecture.md`](architecture.md) — if that answer is no, the token design changes.
- **What happens when claims change mid-session?** A plan change updates the Descope attribute, but the
  member's current session token still carries the old value until it refreshes.
- Token lifetime and refresh behaviour for long-lived .NET sessions.
- Whether downstream services validate Descope's token individually, or behind a gateway.

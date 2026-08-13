# Pilot ID card API — securing an endpoint with a Descope JWT

A small, runnable .NET reference for one question: **how does the ID card API
accept only requests carrying a valid Descope session token, and serve each
member only their own card?**

Nothing here is meant to ship. It exists so the three or four files that matter
can be read, run, and then lifted into the real ID card API. Jump to
[What to copy](#what-to-copy-into-the-real-api) if that is all you need.

---

## A caveat worth reading first

**This solution has never been compiled.** No .NET SDK is available in the
environment it was written in, and the proxy there blocks
`builds.dotnet.microsoft.com`, so `dotnet build` was never run against it. Package
versions were checked against nuget.org and the APIs used are long-standing ones,
but expect to fix something on the first real build — the same caveat
`docs/architecture.md` already records for the registration API.

Treat the auth design as reviewed and the syntax as unverified.

---

## What it is

```
pilot-api/
├── src/
│   ├── PilotApi.Domain/           the IdCard record. References nothing.
│   ├── PilotApi.Application/      handler, DTO, the IIdCardRepository interface
│   ├── PilotApi.Infrastructure/   in-memory stubs standing in for your data access
│   └── PilotApi.Api/Endpoints/    two ID card routes
├── tests/PilotApi.Api.Tests/      xUnit; needs no Descope project and no network
└── tools/get-test-token.sh        prints a real session JWT for manual testing
```

**The authentication and authorization code is no longer in here.** It lives in
[`../packages/MemberPortal.Authentication.Descope/`](../packages/MemberPortal.Authentication.Descope/),
which is what your services reference from Nexus. This project consumes it by
`ProjectReference`, so the tests below exercise the package's own code rather than a copy
of it — which is the cheapest proof the package works.

Layering is `Api → Infrastructure → Application → Domain`, with authentication
confined entirely to `PilotApi.Api`. The application layer sees the caller through
`ICallerIdentity` and never touches `ClaimsPrincipal`, which is what keeps the
layering from being decorative.

Two endpoints, and the difference between them is the point:

| Route | Protection |
| --- | --- |
| `GET /api/idcard/me` | Member comes from the token's `sub`. Nothing in the request selects the card, so cross-member access is unrepresentable. |
| `GET /api/idcard/{memberId}` | Same data, guarded by the `MemberOwnsResource` policy. Another member's id returns **403**. |

Prefer the first shape. The second exists because your real API almost certainly
already has an id in the route, and "rewrite every route" is not useful advice.

---

## Run it

```bash
cd pilot-api

# 1. Your Descope project id. Startup fails without it, on purpose.
dotnet user-secrets set "Descope:ProjectId" "P2xxxxxxxxxxxxxxxxxxxxxxxx" \
  --project src/PilotApi.Api

# 2. Run
dotnet run --project src/PilotApi.Api
```

Swagger opens at `http://localhost:5217/swagger` (Development only — an anonymous
public description of every route on a member-facing API is a reconnaissance aid).

Then, in order:

1. `GET /api/idcard/me` with no token → **401** with a ProblemDetails body.
2. Paste a token into **Authorize** (see below) → **200** with Alice's card.
3. `GET /api/idcard/member-bob` with the same token → **403**.

`dotnet test` runs the suite. It needs no Descope project and makes no network
calls.

---

## Getting a JWT for testing

**Short answer: yes, real tokens have to come from Descope** — the API verifies
signatures against Descope's published public keys, so a token cannot be
hand-made. But no, you do not need to "go to Descope" in the sense of contacting
them. It is all self-serve inside your own project. Three ways, in increasing
order of automation:

### 1. The Console flow runner — fastest, manual

Descope Console → **Flows** → open the registration or a sign-in flow → **Run**.
Complete it; the flow issues a session JWT. Copy it out of the runner's result
panel, or from the browser's `DS` value in storage. Paste into Swagger's
**Authorize** box.

### 2. The MemberPortal app

Sign in and log the session JWT from `useAuth`. Worth doing once, because it is
the exact token the app will send in anger, rather than one you produced a
different way.

### 3. `tools/get-test-token.sh` — scriptable, for Postman and CI

```bash
export DESCOPE_PROJECT_ID=P2...
export DESCOPE_MANAGEMENT_KEY=K2...     # Console → Company → Management Keys
./tools/get-test-token.sh pilot-tester@example.com
```

It creates a Descope **test user**, asks the management API for that user's OTP
code — which is returned in the response rather than emailed — verifies it, and
prints the resulting session JWT along with the `sub` and `iss` claims. Three
calls:

| Step | Endpoint | Auth header |
| --- | --- | --- |
| create test user | `POST /v1/mgmt/user/create` with `"test": true` | `Bearer {projectId}:{managementKey}` |
| generate the code | `POST /v1/mgmt/tests/generate/otp` | `Bearer {projectId}:{managementKey}` |
| exchange for a session | `POST /v1/auth/otp/verify/email` | `Bearer {projectId}` |

The management key can create and delete users in your project. It goes in an
environment variable or a secret store, never in the repository — the same rule
the connector key follows in `docs/dotnet-registration-api.md`.

### Two things that will waste your afternoon otherwise

- **Session tokens are short-lived** — minutes. A request that worked five
  minutes ago starting to 401 is almost always an expired token, not a bug.
- **The mobile app's `DESCOPE_PROJECT_ID` is still `YOUR_DESCOPE_PROJECT_ID`**
  (`MemberPortal/src/config/index.ts`). A real project has to exist before any of
  this works.

### Point the sample at your own token

The sample seeds two members, `member-alice` and `member-bob`. Your Descope user
is neither. Run the script, take the `sub` it prints, and map it:

```jsonc
// src/PilotApi.Api/appsettings.Development.json
"Pilot": {
  "SubjectToMemberMap": {
    "U2xxxxxxxxxxxxxxxxxxxxxxxx": "member-alice"
  }
}
```

Without that mapping a perfectly valid token returns **404** on `/me`, because the
API cannot turn your `sub` into a member. That is not a bug in the sample — it is
the real gap, described next.

---

## The gap you have to close before this works on real data

Descope's `sub` is the **Descope user id**. It is not the member id in our
database, and every authorization decision here depends on bridging the two.

Per `docs/architecture.md`, that bridge does not currently exist: the member
record's `DescopeUserId` is always null, because the registration flow creates the
Descope shadow record only *after* `initiateRegistration` returns. The only
Descope-to-member link today is the email address — and a plain Descope session
token carries no email claim.

So the sample puts the bridge behind `IMemberIdentityResolver` and stubs it with a
configured lookup table. In the real API you need one of:

1. **Populate `DescopeUserId`** on the member record — a later step in the
   registration flow, or a backfill keyed on email — and resolve by that column.
   Sturdier: it survives a member changing their email address.
2. **Add an `email` claim** to the session token with a Descope **JWT Template**,
   and resolve by email. Faster to ship, but it ties member lookup to a mutable
   identifier and puts half the mapping in a vendor console.

Until one of those lands, the ownership check has nothing to compare against. This
is the single thing most likely to bite on the copy, which is why the resolver
returns null rather than falling back to "assume the sub is the member id" — a
fallback that would let every unrecognised caller name their own identity.

---

## What the auth actually does

All of it is in `src/PilotApi.Api/Authentication/`, driven by one config section:

```jsonc
"Descope": {
  "ProjectId": "P2...",                    // required; startup fails without it
  "BaseUrl": "https://api.descope.com",    // only for regional projects
  "ValidAlgorithms": [ "ES384", "RS256" ],
  "ValidateAudience": false,
  "ClockSkewSeconds": 30
}
```

Decisions worth knowing before you copy them:

- **No Descope SDK.** Descope publishes standard OIDC discovery and JWKS
  endpoints per project, so the framework's own JWT handler validates its tokens
  and rotates its keys. `MetadataAddress` is
  `{BaseUrl}/{ProjectId}/.well-known/openid-configuration`.

- **Both issuer forms are accepted.** Descope's discovery document advertises
  `https://api.descope.com/{projectId}`, while session tokens minted by flows have
  been seen carrying the bare project id in `iss`. Both are listed, so you do not
  have to guess which yours does — and it is still a pinned list of two exact
  strings. Do not replace it with `ValidateIssuer = false`; that accepts a
  correctly-signed token from *anyone's* Descope project.

- **Audience validation is off by default.** A plain Descope session token has no
  `aud` claim, so turning it on without arranging for one rejects every real
  member token. Turn it on if your project issues tokens through a JWT template or
  an OIDC application that sets one, and list the values in `ValidAudiences`.

- **Algorithms are pinned.** Accepting whatever the token names is how
  algorithm-confusion works — an HMAC-signed token using the verifier's own public
  key as the secret. The options validator refuses to start if an `HS*` algorithm
  appears in the list. **Check yours**: fetch
  `{BaseUrl}/{ProjectId}/.well-known/jwks.json`, read the `alg` on the keys, and
  trim the list to exactly that. The default covers both algorithms Descope
  projects have been seen with, and a shorter list is a smaller surface.

- **Clock skew is 30 seconds, not 5 minutes.** The framework default is a large
  fraction of a Descope session token's whole lifetime.

- **`MapInboundClaims` is off.** Left on, ASP.NET rewrites `sub` into a
  `http://schemas.xmlsoap.org/...` URI and every claim lookup written against the
  token you inspected at jwt.io silently returns null.

- **401 and 403 carry ProblemDetails bodies.** The framework's default 401 has an
  *empty* body; the MemberPortal app reads `detail` → validation `errors` →
  `title` out of a response, so an empty body reaches the member as an
  unexplained failure. The bodies deliberately do not say *why* validation failed
  — that goes to the log, at Debug, since a stream of expired tokens is normal
  traffic for a mobile client.

- **Startup fails on bad config.** A missing project id otherwise produces an API
  that boots, reports healthy, and returns 401 to every member — which gets
  triaged as a broken mobile app and can survive a deploy.

---

## Where each half goes across the services

The sample runs authentication and ownership in one process. In the real topology they
belong in different places, and getting that wrong is the difference between a clean
rollout and a member-database lookup in every service.

| Service | Takes | Does not take |
| --- | --- | --- |
| **BFF** (front door) | `AddDescopeJwtBearer()` + `AddDescopeMemberOwnership()` + a real `IMemberIdentityResolver` | — |
| **Downstream services** (`memberidcard`, and the rest) | `AddDescopeJwtBearer()` only | ownership policy, member lookup |
| **BFA / auth service** | `AddDescopeJwtBearer()` on its member-facing routes | ownership; and see the connector-key warning below |
| Workers and jobs with no HTTP surface | nothing | — |

Downstream services still validate the signature, issuer, algorithm and lifetime for
themselves — that is not delegated. What they delegate to the BFF is only the question
"is this member allowed to see *this* record".

**The risk that comes with that, stated plainly:** any caller that can reach a
downstream service directly with any valid member token can read any member's data. It
is acceptable only while those services are unreachable from outside the cluster, and
what closes it is the enriched token below, not a network rule.

### How the BFF calls downstream

It **forwards the member's token** — the same `Authorization: Bearer <token>` it
received. Downstream services then validate it with the same `AddDescopeJwtBearer`, and
nothing about the token needs translating. A `DelegatingHandler` on the typed client
does it:

```csharp
services.AddHttpClient<IIdCardClient, IdCardClient>()
        .AddHttpMessageHandler<ForwardMemberTokenHandler>();
```

Three rules for that handler:

- **Allowlist it, never make it global.** Register it per typed client, only on clients
  calling our own services. A blanket handler is how a member token ends up on a request
  to a third-party API.
- **Redact `Authorization` in request logging** — the same rule the registration API
  already applies to passwords.
- **Nothing asynchronous may carry it.** Descope session tokens live minutes. Work
  queued during a request and run later needs a service credential — a Descope access
  key, whose token validates against this same JWKS — not a copied member token.

### The trap on the auth service

`POST /api/initiateRegistration` and `POST /api/registration/password` are called by
Descope's flow engine with `X-Connector-Key` and **no member token at all**
(`docs/dotnet-registration-api.md`). `RequireAuthenticatedUserByDefault()` would 401
them and break registration entirely. Same for health probes and metrics. That method is
opt-in for exactly this reason.

---

## What goes into your services

Not files — a **package reference**. The code lives in
[`../packages/`](../packages/) and publishes to Nexus as two packages:

| Package | Referenced by |
| --- | --- |
| `MemberPortal.Authentication.Descope` | every web service accepting a member token — BFF and downstream alike |
| `MemberPortal.Authentication.Descope.Abstractions` | application/domain layers that want `ICallerIdentity` without an ASP.NET dependency |

Read [the package README](../packages/MemberPortal.Authentication.Descope/README.md) for
the consumer snippets and the configuration reference. The short version: downstream
services call `AddDescopeJwtBearer` and stop; front doors add
`AddDescopeMemberOwnership`, an `IMemberIdentityResolver` of their own, and
`AddMemberTokenForwarding()` on the typed clients calling downstream.

**Do not copy** `PilotApi.Infrastructure` — the in-memory repository, the seeded cards
and `StubMemberIdentityResolver` are scaffolding. The real `IMemberIdentityResolver`
lives on the BFF and is blocked on the `DescopeUserId` gap above.

### Things that will differ in the real services

- Most will already have an authentication scheme registered. Register this one under a
  **named scheme** and combine them in a policy scheme, rather than replacing what is
  there.
- Route values differ. `MemberOwnsResourceRequirement` takes the route value name as a
  constructor argument for exactly that reason.

## Later: the enriched token, and why it stops being optional

`docs/architecture.md` has the auth service (the BFA) minting its own RS256 token
carrying LOBs, plan ids and subscriber — something it already does for password sign-in
— with downstream services validating ours rather than Descope's.

With one service that is a nice-to-have. With a dozen it is the fix for the compromise
above. Today ownership sits only at the front door because the alternative is a member
lookup in every service. An enriched token carrying the **member id as a claim** removes
the lookup, so each service can re-acquire the ownership check by reading a claim — the
defence in depth you gave up, without the coupling that made you give it up.

The migration, when it lands: the BFF exchanges the Descope token at the BFA and forwards
the enriched one; each service either points `Descope:BaseUrl` / `Descope:ProjectId` at
the new issuer, or registers a second scheme and combines the two in a policy scheme so
both tokens work during the cutover.

The validation logic does not change either way. That is the whole reason every
Descope-specific value lives in configuration rather than in code.

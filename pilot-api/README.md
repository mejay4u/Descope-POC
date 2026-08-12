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
│   ├── PilotApi.Application/      handler, DTO, and the interfaces the API depends on
│   ├── PilotApi.Infrastructure/   in-memory stubs standing in for your data access
│   └── PilotApi.Api/
│       ├── Authentication/        ← the files to copy
│       ├── Authorization/         ← the files to copy
│       └── Endpoints/             two ID card routes
├── tests/PilotApi.Api.Tests/      xUnit; needs no Descope project and no network
└── tools/get-test-token.sh        prints a real session JWT for manual testing
```

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

## What to copy into the real API

1. **`src/PilotApi.Api/Authentication/`** — all five files. Drops in as-is:
   `DescopeAuthenticationOptions`, its validator, `DescopeAuthenticationExtensions`
   (the `AddDescopeJwtBearer` method), `ProblemDetailsAuthEvents`, `CallerIdentity`.
2. **`src/PilotApi.Api/Authorization/`** — the requirement, the handler, the policy
   names.
3. **Two lines in `Program.cs`:**
   ```csharp
   builder.Services.AddDescopeJwtBearer(builder.Configuration);
   builder.Services.AddPilotAuthorization();
   ```
   plus `.RequireAuthorization(...)` on your ID card route group.
4. **The `Descope` block** in `appsettings.json`, with the project id supplied by
   user-secrets locally and Key Vault in deployed environments.
5. **The tests**, pointed at your real endpoint. `PilotApiFactory` shows how to
   validate real tokens without a Descope project: swap
   `JwtBearerOptions.ConfigurationManager` for a static one holding a test key, and
   leave everything else — handler, validation parameters, events — exactly as it
   runs in production.

**Do not copy** `PilotApi.Infrastructure` — the in-memory repository, the seeded
cards, and `StubMemberIdentityResolver` are scaffolding. The real
`IMemberIdentityResolver` is the piece you have to write, and it is blocked on the
`DescopeUserId` gap above.

### Things that will differ in the real API

- You will likely already have an authentication scheme registered. Register this
  one under a **named scheme** and put both in a policy scheme, rather than
  replacing what is there.
- Your ID card route may take a member id in a different route value name — pass
  it to `MemberOwnsResourceRequirement`, which takes the name as a constructor
  argument for exactly this reason.
- `AuthorizationPolicies.AddPilotAuthorization` sets a `FallbackPolicy` requiring
  an authenticated user on every endpoint. That is the right default for a new
  service and a **breaking change** for an existing one — check for anonymous
  endpoints (health checks, the Descope registration connectors, which authenticate
  with `X-Connector-Key` and carry no member token) before you turn it on.

---

## Later: switching to the enriched token

`docs/architecture.md` has the .NET side eventually minting its own RS256 token
carrying LOBs, plan ids and subscriber, with downstream services validating ours
rather than Descope's. Nothing in this sample blocks that. When it lands, either:

- point `Descope:BaseUrl` / `Descope:ProjectId` at the issuer of the enriched
  token, if it is the only token the ID card API should accept; or
- call `AddDescopeJwtBearer` a second time under a different scheme name and
  combine the two in a policy scheme, which is the real migration path — ship on
  Descope tokens, cut over without redeploying the ID card API.

The validation logic does not change either way. That is the whole reason every
Descope-specific value lives in configuration rather than in code.

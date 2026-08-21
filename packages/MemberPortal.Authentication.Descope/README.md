# MemberPortal.Authentication.Descope

Descope session-token validation for ASP.NET Core services.

Descope issues the session JWT, the app sends it to the BFF, the BFF forwards it
downstream **unaltered**, and every service validates it for itself. This package is
referenced by the BFF and by each downstream service alike — the difference between them
is which methods they call, not which package or which token.

## Downstream service — the whole change

```csharp
builder.Services.AddDescopeJwtBearer(builder.Configuration);
...
app.UseAuthentication();
app.UseAuthorization();

app.MapGroup("/api/idcard").RequireAuthorization();
```

```jsonc
"Descope": {
  "ProjectId": "P2xxxxxxxxxxxxxxxxxxxxxxxx"   // required; not a secret
}
```

That's it. Signature, issuer, algorithm and lifetime are all validated; 401 comes back
as ProblemDetails rather than an empty body.

## Front door (BFF) — the above, plus

```csharp
builder.Services.AddDescopeMemberOwnership();
builder.Services.AddScoped<IMemberIdentityResolver, MemberIdentityResolver>();  // yours

builder.Services.AddHttpClient<IIdCardClient, IdCardClient>()
                .AddMemberTokenForwarding();
```

and on the routes that carry a member id:

```csharp
app.MapGet("/api/idcard/{memberId}", ...)
   .RequireAuthorization(DescopePolicies.MemberOwnsResource);
```

Prefer routes that take the member from the token instead (`/api/idcard/me`) wherever you
can — then cross-member access is unrepresentable rather than merely prevented.

## Request bodies that name a member

**Nothing in the current design needs this**, and it is worth saying why before the
API below tempts anyone into wiring it up.

Member context never travels in a request body. Clients send only the token. The BFF
reads the claims off that token, builds the downstream request **body** from them, and
forwards **the same Descope token, unchanged**, so the downstream service can validate it
for itself — signature, issuer, algorithm, lifetime. No token is minted, exchanged or
re-signed anywhere along the way; `AddMemberTokenForwarding()` copies the inbound
`Authorization` header verbatim. That is what `AddDescopeJwtBearer(configuration)` already
does, and it is the whole of the downstream story.

So member context always arrives as a claim, and a claim is checked by validating the
token it came in. There is no second copy to compare it against. That is a stronger
position than any comparison: a value the client cannot supply is a value the client
cannot tamper with.

### If an endpoint ever does accept member context in a body

Then two copies exist and they can disagree — while signature, issuer, audience and
expiry all pass, because the token really is the caller's. Register the check:

```csharp
builder.Services.AddDescopeClaimsPayloadCheck();
```

have the request model declare which values are member-scoped:

```csharp
public sealed record MemberInfoRequest(string? SubscriberId, string? PlanInformation)
    : IMemberScopedRequest;
```

and ask for it in the endpoint, once the body exists:

```csharp
var check = await authorization.AuthorizeAsync(
    httpContext.User, request, DescopePolicies.ClaimsMatchPayload);

if (!check.Succeeded)
{
    return DescopeAuthorizationResults.ClaimsMismatch();
}
```

It has to be requested by the endpoint rather than attached to the route: authorization
middleware runs **before model binding**, so a route-attached policy would be evaluated
while the body is still an unread stream.

It needs no member database and no resolver — it compares two values that both arrived
with the request — so unlike `AddDescopeMemberOwnership()` it is safe in a downstream
service as well as a front door.

### What it will and will not refuse

| Body value | Token claim | Result |
| --- | --- | --- |
| absent | anything | **passes** — nothing to contradict; read the value from the claim |
| supplied | matches | passes |
| supplied | differs | refused |
| supplied | **absent** | refused — a token asserting nothing cannot vouch for anything |

That last row is usually a JWT template that was never updated to project the claim. The
check refuses rather than waving every request through, which is the loud failure.

Claim names are matched case-insensitively across `SubscriberID` / `subscriberId` /
`subscriber_id` and `PlanInformation` / `planInformation` / `plan`, because the spelling
is decided in the Descope JWT template rather than here.

### Why it answers 401 and not 403

By the letter of HTTP this is a 403: the caller authenticated fine and simply is not
permitted. It is a **401** to match step 17 of the BFF Validation sequence diagram, and
because of what each status makes a mobile client do — a 401 makes the app purge its
session and return to sign-in, a 403 makes it show an error and carry on.

On a service-to-service hop that reasoning does not transfer: a mismatch there means an
upstream service is broken, not that the member's session is. `IsClaimsMismatch()` on the
`AuthorizationResult` lets such a caller tell this failure apart from an ordinary denial
and answer with its own status code.

`AddDescopeMemberOwnership()` stays a **403** deliberately: asking for another member's
ID card by route is an ordinary refusal, the session is fine, and signing the member out
over it would be wrong.

## What each method does, and where it belongs

| Method | Who calls it |
| --- | --- |
| `AddDescopeJwtBearer(configuration)` | every service accepting a member token |
| `AddDescopeMemberOwnership()` | **front doors only** — needs an `IMemberIdentityResolver` |
| `AddDescopeClaimsPayloadCheck()` | nothing today — only if an endpoint starts accepting member context in a body |
| `AddMemberTokenForwarding()` | front doors, per typed client calling our own services |
| `RequireAuthenticatedUserByDefault()` | opt-in; read the warning below first |

`AddDescopeMemberOwnership` is front-door-only because resolving a Descope `sub` to a
member needs the member mapping. Calling it in a downstream service means giving that
service access to the member database — multiplied across a dozen services, that is the
coupling an enriched token exists to remove. Downstream services still validate the
token fully; what they delegate is only "is this member allowed to see *this* record".

**`RequireAuthenticatedUserByDefault()` is a breaking change for an existing service.** It
401s every endpoint not explicitly marked `AllowAnonymous` — health probes, metrics, and
anything called server-to-server on a shared-secret header, such as Descope's
registration connectors, which carry no member token at all. It is opt-in for exactly
that reason.

## Configuration

```jsonc
"Descope": {
  "ProjectId": "P2...",                    // required; startup FAILS without it
  "BaseUrl": "https://api.descope.com",    // override only for a regional project
  "ValidAlgorithms": [ "ES384", "RS256" ],
  "ValidateAudience": false,
  "ValidAudiences": [],
  "ClockSkewSeconds": 30
}
```

Decisions behind the defaults — worth reading once before you change any of them:

- **Both issuer forms are accepted.** Descope's discovery document advertises
  `https://api.descope.com/{projectId}`, while session tokens minted by flows carry the
  bare project id in `iss`. Both are pinned exact strings. Do not replace this with
  `ValidateIssuer = false` — that accepts a correctly-signed token from *anyone's*
  Descope project.
- **Audience validation is off.** A plain Descope session token has no `aud` claim, so
  enabling it without arranging one rejects every real token. Turn it on only if your
  project issues tokens through a JWT template or OIDC application that sets one.
- **Algorithms are pinned.** Accepting whatever the token names is how algorithm
  confusion works. Startup fails if an `HS*` algorithm appears in the list. **Check
  yours**: fetch `{BaseUrl}/{ProjectId}/.well-known/jwks.json`, read the `alg` on the
  keys, and trim the list to exactly that.
- **Clock skew is 30s**, not the framework's 5 minutes, which is a large fraction of a
  Descope session token's whole lifetime.
- **`MapInboundClaims` is off**, so `sub` arrives as `sub` rather than being rewritten
  into a `http://schemas.xmlsoap.org/...` URI that makes every claim lookup return null.
- **Startup fails on bad config.** A missing project id otherwise produces a service that
  boots, reports healthy, and returns 401 to everyone — triaged as a broken client, and
  it survives a deploy.

### Once the project issues a custom issuer and audience

A JWT template that sets `iss` and `aud` — a custom auth domain and a named audience —
changes two settings here:

```jsonc
"Descope": {
  "BaseUrl": "https://auth-prod.ahc.com",
  "ValidateAudience": true,
  "ValidAudiences": [ "AHC" ]
}
```

`BaseUrl` feeds both the discovery address and the accepted issuers, which become the
bare project id and `https://auth-prod.ahc.com/{projectId}`.

⚠️ **Check what your template actually puts in `iss` before deploying this.** The
accepted issuers are derived, so a template setting a bare `auth-prod.ahc.com` — no
project-id path — matches neither form, and every token is rejected with a 401 that
looks exactly like an expired session. Decode a real token and compare its `iss` against
`{BaseUrl}/{ProjectId}`. If they differ, the issuer list needs to become directly
configurable; it is derived today.

## Versioning

Standard SemVer with one addition: **tightening validation is a major bump.** Trimming
`ValidAlgorithms`, pinning an audience or requiring a new claim does not change the API
surface, but it breaks at runtime, in production, on somebody else's service. A minor
bump invites an automatic update that takes them down.

## The gap to close before ownership works on real data

A Descope `sub` is the Descope user id, not the member id in your database. If the member
record's `DescopeUserId` is not populated, `IMemberIdentityResolver` has nothing to
resolve against and every ownership check denies. Close it either by populating
`DescopeUserId` during registration and resolving by that column (sturdier — survives an
email change), or by adding an `email` claim via a Descope JWT Template and resolving by
email.

A resolver that cannot answer must return `null`. Never fall back to treating the `sub`
as the member id: that lets every unrecognised caller name their own identity.

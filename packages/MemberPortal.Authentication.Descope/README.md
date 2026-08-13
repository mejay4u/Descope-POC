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

## What each method does, and where it belongs

| Method | Who calls it |
| --- | --- |
| `AddDescopeJwtBearer(configuration)` | every service accepting a member token |
| `AddDescopeMemberOwnership()` | **front doors only** — needs an `IMemberIdentityResolver` |
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

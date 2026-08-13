# Shared packages

Two packages, published to Nexus, consumed by the BFF and every downstream service.

```
packages/
├── MemberPortal.Authentication.Descope.Abstractions/   ICallerIdentity, IMemberIdentityResolver
│                                                       zero dependencies
└── MemberPortal.Authentication.Descope/                the ASP.NET Core implementation
    ├── Authentication/   AddDescopeJwtBearer, options, validator, ProblemDetails events
    ├── Authorization/    AddDescopeMemberOwnership, the ownership policy
    └── Http/             AddMemberTokenForwarding for a front door's typed clients
```

Both multi-target `net8.0;net10.0`, so services on either framework can consume them and
the slowest repo does not set the pace.

## Where things go

Descope issues the session JWT → the app sends it to the BFF → the BFF forwards it
downstream **unaltered** → each service validates it for itself. The same token string
travels the whole way; nothing translates it.

| Repo | What it takes |
| --- | --- |
| **BFF** | `AddDescopeJwtBearer()` · `AddDescopeMemberOwnership()` · your `IMemberIdentityResolver` · `.AddMemberTokenForwarding()` per downstream client |
| **`memberidcard` and the other downstream services** | `AddDescopeJwtBearer()` · `.RequireAuthorization()` on member-facing route groups |
| **BFA** (registration + login) | **nothing** — it is on the issuing side of this boundary, and its `X-Connector-Key` scheme stays exactly as it is |
| Workers, jobs, anything with no HTTP surface | nothing |

One package in both places. The difference between a front door and a downstream service
is which methods it calls, not which package or which token.

## Building and publishing

```bash
# from the repo root
dotnet build packages/MemberPortal.Authentication.Descope          # builds both TFMs
dotnet test  pilot-api/                                           # exercises this code

dotnet pack packages/MemberPortal.Authentication.Descope.Abstractions -c Release -p:Version=0.1.0
dotnet pack packages/MemberPortal.Authentication.Descope           -c Release -p:Version=0.1.0

dotnet nuget push "packages/**/bin/Release/*.nupkg" -s nexus -k "$NEXUS_API_KEY"
```

Push the abstractions package first — the main one depends on it, and a restore against a
feed that has only half the pair fails in a way that reads like a network problem.

Each consuming repo needs a `nuget.config` naming the Nexus source. Credentials come from
CI environment variables, never a checked-in `<packageSourceCredentials>`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <clear />
    <add key="nuget.org" value="https://api.nuget.org/v3/index.json" />
    <add key="nexus" value="https://nexus.example.com/repository/nuget-hosted/index.json" />
  </packageSources>
</configuration>
```

## Versioning

SemVer, with one house rule worth agreeing before the first release: **tightening
validation is a major bump.** Trimming `ValidAlgorithms`, pinning an audience or
requiring a new claim leaves the API surface identical, so it looks like a patch — but it
breaks at runtime, in production, on somebody else's service. A minor bump invites an
automatic update that takes them down.

## Verify before you trust it

This has never been compiled — there is no .NET SDK in the environment it was written in.
Build both target frameworks first, then run `dotnet test pilot-api/`: the pilot's 13
tests now run against this code and cover expired tokens, a wrong signing key, a wrong
issuer, HMAC algorithm confusion, 403-not-404 on another member's record, and the
startup-validation failures.

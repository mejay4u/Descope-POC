# MemberPortal.Authentication.Descope.Abstractions

Two interfaces, no dependencies.

- **`ICallerIdentity`** — who is making the current request (`SubjectId`, `IsAuthenticated`),
  with no reference to `HttpContext` or `ClaimsPrincipal`.
- **`IMemberIdentityResolver`** — turns a Descope `sub` into a member id in your system.

Reference this from an application or domain layer that wants to know who is calling
without taking a dependency on ASP.NET Core. Web projects should reference
**`MemberPortal.Authentication.Descope`** instead — it includes this one and provides the
implementations.

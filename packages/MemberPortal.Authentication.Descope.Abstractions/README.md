# MemberPortal.Authentication.Descope.Abstractions

Three interfaces, no dependencies.

- **`ICallerIdentity`** — who is making the current request (`SubjectId`, `SubscriberId`,
  `PlanInformation`, `IsAuthenticated`), with no reference to `HttpContext` or
  `ClaimsPrincipal`.
- **`IMemberScopedRequest`** — a request body that names the member context it acts in,
  so a service can refuse a body contradicting the token.
- **`IMemberIdentityResolver`** — turns a Descope `sub` into a member id in your system.

The line between the first and the last is worth keeping: `ICallerIdentity` reads what the
token **asserts**, which cannot fail; `IMemberIdentityResolver` performs a **lookup**,
which can. Claims go on the former, queries behind the latter.

Reference this from an application or domain layer that wants to know who is calling
without taking a dependency on ASP.NET Core. Web projects should reference
**`MemberPortal.Authentication.Descope`** instead — it includes this one and provides the
implementations.

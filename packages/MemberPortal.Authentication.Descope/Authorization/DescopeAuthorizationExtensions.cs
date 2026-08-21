using Microsoft.AspNetCore.Authorization;
using MemberPortal.Authentication.Descope;

namespace Microsoft.Extensions.DependencyInjection;

/// <summary>
/// Opt-in authorization behaviour. Neither method is implied by
/// <c>AddDescopeJwtBearer</c>, because neither belongs in every service.
/// </summary>
public static class DescopeAuthorizationExtensions
{
    /// <summary>
    /// Registers the member-ownership policy and its handler. <b>Front doors only —
    /// the BFF.</b>
    /// </summary>
    /// <remarks>
    /// <para>
    /// Ownership is answered where the Descope subject is resolved to a member, and
    /// that resolution needs the member mapping. Calling this in a downstream service
    /// therefore means giving that service access to the member database — which,
    /// multiplied across a dozen services, is the coupling the enriched token exists to
    /// remove. Downstream services take <c>AddDescopeJwtBearer</c> and stop there: they
    /// still validate the signature, issuer, algorithm and lifetime for themselves.
    /// </para>
    /// <para>
    /// Requires an <see cref="IMemberIdentityResolver"/> registration, checked at
    /// startup rather than at request time. A policy whose handler cannot be
    /// constructed denies every request, and "everything returns 403" is diagnosed as a
    /// broken token long before anyone suspects a missing registration.
    /// </para>
    /// </remarks>
    public static IServiceCollection AddDescopeMemberOwnership(this IServiceCollection services)
    {
        services.AddAuthorization(options =>
        {
            options.AddPolicy(DescopePolicies.MemberOwnsResource, policy =>
            {
                policy.RequireAuthenticatedUser();
                policy.AddRequirements(
                    new MemberOwnsResourceRequirement(DescopePolicies.MemberIdRouteValue));
            });
        });

        // Scoped, not singleton. The handler depends on IMemberIdentityResolver, which
        // in a real front door holds a DbContext. A singleton works in a test with an
        // in-memory resolver and then captures a disposed DbContext in production.
        services.AddScoped<IAuthorizationHandler, MemberOwnsResourceHandler>();

        services.AddHostedService<MemberIdentityResolverPresenceCheck>();

        return services;
    }

    /// <summary>
    /// Registers the claims/payload cross-check, for a service that receives member
    /// context in a request body. <b>No service does today</b> — see the remarks.
    /// </summary>
    /// <remarks>
    /// <para>
    /// In the current design member context never travels in a body. Clients send only
    /// the token; the BFF reads the claims and builds the downstream request body from
    /// them, forwarding the same token unchanged so the downstream service can validate
    /// it for itself.
    /// Nothing therefore has two copies of the member context to compare, and calling
    /// this method changes nothing about how any existing endpoint behaves.
    /// </para>
    /// <para>
    /// It is here for the endpoint that does eventually accept a subscriber or plan in
    /// a payload. At that point body and token can disagree while signature, issuer,
    /// audience and expiry all pass, and this is the only check that notices.
    /// </para>
    /// <para>
    /// Unlike <see cref="AddDescopeMemberOwnership"/> it needs no member database and
    /// no resolver — it compares two values that both arrived with the request — so it
    /// is safe in a downstream service as well as a front door.
    /// </para>
    /// <para>
    /// Registering the policy does not apply it. The endpoint asks for it once it has
    /// the deserialised body — see <see cref="ClaimsMatchPayloadRequirement"/> for the
    /// two lines that does, and why it cannot be attached to the route instead.
    /// </para>
    /// </remarks>
    public static IServiceCollection AddDescopeClaimsPayloadCheck(this IServiceCollection services)
    {
        services.AddAuthorization(options =>
        {
            options.AddPolicy(DescopePolicies.ClaimsMatchPayload, policy =>
            {
                policy.RequireAuthenticatedUser();
                policy.AddRequirements(new ClaimsMatchPayloadRequirement());
            });
        });

        // Scoped because ICallerIdentity is: it reads the principal off the current
        // HttpContext, and a singleton holding it would answer every request with
        // whoever happened to arrive first.
        services.AddScoped<IAuthorizationHandler, ClaimsMatchPayloadHandler>();

        return services;
    }

    /// <summary>
    /// Requires an authenticated user on every endpoint that does not opt out with
    /// <c>AllowAnonymous</c>. Opt-in, and a breaking change for an existing service.
    /// </summary>
    /// <remarks>
    /// The right default for a new service — the framework's own default is anonymous
    /// unless you remember otherwise, and "remember otherwise" is not a security
    /// control. It is <b>not</b> applied by <c>AddDescopeJwtBearer</c>, because as a
    /// package default it would land in every consuming repo at once and 401 every
    /// endpoint nobody had marked anonymous. Before turning it on, find the endpoints
    /// that legitimately carry no member token: health and readiness probes, metrics,
    /// and anything called server-to-server on a shared-secret header — the Descope
    /// registration connectors authenticate that way and carry no member token at all.
    /// </remarks>
    public static IServiceCollection RequireAuthenticatedUserByDefault(this IServiceCollection services)
    {
        services.AddAuthorization(options =>
        {
            options.FallbackPolicy = new AuthorizationPolicyBuilder()
                .RequireAuthenticatedUser()
                .Build();
        });

        return services;
    }
}

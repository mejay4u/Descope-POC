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

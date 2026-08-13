using Microsoft.AspNetCore.Authorization;
using PilotApi.Application.Abstractions;

namespace PilotApi.Api.Authorization;

/// <summary>
/// Policy names and their registration.
/// </summary>
/// <remarks>
/// <para>
/// Split into two opt-in methods rather than one, because the two belong in
/// different places once this is a shared package across a dozen services:
/// </para>
/// <list type="bullet">
///   <item><description>
///     <see cref="AddDescopeMemberOwnership"/> goes on the <b>front door</b> — the BFF
///     — which is where the Descope subject is resolved to a member and where "is this
///     member allowed to see this record" is answered. Downstream services do not take
///     it, because doing so would put a member-database lookup in every one of them.
///   </description></item>
///   <item><description>
///     <see cref="RequireAuthenticatedUserByDefault"/> is separate and opt-in because
///     it is a <b>breaking change for an existing service</b>. Bundled into a package
///     it would land in every repo at once and 401 every endpoint nobody remembered to
///     mark anonymous — health probes, metrics, and the Descope connector endpoints
///     that authenticate with <c>X-Connector-Key</c> and carry no member token at all.
///   </description></item>
/// </list>
/// <para>
/// Policy names are constants rather than string literals sprinkled through the
/// endpoint files because a typo in a policy name does not fail the build and does not
/// fail at startup — it fails at request time, on the one endpoint nobody exercised
/// before release.
/// </para>
/// </remarks>
public static class AuthorizationPolicies
{
    /// <summary>
    /// Requires that the authenticated caller is the member named in the route.
    /// </summary>
    public const string MemberOwnsResource = "MemberOwnsResource";

    /// <summary>Route value the ownership policy compares against.</summary>
    public const string MemberIdRouteValue = "memberId";

    /// <summary>
    /// Registers the member-ownership policy and its handler. <b>Front doors only.</b>
    /// </summary>
    /// <remarks>
    /// Requires an <see cref="IMemberIdentityResolver"/> to be registered. That is
    /// checked at startup rather than at request time — see
    /// <see cref="MemberIdentityResolverPresenceCheck"/> — because a policy whose
    /// handler cannot be constructed denies every request, and "everything returns 403"
    /// is diagnosed as a broken token long before anyone suspects a missing
    /// registration.
    /// </remarks>
    public static IServiceCollection AddDescopeMemberOwnership(this IServiceCollection services)
    {
        services.AddAuthorization(options =>
        {
            options.AddPolicy(MemberOwnsResource, policy =>
            {
                policy.RequireAuthenticatedUser();
                policy.AddRequirements(new MemberOwnsResourceRequirement(MemberIdRouteValue));
            });
        });

        // Scoped, not singleton. The handler depends on IMemberIdentityResolver, which
        // in a real front door holds a DbContext. Registering the handler as a
        // singleton works with the in-memory stub and then captures a disposed
        // DbContext the day someone swaps in the real one.
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
    /// control. Before turning it on in an existing service, find the endpoints that
    /// legitimately have no member token: health and readiness probes, metrics, and
    /// <c>POST /api/initiateRegistration</c> and <c>POST /api/registration/password</c>,
    /// which Descope's flow engine calls server-to-server with <c>X-Connector-Key</c>
    /// (see docs/dotnet-registration-api.md). Requiring an authenticated user on those
    /// breaks registration entirely.
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

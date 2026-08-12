using Microsoft.AspNetCore.Authorization;

namespace PilotApi.Api.Authorization;

/// <summary>
/// Policy names and their registration.
/// </summary>
/// <remarks>
/// Policy names are constants rather than string literals sprinkled through the
/// endpoint files because a typo in a policy name does not fail the build and
/// does not fail at startup — it fails at request time with a 500, or worse, on
/// the one endpoint nobody exercised before release.
/// </remarks>
public static class AuthorizationPolicies
{
    /// <summary>
    /// Requires that the authenticated caller is the member named in the route.
    /// </summary>
    public const string MemberOwnsResource = "MemberOwnsResource";

    /// <summary>Route value the ownership policy compares against.</summary>
    public const string MemberIdRouteValue = "memberId";

    /// <summary>Registers the authorization policies and their handlers.</summary>
    public static IServiceCollection AddPilotAuthorization(this IServiceCollection services)
    {
        services.AddAuthorization(options =>
        {
            // Every endpoint requires an authenticated caller unless it opts out
            // with AllowAnonymous. The default the framework ships with is the
            // opposite — anonymous unless you remember otherwise — and "remember
            // otherwise" is not a security control.
            options.FallbackPolicy = new AuthorizationPolicyBuilder()
                .RequireAuthenticatedUser()
                .Build();

            options.AddPolicy(MemberOwnsResource, policy =>
            {
                policy.RequireAuthenticatedUser();
                policy.AddRequirements(new MemberOwnsResourceRequirement(MemberIdRouteValue));
            });
        });

        // Scoped, not singleton. The handler depends on IMemberIdentityResolver,
        // which in the real API will hold a DbContext. Registering the handler as
        // a singleton works with the in-memory stub and then captures a disposed
        // DbContext the day someone swaps in the real one.
        services.AddScoped<IAuthorizationHandler, MemberOwnsResourceHandler>();

        return services;
    }
}

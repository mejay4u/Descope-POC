namespace MemberPortal.Authentication.Descope;

/// <summary>
/// Policy and route-value names used by this package.
/// </summary>
/// <remarks>
/// Constants rather than string literals in each service, because a typo in a policy
/// name does not fail the build and does not fail at startup — it fails at request
/// time, on the one endpoint nobody exercised before release. Across a dozen services
/// that is a matter of when, not whether.
/// </remarks>
public static class DescopePolicies
{
    /// <summary>
    /// Requires that the authenticated caller is the member named in the route.
    /// Registered by <c>AddDescopeMemberOwnership()</c>; front doors only.
    /// </summary>
    public const string MemberOwnsResource = "MemberOwnsResource";

    /// <summary>Route value the ownership policy compares the caller's member id against.</summary>
    public const string MemberIdRouteValue = "memberId";
}

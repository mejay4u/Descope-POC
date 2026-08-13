using Microsoft.AspNetCore.Authorization;

namespace MemberPortal.Authentication.Descope;

/// <summary>
/// Requires that the authenticated caller is the member identified by a route
/// value.
/// </summary>
/// <remarks>
/// The route value name is carried on the requirement rather than hardcoded in
/// the handler, so the same policy can guard <c>/{memberId}</c> today and
/// <c>/members/{id}/idcard</c> tomorrow without a second handler.
/// </remarks>
public sealed class MemberOwnsResourceRequirement : IAuthorizationRequirement
{
    public MemberOwnsResourceRequirement(string routeValueName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(routeValueName);
        RouteValueName = routeValueName;
    }

    /// <summary>Name of the route value holding the member id being requested.</summary>
    public string RouteValueName { get; }
}

using System.Security.Claims;
using Microsoft.AspNetCore.Http;

namespace MemberPortal.Authentication.Descope;

/// <summary>
/// Reads the caller out of the validated token on the current request.
/// </summary>
/// <remarks>
/// <para>
/// This is the only adapter between ASP.NET's <see cref="ClaimsPrincipal"/> and
/// the rest of the application, which is what keeps Descope-shaped claim names
/// from spreading through the codebase. If Descope's token shape changes, or the
/// API later switches to validating our own enriched token, this file changes and
/// nothing else does.
/// </para>
/// <para>
/// The <c>sub</c> lookup has a fallback to
/// <see cref="ClaimTypes.NameIdentifier"/>, and the reason is worth knowing before
/// you copy this: ASP.NET Core rewrites well-known JWT claim names into long
/// SOAP-era URIs unless <c>MapInboundClaims</c> is set to false. This sample sets
/// it to false (see DescopeAuthenticationExtensions), so <c>sub</c> arrives as
/// <c>sub</c>. The fallback exists because the real API may have another JWT
/// scheme already registered with the default mapping still on, and a subject
/// lookup that silently returns null is an authorization bug that looks like a
/// data bug.
/// </para>
/// </remarks>
public sealed class CallerIdentity : ICallerIdentity
{
    /// <summary>The JWT subject claim, unmapped.</summary>
    public const string SubjectClaimType = "sub";

    /// <summary>
    /// Accepted spellings of the subscriber claim, in preference order.
    /// </summary>
    /// <remarks>
    /// More than one name, and the lookup is case-insensitive, because this claim's
    /// spelling is decided in the Descope JWT template rather than here — and the
    /// sequence diagram writes it <c>SubscriberID</c> while the mobile app's own
    /// decoder reads <c>subscriberId</c>. An exact-match lookup would return null for
    /// the other one, and a null subscriber claim does not fail loudly: it makes the
    /// cross-check in <see cref="ClaimsMatchPayloadHandler"/> unable to verify
    /// anything, which is the failure mode least likely to be noticed.
    /// </remarks>
    private static readonly string[] SubscriberClaimTypes =
        ["SubscriberID", "subscriberId", "subscriber_id"];

    /// <summary>Accepted spellings of the plan claim, in preference order.</summary>
    private static readonly string[] PlanClaimTypes =
        ["PlanInformation", "planInformation", "plan_information", "plan"];

    private readonly IHttpContextAccessor _httpContextAccessor;

    public CallerIdentity(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    private ClaimsPrincipal? Principal => _httpContextAccessor.HttpContext?.User;

    public bool IsAuthenticated => Principal?.Identity?.IsAuthenticated ?? false;

    public string? SubjectId =>
        Principal?.FindFirst(SubjectClaimType)?.Value
        ?? Principal?.FindFirst(ClaimTypes.NameIdentifier)?.Value;

    public string? SubscriberId => FindFirstOf(SubscriberClaimTypes);

    public string? PlanInformation => FindFirstOf(PlanClaimTypes);

    /// <summary>
    /// First non-empty claim matching any of <paramref name="claimTypes"/>, compared
    /// without regard to case. Returns null rather than an empty string so callers can
    /// treat "absent" and "blank" identically — a blank subscriber claim is no more
    /// verifiable than a missing one.
    /// </summary>
    private string? FindFirstOf(string[] claimTypes)
    {
        var principal = Principal;
        if (principal is null)
        {
            return null;
        }

        foreach (var claimType in claimTypes)
        {
            foreach (var claim in principal.Claims)
            {
                if (string.Equals(claim.Type, claimType, StringComparison.OrdinalIgnoreCase) &&
                    !string.IsNullOrWhiteSpace(claim.Value))
                {
                    return claim.Value;
                }
            }
        }

        return null;
    }
}

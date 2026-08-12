using System.Security.Claims;
using PilotApi.Application.Abstractions;

namespace PilotApi.Api.Authentication;

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
}

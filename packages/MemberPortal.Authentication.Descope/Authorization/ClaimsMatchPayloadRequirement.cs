using Microsoft.AspNetCore.Authorization;

namespace MemberPortal.Authentication.Descope;

/// <summary>
/// Requires that the member context named in the request body matches the member
/// context asserted by the token.
/// </summary>
/// <remarks>
/// <para>
/// This is a <b>resource-based</b> requirement: it is evaluated against the
/// deserialised request model, so it cannot be attached to a route with
/// <c>RequireAuthorization</c> the way an ordinary policy can. The endpoint asks for
/// it explicitly once it has the body:
/// </para>
/// <code>
/// var check = await authorization.AuthorizeAsync(
///     httpContext.User, request, DescopePolicies.ClaimsMatchPayload);
///
/// if (!check.Succeeded)
/// {
///     return DescopeAuthorizationResults.ClaimsMismatch();
/// }
/// </code>
/// <para>
/// It has to work this way round. Authorization middleware runs before model
/// binding, so at the point a route-attached policy is evaluated the body is still
/// an unread stream — and buffering it there to peek inside means paying for it on
/// every request, including the ones that never needed the check.
/// </para>
/// </remarks>
public sealed class ClaimsMatchPayloadRequirement : IAuthorizationRequirement
{
}

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;

namespace MemberPortal.Authentication.Descope;

/// <summary>
/// Grants <see cref="MemberOwnsResourceRequirement"/> when the token's subject
/// resolves to the member id in the route.
/// </summary>
/// <remarks>
/// <para>
/// <b>Why this is a policy and not an <c>if</c> inside the endpoint.</b> Both
/// work. The difference shows up on the fourth endpoint: an inline check is
/// invisible when it is missing — the handler simply reads a member id and
/// returns data, and nothing about the code looks wrong. A policy is declared on
/// the route, so its absence is visible on the line that maps the endpoint, which
/// is the line a reviewer actually reads. Authorization bugs are overwhelmingly
/// omissions rather than mistakes, so the pattern that makes omissions loud is
/// the one worth paying for.
/// </para>
/// <para>
/// <b>It fails closed.</b> Every path that cannot establish ownership simply
/// returns without calling <see cref="AuthorizationHandlerContext.Succeed"/>,
/// which denies. There is deliberately no
/// <see cref="AuthorizationHandlerContext.Fail()"/> call and no early "allow if we
/// cannot tell" branch: a handler that grants when it is confused is worse than
/// no handler, because the endpoint now looks protected.
/// </para>
/// <para>
/// <b>The comparison is ordinal.</b> Member ids are opaque identifiers, not text
/// in a language. A culture-aware or case-insensitive comparison on an identifier
/// is how <c>member-alice</c> and <c>MEMBER-ALICE</c> end up being the same person
/// on one machine and not another.
/// </para>
/// <para>
/// Note the result of a denial: a <b>403</b>, not a 404. Hiding the resource
/// behind a 404 is defensible when the id space is guessable and enumeration is
/// the threat, but it also makes "you asked for someone else's card" and "this
/// card does not exist" indistinguishable in the logs and to the app, which have
/// to do different things about them.
/// </para>
/// </remarks>
internal sealed class MemberOwnsResourceHandler : AuthorizationHandler<MemberOwnsResourceRequirement>
{
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly ICallerIdentity _caller;
    private readonly IMemberIdentityResolver _memberIdentityResolver;

    public MemberOwnsResourceHandler(
        IHttpContextAccessor httpContextAccessor,
        ICallerIdentity caller,
        IMemberIdentityResolver memberIdentityResolver)
    {
        _httpContextAccessor = httpContextAccessor;
        _caller = caller;
        _memberIdentityResolver = memberIdentityResolver;
    }

    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        MemberOwnsResourceRequirement requirement)
    {
        var httpContext = _httpContextAccessor.HttpContext;
        if (httpContext is null)
        {
            return;
        }

        if (!_caller.IsAuthenticated || string.IsNullOrEmpty(_caller.SubjectId))
        {
            return;
        }

        if (!httpContext.Request.RouteValues.TryGetValue(requirement.RouteValueName, out var routeValue) ||
            routeValue is not string requestedMemberId ||
            string.IsNullOrWhiteSpace(requestedMemberId))
        {
            return;
        }

        var callerMemberId = await _memberIdentityResolver
            .ResolveMemberIdAsync(_caller.SubjectId, httpContext.RequestAborted)
            .ConfigureAwait(false);

        if (callerMemberId is not null &&
            string.Equals(callerMemberId, requestedMemberId, StringComparison.Ordinal))
        {
            context.Succeed(requirement);
        }
    }
}

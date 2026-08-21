using Microsoft.AspNetCore.Authorization;

namespace MemberPortal.Authentication.Descope;

/// <summary>
/// Grants <see cref="ClaimsMatchPayloadRequirement"/> when every member-context value
/// the request body supplies agrees with the same value in the validated token.
/// </summary>
/// <remarks>
/// <para>
/// <b>Nothing in the current design calls this.</b> Worth stating plainly so nobody
/// goes looking for the caller. Clients send no member context — the token carries
/// it. The BFF reads the claims and builds the downstream request body from them,
/// and forwards the same token unchanged so the downstream service can validate it
/// for itself — not so it can compare the two. Every hop's member context therefore comes from a
/// token, and a token is checked by validating it, not by diffing it against a body.
/// </para>
/// <para>
/// It exists for the shape that design does not currently have: a service that
/// receives member context <i>in a request body</i> and holds a validated token for
/// the same request. Then the two can disagree, and the disagreement is invisible to
/// signature, issuer, audience and expiry — all of which pass. Should an endpoint
/// ever accept a subscriber in a payload, this is the check it needs; until then the
/// policy is registered only if a service asks for it with
/// <c>AddDescopeClaimsPayloadCheck()</c>.
/// </para>
/// <para>
/// <b>It fails closed, and it fails loudly.</b> Unlike
/// <see cref="MemberOwnsResourceHandler"/>, which denies by simply not succeeding,
/// this one calls <see cref="AuthorizationHandlerContext.Fail(AuthorizationFailureReason)"/>
/// with a marker, so no other handler can grant a request whose body contradicted
/// its token. The marker is what lets the response say which kind of failure it was;
/// see <see cref="DescopeAuthorizationResults"/>.
/// </para>
/// <para>
/// <b>Comparison is ordinal.</b> These are identifiers, not prose. A
/// case-insensitive compare would let <c>SUB-1001</c> pass as <c>sub-1001</c>, which
/// is exactly the near-miss this exists to notice.
/// </para>
/// <para>
/// <b>A token that asserts nothing cannot vouch for anything.</b> If the body names
/// a subscriber and the token carries no subscriber claim, that is a denial, not a
/// pass — the usual cause being a JWT template that never projected the claim.
/// </para>
/// <para>
/// <b>No resource, no grant.</b> Requesting this policy without passing the request
/// model means the handler never runs and the requirement is never satisfied.
/// Forgetting to pass the body fails closed.
/// </para>
/// </remarks>
internal sealed class ClaimsMatchPayloadHandler
    : AuthorizationHandler<ClaimsMatchPayloadRequirement, IMemberScopedRequest>
{
    private readonly ICallerIdentity _caller;

    public ClaimsMatchPayloadHandler(ICallerIdentity caller)
    {
        _caller = caller;
    }

    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        ClaimsMatchPayloadRequirement requirement,
        IMemberScopedRequest resource)
    {
        if (!_caller.IsAuthenticated)
        {
            context.Fail(Reason());
            return Task.CompletedTask;
        }

        if (!Matches(resource.SubscriberId, _caller.SubscriberId) ||
            !Matches(resource.PlanInformation, _caller.PlanInformation))
        {
            context.Fail(Reason());
            return Task.CompletedTask;
        }

        context.Succeed(requirement);
        return Task.CompletedTask;
    }

    /// <summary>
    /// True when the payload does not contradict the token. A payload value that was
    /// not supplied cannot contradict anything and passes; a supplied one must match a
    /// claim that exists.
    /// </summary>
    private static bool Matches(string? fromPayload, string? fromToken)
    {
        if (string.IsNullOrWhiteSpace(fromPayload))
        {
            return true;
        }

        return !string.IsNullOrWhiteSpace(fromToken) &&
            string.Equals(fromPayload, fromToken, StringComparison.Ordinal);
    }

    private AuthorizationFailureReason Reason() =>
        new(this, ClaimsMismatchProblem.FailureReason);
}

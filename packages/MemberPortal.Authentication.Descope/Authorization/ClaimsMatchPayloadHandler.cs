using Microsoft.AspNetCore.Authorization;

namespace MemberPortal.Authentication.Descope;

/// <summary>
/// Grants <see cref="ClaimsMatchPayloadRequirement"/> when every member-context value
/// the request body supplies agrees with the same value in the validated token.
/// </summary>
/// <remarks>
/// <para>
/// <b>What this catches that token validation cannot.</b> The mobile app caches its
/// member context after login and sends it in the body when requesting a profile or
/// plan details. If that body names a different subscriber than the token's claims,
/// every signature check still passes — the token really is the caller's. The
/// tampering is in the payload, which nothing upstream inspects: the gateway
/// validates the token and forwards the body untouched.
/// </para>
/// <para>
/// So the comparison has to happen where both halves are in one place — the service
/// holding the deserialised body and the validated principal. That is this handler,
/// and it is the whole content of step 16 of the BFF Validation sequence.
/// </para>
/// <para>
/// <b>It fails closed, and it fails loudly.</b> Unlike
/// <see cref="MemberOwnsResourceHandler"/>, which denies by simply not succeeding,
/// this one calls <see cref="AuthorizationHandlerContext.Fail(AuthorizationFailureReason)"/>
/// with a marker. A mismatch is evidence of tampering rather than an ordinary "not
/// allowed", so no later handler should be able to grant the request —
/// <c>Fail</c> is what makes a denial final. The marker is what lets the response be
/// a 401 rather than a 403; see <see cref="DescopeAuthorizationResults"/>.
/// </para>
/// <para>
/// <b>Comparison is ordinal.</b> These are identifiers, not prose. A
/// case-insensitive compare would let <c>SUB-1001</c> pass as <c>sub-1001</c>, which
/// is exactly the near-miss this exists to refuse.
/// </para>
/// <para>
/// <b>A token that asserts nothing cannot vouch for anything.</b> If the body names
/// a subscriber and the token carries no subscriber claim, that is a denial, not a
/// pass — the usual cause being a JWT template that never projected the claim, in
/// which case every request is unverifiable and the service should say so rather
/// than wave them all through.
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

using Microsoft.AspNetCore.Authorization;

namespace MemberPortal.Authentication.Descope;

/// <summary>
/// Grants <see cref="ClaimsMatchPayloadRequirement"/> when every member-context value
/// the request body supplies agrees with the same value in the validated token.
/// </summary>
/// <remarks>
/// <para>
/// <b>What this catches that token validation cannot.</b> Signature, issuer, audience
/// and expiry all pass for a token that genuinely belongs to the caller. If that
/// caller then sends a body naming someone else's subscriber, nothing upstream
/// objects — the gateway validated the token and forwarded the body untouched. The
/// contradiction is only visible here, holding both halves at once.
/// </para>
/// <para>
/// <b>It fails closed, and it fails loudly.</b> Unlike
/// <see cref="MemberOwnsResourceHandler"/>, which denies by simply not succeeding,
/// this one calls <see cref="AuthorizationHandlerContext.Fail(AuthorizationFailureReason)"/>
/// with a marker. Two reasons. A mismatch is evidence of tampering rather than an
/// ordinary "not allowed", so no other handler should be able to grant the request
/// afterwards — and <c>Fail</c> is what makes a denial final. And the marker is what
/// lets the response be a 401 rather than a 403; see
/// <see cref="DescopeAuthorizationResults"/>.
/// </para>
/// <para>
/// <b>Comparison is ordinal.</b> These are identifiers, not prose. A case-insensitive
/// compare here would let <c>SUB-1001</c> pass as <c>sub-1001</c>, which is exactly
/// the sort of near-miss a tampering check exists to refuse.
/// </para>
/// <para>
/// <b>A token that asserts nothing cannot vouch for anything.</b> If the body names a
/// subscriber and the token carries no subscriber claim, that is a denial, not a
/// pass. The usual cause is a JWT template that was never updated to project the
/// claim — in which case every request is unverifiable and the service should say so
/// rather than wave them all through.
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

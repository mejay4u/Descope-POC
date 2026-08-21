namespace MemberPortal.Authentication.Descope;

/// <summary>
/// A request body that names the member context it acts in, so the service
/// receiving it can check that context against the token that came with it.
/// </summary>
/// <remarks>
/// <para>
/// <b>Unused by the current design, and deliberately so.</b> Clients send no member
/// context — the token carries it. The BFF reads the claims and generates the
/// downstream body from them, and the token travels alongside so the downstream
/// service can validate it for itself. Member context therefore always arrives as a
/// claim, and claims are checked by validating the token.
/// </para>
/// <para>
/// This interface is for the shape that design does not have today: a service handed
/// member context <i>in a body</i> while holding a validated token for the same
/// request. Those two can disagree, and nothing about signature, issuer, audience or
/// expiry would notice. A request model implements this, and the endpoint asks
/// <see cref="ClaimsMatchPayloadRequirement"/> to compare them.
/// </para>
/// <para>
/// <b>Null means "not supplied", and that passes.</b> A body naming no subscriber
/// cannot contradict the token — read the value from the claim instead. If an
/// endpoint requires the field, that is its model's job, and model binding reports a
/// missing field far better than an authorization failure can.
/// </para>
/// </remarks>
public interface IMemberScopedRequest
{
    /// <summary>Subscriber id named by the request body, or null if it names none.</summary>
    string? SubscriberId { get; }

    /// <summary>Plan information named by the request body, or null if it names none.</summary>
    string? PlanInformation { get; }
}

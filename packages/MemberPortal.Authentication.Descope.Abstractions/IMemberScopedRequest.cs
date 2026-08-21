namespace MemberPortal.Authentication.Descope;

/// <summary>
/// A request body that names the member context it acts in, so the service
/// receiving it can check that context against the token that came with it.
/// </summary>
/// <remarks>
/// <para>
/// The mobile app caches its member context after login and sends it back in the
/// body when it asks for a profile or plan details. The same values are also claims
/// in the token it presents. Two copies, one from a client and one signed by the
/// identity provider — and the whole point of holding both is that only one of them
/// is trustworthy.
/// </para>
/// <para>
/// <b>The threat is IDOR.</b> A signed-in member alters the cached mapping and asks
/// for someone else's subscriber. The token is genuinely theirs, so signature,
/// issuer, audience and expiry all pass; the gateway validates it and forwards the
/// body untouched. Nothing upstream is looking at the body. The contradiction is
/// only visible in the service that deserialised it while holding the validated
/// principal, which is where this check runs.
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

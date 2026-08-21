namespace MemberPortal.Authentication.Descope;

/// <summary>
/// A request body that names the member context it expects to act in, so the
/// service can check that context against the token before acting on it.
/// </summary>
/// <remarks>
/// <para>
/// The threat this exists for is IDOR: a signed-in member sends a valid token and
/// a body naming <i>someone else's</i> subscriber. Every signature check passes,
/// because the token really is theirs — the tampering is in the payload, which no
/// amount of token validation looks at. The gateway cannot catch it either; it
/// validates the token and forwards the body untouched.
/// </para>
/// <para>
/// So the check has to happen where both halves are in one place: the service that
/// deserialised the body and holds the validated principal. A request model
/// implements this interface, the endpoint asks the authorization service to
/// compare the two, and a mismatch is refused before any downstream call is made.
/// </para>
/// <para>
/// <b>Null means "not supplied", and that passes.</b> A body that names no
/// subscriber cannot contradict the token, so there is nothing to catch — the
/// service should read the value from the claim instead. If an endpoint requires
/// the field, that is its model's job to enforce, and model binding reports it far
/// better than an authorization failure can.
/// </para>
/// </remarks>
public interface IMemberScopedRequest
{
    /// <summary>Subscriber id named by the request body, or null if it names none.</summary>
    string? SubscriberId { get; }

    /// <summary>Plan information named by the request body, or null if it names none.</summary>
    string? PlanInformation { get; }
}

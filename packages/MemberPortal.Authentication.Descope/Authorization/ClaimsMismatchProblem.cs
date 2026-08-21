namespace MemberPortal.Authentication.Descope;

/// <summary>
/// Shared vocabulary for a claims/payload mismatch, so the handler that detects one
/// and the response that reports it cannot drift apart.
/// </summary>
internal static class ClaimsMismatchProblem
{
    /// <summary>
    /// Marker put on the authorization failure so a mismatch can be told apart from
    /// an ordinary denial further up the stack.
    /// </summary>
    internal const string FailureReason = "descope.claims_payload_mismatch";

    /// <summary>Title of the problem response.</summary>
    internal const string Title = "Unauthorized";

    /// <summary>
    /// What the member is told. Deliberately the same sentence an expired token
    /// produces: the two are indistinguishable to the person holding the phone, and
    /// both have the same remedy. Saying "the subscriber in your request did not
    /// match your token" would tell an attacker probing for IDOR exactly which of
    /// their two values the service objected to.
    /// </summary>
    internal const string Detail =
        "Your session has expired or is not valid. Please sign in again.";
}

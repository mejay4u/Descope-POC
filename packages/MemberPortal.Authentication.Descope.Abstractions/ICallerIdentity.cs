namespace MemberPortal.Authentication.Descope;

/// <summary>
/// Who is making the current request, expressed without any reference to HTTP.
/// </summary>
/// <remarks>
/// <para>
/// The Application layer needs to know who is calling, but giving it
/// <c>ClaimsPrincipal</c> or <c>IHttpContextAccessor</c> would drag ASP.NET —
/// and, one refactor later, Descope-shaped claim names — into business logic.
/// This interface is the seam. The API layer implements it from the validated
/// token (see CallerIdentity.cs in this package); a test implements
/// it with two literal strings.
/// </para>
/// <para>
/// The line it draws is between <b>what the token asserts</b> and <b>what has to be
/// looked up</b>. Claims the identity provider signed into the token are readable
/// here, because reading them cannot fail and cannot be wrong. Anything that needs
/// a query to answer — "which member row is this", "is this plan still active" —
/// belongs behind <see cref="IMemberIdentityResolver"/>, where it can fail visibly
/// rather than in a property getter where it cannot.
/// </para>
/// </remarks>
public interface ICallerIdentity
{
    /// <summary>True when the request carried a token that passed validation.</summary>
    bool IsAuthenticated { get; }

    /// <summary>
    /// The <c>sub</c> claim of the validated token — for Descope, the Descope
    /// user id. Null when the request is anonymous.
    /// </summary>
    string? SubjectId { get; }

    /// <summary>
    /// The subscriber id asserted by the token, or null if the token carries none.
    /// </summary>
    /// <remarks>
    /// This is the value a request body is cross-checked against — see
    /// <see cref="IMemberScopedRequest"/>. It is the token's claim, never the
    /// client's: the whole point of the comparison is that one of the two is not
    /// to be trusted.
    /// </remarks>
    string? SubscriberId { get; }

    /// <summary>
    /// The plan information asserted by the token, or null if the token carries none.
    /// </summary>
    string? PlanInformation { get; }
}

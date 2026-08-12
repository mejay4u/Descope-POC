namespace PilotApi.Application.Abstractions;

/// <summary>
/// Who is making the current request, expressed without any reference to HTTP.
/// </summary>
/// <remarks>
/// <para>
/// The Application layer needs to know who is calling, but giving it
/// <c>ClaimsPrincipal</c> or <c>IHttpContextAccessor</c> would drag ASP.NET —
/// and, one refactor later, Descope-shaped claim names — into business logic.
/// This interface is the seam. The API layer implements it from the validated
/// token (see PilotApi.Api/Authentication/CallerIdentity.cs); a test implements
/// it with two literal strings.
/// </para>
/// <para>
/// It exposes the raw token subject and nothing else on purpose. Anything richer
/// — "the current member", "the current plan" — is a lookup, and lookups belong
/// behind <see cref="IMemberIdentityResolver"/> where they can fail visibly
/// rather than in a property getter where they cannot.
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
}

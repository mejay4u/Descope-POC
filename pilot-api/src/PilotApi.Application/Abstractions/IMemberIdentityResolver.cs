namespace PilotApi.Application.Abstractions;

/// <summary>
/// Translates a token subject (the Descope user id) into a member id in our own
/// system.
/// </summary>
/// <remarks>
/// <para>
/// <b>Read this before copying the sample into the real ID card API — it is the
/// one thing most likely to bite.</b>
/// </para>
/// <para>
/// A Descope session token's <c>sub</c> claim is the id of the user record inside
/// Descope. It is not the member id in our database, and the two share no
/// structure. Every authorization decision on a member-facing endpoint depends on
/// bridging them, so the bridge gets its own interface rather than being an
/// inline dictionary lookup somewhere in an endpoint.
/// </para>
/// <para>
/// Today that bridge does not exist in production data. Per docs/architecture.md,
/// the member record's <c>DescopeUserId</c> column is always null: the registration
/// flow creates the Descope shadow record only after <c>initiateRegistration</c>
/// returns, so there is no id to store at that moment. The only Descope-to-member
/// link is the email address, and a plain Descope session token carries no email
/// claim. Two ways to close it, either of which makes a real implementation of
/// this interface trivial:
/// </para>
/// <list type="number">
///   <item><description>
///     Populate <c>DescopeUserId</c> on the member record — a later step in the
///     registration flow, or a backfill keyed on email — then resolve by that
///     column. This is the sturdier option: it survives a member changing their
///     email address.
///   </description></item>
///   <item><description>
///     Add an <c>email</c> claim to the session token with a Descope JWT Template,
///     then resolve by email. Faster to ship, but it ties member lookup to a
///     mutable identifier and puts a second copy of the mapping in Descope's
///     console rather than in the database.
///   </description></item>
/// </list>
/// <para>
/// Until one of those lands, the ownership check has nothing to compare against.
/// A resolver that cannot answer must return null and let the caller turn that
/// into a 403 — never fall back to "assume the sub is the member id", which would
/// silently disable the very check this exists to support.
/// </para>
/// </remarks>
public interface IMemberIdentityResolver
{
    /// <summary>
    /// Returns the member id for the given token subject, or null when the subject
    /// maps to no member.
    /// </summary>
    Task<string?> ResolveMemberIdAsync(string subjectId, CancellationToken cancellationToken = default);
}

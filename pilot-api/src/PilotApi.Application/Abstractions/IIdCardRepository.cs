using PilotApi.Domain.IdCards;

namespace PilotApi.Application.Abstractions;

/// <summary>
/// Reads ID cards. Implemented in Infrastructure — in this sample from memory, in
/// the real API from wherever card data actually lives.
/// </summary>
/// <remarks>
/// Note what is missing: there is no <c>GetAll</c> and no query that takes a
/// filter. A member-facing read API only ever needs one card at a time, and an
/// enumerate-everything method on the repository is exactly the thing a future
/// endpoint reaches for when someone is in a hurry.
/// </remarks>
public interface IIdCardRepository
{
    /// <summary>Returns the card for a member, or null if that member has none.</summary>
    Task<IdCard?> GetByMemberIdAsync(string memberId, CancellationToken cancellationToken = default);
}

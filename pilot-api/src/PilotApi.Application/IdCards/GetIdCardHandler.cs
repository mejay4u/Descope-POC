using MemberPortal.Authentication.Descope;
using PilotApi.Application.Abstractions;

namespace PilotApi.Application.IdCards;

/// <summary>
/// Reads a member's ID card.
/// </summary>
/// <remarks>
/// <para>
/// Two entry points, and the difference between them is the whole lesson of this
/// sample:
/// </para>
/// <list type="bullet">
///   <item><description>
///     <see cref="GetForCallerAsync"/> derives the member id from the validated
///     token. There is no way for a request to influence which card comes back,
///     so cross-member access is impossible by construction rather than by
///     inspection. Prefer this shape whenever the endpoint can be written that way.
///   </description></item>
///   <item><description>
///     <see cref="GetByMemberIdAsync"/> takes the id from the caller, and is only
///     safe because the endpoint that calls it sits behind the ownership policy.
///     It exists because real APIs usually already have <c>/{memberId}</c> in
///     their routes and rewriting every route is not on the table.
///   </description></item>
/// </list>
/// <para>
/// Note that this handler does not perform the ownership check itself. That is
/// deliberate — see MemberOwnsResourceHandler in MemberPortal.Authentication.Descope for
/// why the check lives in a policy instead. A handler that both fetches data and
/// decides authorization tends to end up with one of the two silently missing on
/// the next endpoint someone adds.
/// </para>
/// </remarks>
public sealed class GetIdCardHandler
{
    private readonly IIdCardRepository _repository;
    private readonly ICallerIdentity _caller;
    private readonly IMemberIdentityResolver _memberIdentityResolver;

    public GetIdCardHandler(
        IIdCardRepository repository,
        ICallerIdentity caller,
        IMemberIdentityResolver memberIdentityResolver)
    {
        _repository = repository;
        _caller = caller;
        _memberIdentityResolver = memberIdentityResolver;
    }

    /// <summary>
    /// Returns the calling member's own card, or null if the caller maps to no
    /// member or that member has no card.
    /// </summary>
    public async Task<IdCardResponse?> GetForCallerAsync(CancellationToken cancellationToken = default)
    {
        if (!_caller.IsAuthenticated || string.IsNullOrEmpty(_caller.SubjectId))
        {
            // Unreachable when the endpoint is behind RequireAuthorization, which
            // is exactly why it is worth keeping: if someone maps this handler to
            // an anonymous endpoint, it returns nothing rather than guessing.
            return null;
        }

        var memberId = await _memberIdentityResolver
            .ResolveMemberIdAsync(_caller.SubjectId, cancellationToken)
            .ConfigureAwait(false);

        return memberId is null
            ? null
            : await GetByMemberIdAsync(memberId, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Returns a specific member's card, or null if there is none.
    /// </summary>
    /// <remarks>
    /// Callers must have already established that the requester is allowed to see
    /// this member's card. Nothing in this method enforces that.
    /// </remarks>
    public async Task<IdCardResponse?> GetByMemberIdAsync(
        string memberId,
        CancellationToken cancellationToken = default)
    {
        var card = await _repository
            .GetByMemberIdAsync(memberId, cancellationToken)
            .ConfigureAwait(false);

        return card is null ? null : IdCardResponse.FromDomain(card);
    }
}

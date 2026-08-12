using PilotApi.Application.Abstractions;
using PilotApi.Domain.IdCards;

namespace PilotApi.Infrastructure.Persistence;

/// <summary>
/// Card data held in a dictionary, so the sample runs with no database.
/// </summary>
/// <remarks>
/// <para>
/// This class is <b>not</b> something to copy into the real ID card API — there
/// you already have a data source, and it goes behind
/// <see cref="IIdCardRepository"/> instead.
/// </para>
/// <para>
/// It seeds <i>two</i> members rather than one on purpose. With a single member
/// the 403 path is untestable: every id you can think to request is either yours
/// or absent, so a broken ownership check looks identical to a working one. The
/// second member is the negative case.
/// </para>
/// </remarks>
public sealed class InMemoryIdCardRepository : IIdCardRepository
{
    /// <summary>The member id seeded for the primary demo member.</summary>
    public const string DemoMemberId = "member-alice";

    /// <summary>A second member, used to prove the ownership check returns 403.</summary>
    public const string OtherMemberId = "member-bob";

    private static readonly IReadOnlyDictionary<string, IdCard> Cards =
        new Dictionary<string, IdCard>(StringComparer.Ordinal)
        {
            [DemoMemberId] = new IdCard
            {
                MemberId = DemoMemberId,
                MemberName = "Alice Member",
                MemberNumber = "W1234567801",
                GroupNumber = "GRP-00417",
                PlanName = "Choice PPO Gold",
                EffectiveDate = new DateOnly(2026, 1, 1),
                RxBin = "610014",
                RxPcn = "MEDDPRIME",
                RxGroup = "RX8842",
            },
            [OtherMemberId] = new IdCard
            {
                MemberId = OtherMemberId,
                MemberName = "Bob Member",
                MemberNumber = "W1234567802",
                GroupNumber = "GRP-00417",
                PlanName = "Choice HMO Silver",
                EffectiveDate = new DateOnly(2026, 3, 1),
                RxBin = "610014",
                RxPcn = "MEDDPRIME",
                RxGroup = "RX8842",
            },
        };

    public Task<IdCard?> GetByMemberIdAsync(string memberId, CancellationToken cancellationToken = default)
    {
        Cards.TryGetValue(memberId, out var card);
        return Task.FromResult(card);
    }
}

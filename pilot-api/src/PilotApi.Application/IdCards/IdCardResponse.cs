using PilotApi.Domain.IdCards;

namespace PilotApi.Application.IdCards;

/// <summary>
/// The ID card as it goes over the wire.
/// </summary>
/// <remarks>
/// <para>
/// A separate type from the domain <see cref="IdCard"/>, so that the response
/// contract is something you change on purpose. Serializing the domain record
/// directly means every field added to it is published to every mobile client the
/// moment it is added — which on a member-facing endpoint is how internal
/// identifiers and status flags leak.
/// </para>
/// <para>
/// Serialization is left on ASP.NET Core's defaults, which are camelCase. Do not
/// "fix" that with a PascalCase JsonSerializerOptions: the MemberPortal app reads
/// camelCase, and a global serializer change is the kind of thing that breaks
/// every client at once and is hard to spot in review
/// (see docs/dotnet-registration-api.md).
/// </para>
/// <para>
/// <see cref="EffectiveDate"/> stays a <see cref="DateOnly"/>, which
/// System.Text.Json writes as an ISO <c>yyyy-MM-dd</c> string — the same shape the
/// registration API already requires for date of birth.
/// </para>
/// </remarks>
public sealed record IdCardResponse
{
    public required string MemberId { get; init; }
    public required string MemberName { get; init; }
    public required string MemberNumber { get; init; }
    public required string GroupNumber { get; init; }
    public required string PlanName { get; init; }
    public required DateOnly EffectiveDate { get; init; }
    public string? RxBin { get; init; }
    public string? RxPcn { get; init; }
    public string? RxGroup { get; init; }

    /// <summary>Projects a domain card into its wire representation.</summary>
    public static IdCardResponse FromDomain(IdCard card) => new()
    {
        MemberId = card.MemberId,
        MemberName = card.MemberName,
        MemberNumber = card.MemberNumber,
        GroupNumber = card.GroupNumber,
        PlanName = card.PlanName,
        EffectiveDate = card.EffectiveDate,
        RxBin = card.RxBin,
        RxPcn = card.RxPcn,
        RxGroup = card.RxGroup,
    };
}

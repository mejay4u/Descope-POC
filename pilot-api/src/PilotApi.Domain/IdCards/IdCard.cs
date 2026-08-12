namespace PilotApi.Domain.IdCards;

/// <summary>
/// A member's insurance ID card, as the business understands it.
/// </summary>
/// <remarks>
/// <para>
/// This is the shape the domain owns, and it is deliberately NOT the shape that
/// goes over the wire. The API returns
/// <c>IdCardResponse</c> (Application layer) instead, so that
/// adding a field here — a claims-system identifier, an internal status flag —
/// cannot silently start publishing it to every mobile client. On a member-facing
/// endpoint that separation is a privacy control, not architectural decoration.
/// </para>
/// <para>
/// <see cref="EffectiveDate"/> is a <see cref="DateOnly"/> and not a
/// <see cref="DateTime"/>. A coverage date has no time and no time zone; modelling
/// it as a DateTime invites an off-by-one where a member in a western time zone
/// sees coverage starting a day early. It also matches the ISO <c>yyyy-MM-dd</c>
/// convention the registration API already uses for date of birth
/// (see docs/dotnet-registration-api.md).
/// </para>
/// </remarks>
public sealed record IdCard
{
    /// <summary>Identifier of the member this card belongs to, in OUR system.</summary>
    /// <remarks>
    /// Not the Descope user id. The two are different values and mapping between
    /// them is the job of <c>IMemberIdentityResolver</c> (Application layer) —
    /// read the comment on that interface before wiring this into the real API.
    /// </remarks>
    public required string MemberId { get; init; }

    /// <summary>Name as it is printed on the card.</summary>
    public required string MemberName { get; init; }

    /// <summary>Member number printed on the front of the card.</summary>
    public required string MemberNumber { get; init; }

    /// <summary>Group number printed on the front of the card.</summary>
    public required string GroupNumber { get; init; }

    /// <summary>Plan name printed on the card, e.g. "Choice PPO Gold".</summary>
    public required string PlanName { get; init; }

    /// <summary>Date coverage under this card began.</summary>
    public required DateOnly EffectiveDate { get; init; }

    /// <summary>Pharmacy BIN, if the plan carries pharmacy benefits.</summary>
    public string? RxBin { get; init; }

    /// <summary>Pharmacy PCN, if the plan carries pharmacy benefits.</summary>
    public string? RxPcn { get; init; }

    /// <summary>Pharmacy group, if the plan carries pharmacy benefits.</summary>
    public string? RxGroup { get; init; }
}

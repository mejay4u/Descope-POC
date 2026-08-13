using Microsoft.Extensions.Options;
using MemberPortal.Authentication.Descope;

namespace PilotApi.Infrastructure.Identity;

/// <summary>
/// Options for <see cref="StubMemberIdentityResolver"/>, bound from the
/// <c>Pilot</c> configuration section.
/// </summary>
public sealed class PilotIdentityOptions
{
    /// <summary>Configuration section these options bind from.</summary>
    public const string SectionName = "Pilot";

    /// <summary>
    /// Descope user id (<c>sub</c>) to member id. Paste the <c>sub</c> from a real
    /// token here to make the sample answer for your own Descope user — see the
    /// README, "Point the sample at your own token".
    /// </summary>
    public Dictionary<string, string> SubjectToMemberMap { get; set; } = new(StringComparer.Ordinal);
}

/// <summary>
/// Maps a Descope <c>sub</c> to a member id using a configured lookup table.
/// </summary>
/// <remarks>
/// <para>
/// A stand-in for the database lookup the real API will do. It is a configured
/// table rather than a hardcoded one so that you can run the sample against your
/// own Descope project without editing code: get a token, read its <c>sub</c>,
/// add one line to appsettings.Development.json.
/// </para>
/// <para>
/// Note what it does when the subject is unknown: it returns null. It does
/// <b>not</b> fall back to treating the subject as a member id. That fallback is
/// tempting — it would make the sample work with any token — and it would also
/// mean every unrecognised caller is granted an identity of their own choosing,
/// which turns the ownership check into decoration. An unknown subject is an
/// authorization failure, and it should look like one.
/// </para>
/// </remarks>
public sealed class StubMemberIdentityResolver : IMemberIdentityResolver
{
    private readonly PilotIdentityOptions _options;

    public StubMemberIdentityResolver(IOptions<PilotIdentityOptions> options)
    {
        _options = options.Value;
    }

    public Task<string?> ResolveMemberIdAsync(string subjectId, CancellationToken cancellationToken = default)
    {
        _options.SubjectToMemberMap.TryGetValue(subjectId, out var memberId);
        return Task.FromResult(memberId);
    }
}

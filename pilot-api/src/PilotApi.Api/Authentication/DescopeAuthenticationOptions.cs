namespace PilotApi.Api.Authentication;

/// <summary>
/// Everything the API needs to know about Descope in order to validate a session
/// token. Bound from the <c>Descope</c> configuration section.
/// </summary>
/// <remarks>
/// <para>
/// The section name matches the one the registration API already uses
/// (docs/dotnet-registration-api.md), so a service that talks to Descope for two
/// reasons still has one place to look.
/// </para>
/// <para>
/// Nothing here is a secret. Validating a token needs only the project id and
/// Descope's public keys, which is the point of asymmetric signing: the ID card
/// API can prove a token is genuine without holding anything that could mint one.
/// Do not add a management key to this section to make some unrelated call
/// convenient — that turns a read-only verifier into a service holding
/// credentials that can create users.
/// </para>
/// </remarks>
public sealed class DescopeAuthenticationOptions
{
    /// <summary>Configuration section these options bind from.</summary>
    public const string SectionName = "Descope";

    /// <summary>
    /// Descope project id, from https://app.descope.com/settings/project.
    /// </summary>
    public string ProjectId { get; set; } = string.Empty;

    /// <summary>
    /// Descope API base URL. Override only for a regional project
    /// (Descope publishes region-specific hosts).
    /// </summary>
    public string BaseUrl { get; set; } = "https://api.descope.com";

    /// <summary>
    /// Signature algorithms the API will accept.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Pinned rather than left open, because "accept whatever the token says" is
    /// how algorithm-confusion attacks work: a token signed with HMAC, using the
    /// verifier's own public key as the shared secret, validates fine against a
    /// handler that will accept any algorithm. Only asymmetric algorithms belong
    /// in this list, and the options validator refuses to start if an HMAC
    /// algorithm appears here.
    /// </para>
    /// <para>
    /// The default covers both algorithms Descope projects are seen with. Trim it
    /// to exactly what your project uses — fetch
    /// <c>{BaseUrl}/{ProjectId}/.well-known/jwks.json</c> and read the <c>alg</c>
    /// of the keys. A shorter list is a smaller attack surface.
    /// </para>
    /// </remarks>
    public List<string> ValidAlgorithms { get; set; } = new() { "ES384", "RS256" };

    /// <summary>
    /// Whether to require and validate the <c>aud</c> claim. Off by default.
    /// </summary>
    /// <remarks>
    /// A plain Descope session token — the kind a flow issues — carries no
    /// <c>aud</c> claim at all, so switching this on without also arranging for
    /// one rejects every real member token. Turn it on if your project issues
    /// tokens through a JWT template or an OIDC application that sets an audience,
    /// and then list the accepted values in <see cref="ValidAudiences"/>. This is
    /// a deliberate default, not an oversight: audience validation with nothing
    /// to validate is worse than none, because it looks like a control and is not.
    /// </remarks>
    public bool ValidateAudience { get; set; }

    /// <summary>Accepted <c>aud</c> values, required when <see cref="ValidateAudience"/> is true.</summary>
    public List<string> ValidAudiences { get; set; } = new();

    /// <summary>
    /// Tolerance for clock drift between Descope and this API, in seconds.
    /// </summary>
    /// <remarks>
    /// The framework default is five minutes, which is a large fraction of a
    /// Descope session token's lifetime — it means a token can keep working for
    /// minutes after it expires. Thirty seconds is enough for real clock drift on
    /// a machine running NTP.
    /// </remarks>
    public int ClockSkewSeconds { get; set; } = 30;

    /// <summary>
    /// <see cref="ValidAlgorithms"/> with duplicates removed.
    /// </summary>
    /// <remarks>
    /// Use this, not the raw list. .NET's configuration binder <i>appends</i> to a
    /// collection that already has values rather than replacing it, so declaring
    /// the same defaults again in appsettings.json yields ["ES384","RS256",
    /// "ES384","RS256"]. Harmless for validation and confusing in a log line, and
    /// the same quirk bites much harder on lists where order or count matters.
    /// </remarks>
    public IReadOnlyList<string> EffectiveAlgorithms =>
        ValidAlgorithms.Distinct(StringComparer.OrdinalIgnoreCase).ToArray();

    /// <summary>
    /// OIDC discovery document for the project. Given to the JWT handler so it
    /// fetches, caches and rotates Descope's signing keys on its own.
    /// </summary>
    public string MetadataAddress =>
        $"{BaseUrl.TrimEnd('/')}/{ProjectId}/.well-known/openid-configuration";

    /// <summary>The project's JWKS endpoint. Useful for checking which algorithm your keys use.</summary>
    public string JwksUri => $"{BaseUrl.TrimEnd('/')}/{ProjectId}/.well-known/jwks.json";

    /// <summary>
    /// Issuer values accepted on a token.
    /// </summary>
    /// <remarks>
    /// Both forms are listed because Descope uses both. The OIDC discovery
    /// document advertises the full URL (<c>https://api.descope.com/{projectId}</c>),
    /// while session tokens minted by flows have been observed carrying the bare
    /// project id in <c>iss</c>. Accepting both means you do not have to guess
    /// which your project does, and — importantly — it is still a pinned list of
    /// two exact strings. Do not "simplify" this by setting
    /// <c>ValidateIssuer = false</c>; that accepts a correctly-signed token from
    /// anyone's Descope project, including one an attacker created.
    /// </remarks>
    public IReadOnlyList<string> ValidIssuers => new[]
    {
        ProjectId,
        $"{BaseUrl.TrimEnd('/')}/{ProjectId}",
    };
}

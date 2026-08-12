using Microsoft.Extensions.Options;

namespace PilotApi.Api.Authentication;

/// <summary>
/// Refuses to let the API start on an authentication configuration that cannot
/// work.
/// </summary>
/// <remarks>
/// <para>
/// This is the fail-fast rule the registration API already follows — "startup
/// fails if neither a key nor the development escape hatch is set"
/// (docs/dotnet-registration-api.md). The failure mode it prevents is nasty: a
/// missing project id does not produce an error at startup, it produces an API
/// that boots happily, reports healthy, and returns 401 to every member. That
/// gets diagnosed as "the app is broken" and can survive a deploy.
/// </para>
/// <para>
/// The placeholder check matches the <c>YOUR_</c> convention the mobile app uses
/// in MemberPortal/src/config/index.ts, and it checks the <i>prefix</i> rather
/// than the whole string for the same reason the app does: a find-and-replace
/// that half-edits the value must not be able to slip past the guard.
/// </para>
/// </remarks>
public sealed class DescopeAuthenticationOptionsValidator : IValidateOptions<DescopeAuthenticationOptions>
{
    /// <summary>Prefix marking a value that is still an unedited placeholder.</summary>
    public const string PlaceholderPrefix = "YOUR_";

    private static readonly string[] SymmetricAlgorithmPrefixes = { "HS" };

    public ValidateOptionsResult Validate(string? name, DescopeAuthenticationOptions options)
    {
        var failures = new List<string>();

        if (string.IsNullOrWhiteSpace(options.ProjectId))
        {
            failures.Add(
                "Descope:ProjectId is not set. Copy it from https://app.descope.com/settings/project " +
                "and set it with 'dotnet user-secrets set \"Descope:ProjectId\" \"<id>\"' or the " +
                "Descope__ProjectId environment variable.");
        }
        else if (options.ProjectId.StartsWith(PlaceholderPrefix, StringComparison.Ordinal))
        {
            failures.Add(
                $"Descope:ProjectId is still the placeholder '{options.ProjectId}'. Replace it with your " +
                "real project id.");
        }

        if (!Uri.TryCreate(options.BaseUrl, UriKind.Absolute, out var baseUri) ||
            (baseUri.Scheme != Uri.UriSchemeHttps && baseUri.Scheme != Uri.UriSchemeHttp))
        {
            failures.Add($"Descope:BaseUrl ('{options.BaseUrl}') must be an absolute http or https URL.");
        }

        if (options.EffectiveAlgorithms.Count == 0)
        {
            failures.Add(
                "Descope:ValidAlgorithms is empty. Leaving it empty would accept a token signed with any " +
                "algorithm the token itself names. List the algorithms your project's JWKS advertises " +
                $"({options.JwksUri}).");
        }

        foreach (var algorithm in options.EffectiveAlgorithms)
        {
            if (SymmetricAlgorithmPrefixes.Any(prefix =>
                    algorithm.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)))
            {
                failures.Add(
                    $"Descope:ValidAlgorithms contains the symmetric algorithm '{algorithm}'. Descope signs " +
                    "with an asymmetric key, and accepting an HMAC algorithm here lets an attacker sign a " +
                    "token with the public key everyone can download.");
            }

            if (string.Equals(algorithm, "none", StringComparison.OrdinalIgnoreCase))
            {
                failures.Add("Descope:ValidAlgorithms contains 'none', which accepts unsigned tokens.");
            }
        }

        if (options.ValidateAudience && options.ValidAudiences.Count == 0)
        {
            failures.Add(
                "Descope:ValidateAudience is true but Descope:ValidAudiences is empty, so every token would " +
                "be rejected. Either list the audiences your project issues, or set ValidateAudience to " +
                "false — a plain Descope session token has no 'aud' claim.");
        }

        if (options.ClockSkewSeconds is < 0 or > 300)
        {
            failures.Add("Descope:ClockSkewSeconds must be between 0 and 300.");
        }

        return failures.Count == 0
            ? ValidateOptionsResult.Success
            : ValidateOptionsResult.Fail(failures);
    }
}

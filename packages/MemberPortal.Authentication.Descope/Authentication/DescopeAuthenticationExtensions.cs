using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using MemberPortal.Authentication.Descope;

namespace Microsoft.Extensions.DependencyInjection;

/// <summary>
/// Adds Descope session-token validation to a service. <b>Every HTTP service that
/// accepts a member token calls this</b> — the BFF and each downstream service alike.
/// </summary>
/// <remarks>
/// <para>
/// These methods live in the <c>Microsoft.Extensions.DependencyInjection</c> namespace
/// rather than the package's own. That is the convention for a shared library, and
/// across a dozen teams it means the package reference is the whole integration: the
/// method is simply there in <c>Program.cs</c>, with no using to hunt for.
/// </para>
/// <para>
/// There is no Descope SDK dependency here and none is needed. Descope publishes a
/// standard OIDC discovery document and JWKS endpoint per project, so the framework's
/// own JWT bearer handler validates its tokens — including fetching, caching and
/// rotating the signing keys. An SDK would put a vendor package in the request path of
/// every call and would still be doing exactly this underneath.
/// </para>
/// <para>
/// Every value identifying Descope lives in configuration
/// (<see cref="DescopeAuthenticationOptions"/>). That is the migration path, not
/// tidiness: when the auth service starts minting its own enriched token, pointing a
/// service at it is a settings change or a second registered scheme, not a rewrite.
/// </para>
/// </remarks>
public static class DescopeAuthenticationExtensions
{
    /// <summary>
    /// Registers the JWT bearer scheme that validates Descope session tokens, plus the
    /// <see cref="ICallerIdentity"/> the application layer reads identity through.
    /// </summary>
    /// <param name="services">The service collection.</param>
    /// <param name="configuration">
    /// Configuration root or section parent; the <c>Descope</c> section is read from it.
    /// </param>
    public static IServiceCollection AddDescopeJwtBearer(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services
            .AddOptions<DescopeAuthenticationOptions>()
            .Bind(configuration.GetSection(DescopeAuthenticationOptions.SectionName))
            // ValidateOnStart is what makes a missing project id a failed startup rather
            // than a service that boots, reports healthy, and returns 401 to every
            // member — which gets triaged as a broken mobile app and survives a deploy.
            .ValidateOnStart();

        services.AddSingleton<IValidateOptions<DescopeAuthenticationOptions>,
            DescopeAuthenticationOptionsValidator>();

        // JwtBearerOptions are configured from DescopeAuthenticationOptions through
        // IConfigureNamedOptions rather than inline, so the validated options object is
        // the single source of truth and configuration is read after validation runs.
        services.AddSingleton<IConfigureOptions<JwtBearerOptions>,
            ConfigureDescopeJwtBearerOptions>();

        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer();

        services.AddHttpContextAccessor();
        services.AddScoped<ICallerIdentity, CallerIdentity>();

        return services;
    }
}

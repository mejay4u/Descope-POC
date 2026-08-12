using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using PilotApi.Application.Abstractions;

namespace PilotApi.Api.Authentication;

/// <summary>
/// Wires Descope session-token validation onto the API. <b>This is the file to
/// copy into the real ID card API.</b>
/// </summary>
/// <remarks>
/// <para>
/// There is no Descope SDK here and none is needed. Descope publishes a standard
/// OIDC discovery document and JWKS endpoint per project, so the framework's own
/// JWT bearer handler validates its tokens — including fetching, caching and
/// rotating the signing keys. An SDK would add a vendor dependency to the request
/// path of every call and would still be doing exactly this underneath.
/// </para>
/// <para>
/// Every value that identifies Descope lives in configuration
/// (<see cref="DescopeAuthenticationOptions"/>). That is not tidiness — it is the
/// migration path. docs/architecture.md has the .NET side eventually minting its
/// own enriched RS256 token that downstream services validate. When that lands,
/// pointing this API at it is a change of <c>BaseUrl</c>/<c>ProjectId</c> in
/// appsettings, or a second call to <see cref="AddDescopeJwtBearer"/> with a
/// different scheme name — not a rewrite of the validation logic.
/// </para>
/// </remarks>
public static class DescopeAuthenticationExtensions
{
    /// <summary>
    /// Registers the JWT bearer scheme that validates Descope session tokens, plus
    /// the caller abstraction the application layer reads identity through.
    /// </summary>
    public static IServiceCollection AddDescopeJwtBearer(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services
            .AddOptions<DescopeAuthenticationOptions>()
            .Bind(configuration.GetSection(DescopeAuthenticationOptions.SectionName))
            // ValidateOnStart is what makes a missing project id a failed startup
            // instead of an API that returns 401 to every member. See the validator.
            .ValidateOnStart();

        services.AddSingleton<IValidateOptions<DescopeAuthenticationOptions>,
            DescopeAuthenticationOptionsValidator>();

        // The JwtBearerOptions are configured from DescopeAuthenticationOptions
        // through IConfigureNamedOptions rather than inline here, so the validated
        // options object is the single source of truth and configuration is read
        // once, lazily, after validation has run.
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

/// <summary>
/// Projects <see cref="DescopeAuthenticationOptions"/> onto the framework's
/// <see cref="JwtBearerOptions"/>.
/// </summary>
/// <remarks>
/// A named-options configurator rather than an inline lambda in
/// <see cref="DescopeAuthenticationExtensions.AddDescopeJwtBearer"/>, so that the
/// validated options object is the single source of truth and configuration is
/// read lazily — after ValidateOnStart has had its say — rather than at
/// registration time.
/// </remarks>
internal sealed class ConfigureDescopeJwtBearerOptions : IConfigureNamedOptions<JwtBearerOptions>
{
    private readonly IOptions<DescopeAuthenticationOptions> _descopeOptions;
    private readonly IHostEnvironment _environment;
    private readonly ILoggerFactory _loggerFactory;

    public ConfigureDescopeJwtBearerOptions(
        IOptions<DescopeAuthenticationOptions> descopeOptions,
        IHostEnvironment environment,
        ILoggerFactory loggerFactory)
    {
        _descopeOptions = descopeOptions;
        _environment = environment;
        _loggerFactory = loggerFactory;
    }

    public void Configure(string? name, JwtBearerOptions options)
    {
        if (!string.Equals(name, JwtBearerDefaults.AuthenticationScheme, StringComparison.Ordinal))
        {
            return;
        }

        Configure(options);
    }

    public void Configure(JwtBearerOptions options)
    {
        var descope = _descopeOptions.Value;

        // Discovery document, not a hand-rolled JWKS fetch. The handler caches
        // the keys and re-fetches them when Descope rotates, which is the part
        // that is easy to get wrong by hand and only fails months later.
        options.MetadataAddress = descope.MetadataAddress;

        // Descope is always https; this only relaxes for a local mock in dev.
        options.RequireHttpsMetadata = !_environment.IsDevelopment();

        // Keep JWT claim names as they appear in the token. Left on (the
        // default), ASP.NET rewrites 'sub' to a
        // http://schemas.xmlsoap.org/... URI, and every claim lookup written
        // against the token you inspected at jwt.io silently returns null.
        options.MapInboundClaims = false;

        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuers = descope.ValidIssuers,

            // Off by default: a plain Descope session token has no 'aud'.
            // See DescopeAuthenticationOptions.ValidateAudience.
            ValidateAudience = descope.ValidateAudience,
            ValidAudiences = descope.ValidAudiences,

            ValidateIssuerSigningKey = true,
            RequireSignedTokens = true,

            // Pinned so a token cannot choose its own algorithm.
            ValidAlgorithms = descope.EffectiveAlgorithms,

            ValidateLifetime = true,
            RequireExpirationTime = true,
            ClockSkew = TimeSpan.FromSeconds(descope.ClockSkewSeconds),

            // With MapInboundClaims off, name the subject claim explicitly so
            // User.Identity.Name is the Descope user id rather than null.
            NameClaimType = CallerIdentity.SubjectClaimType,
            RoleClaimType = "roles",
        };

        options.Events = ProblemDetailsAuthEvents.Create(_loggerFactory);
    }
}

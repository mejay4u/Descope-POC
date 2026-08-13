using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace MemberPortal.Authentication.Descope;

/// <summary>
/// Projects <see cref="DescopeAuthenticationOptions"/> onto the framework's
/// <see cref="JwtBearerOptions"/>.
/// </summary>
/// <remarks>
/// A named-options configurator rather than an inline lambda in
/// <c>AddDescopeJwtBearer</c>, so that the
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

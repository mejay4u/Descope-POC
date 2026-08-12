using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using PilotApi.Infrastructure.Persistence;

namespace PilotApi.Api.Tests;

/// <summary>
/// Hosts the API in-process with Descope's JWKS replaced by a local key.
/// </summary>
/// <remarks>
/// <para>
/// The swap is one property: <see cref="JwtBearerOptions.ConfigurationManager"/>.
/// Normally the JWT handler resolves it from the OIDC discovery document at
/// Descope, fetching over the network on first use. Handing it a
/// <see cref="StaticConfigurationManager{T}"/> holding the test signing key means
/// no network call happens and no Descope project is needed — while leaving every
/// other part of the pipeline exactly as it runs in production: the same handler,
/// the same TokenValidationParameters, the same issuer and algorithm pinning, the
/// same ProblemDetails events.
/// </para>
/// <para>
/// That distinction is what makes these tests worth trusting. A suite that stubs
/// out authentication entirely — the common shortcut of a fake
/// AuthenticationHandler that always succeeds — tests that endpoints have
/// <c>[Authorize]</c> on them, and nothing about whether the token validation is
/// correct. Here, only the key source is faked.
/// </para>
/// </remarks>
public sealed class PilotApiFactory : WebApplicationFactory<Program>
{
    /// <summary>Stand-in Descope project id. Doubles as the expected issuer.</summary>
    public const string ProjectId = "P2PilotTestProject00000000000";

    /// <summary>Token subject mapped to the seeded demo member.</summary>
    public const string AliceSubject = "U2AliceDescopeUserId";

    /// <summary>A subject that maps to a member with no ID card on file.</summary>
    public const string NoCardSubject = "U2NoCardDescopeUserId";

    /// <summary>A subject that maps to no member at all.</summary>
    public const string UnmappedSubject = "U2UnmappedDescopeUserId";

    public TestTokenFactory Tokens { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        builder.ConfigureAppConfiguration((_, configuration) =>
        {
            configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Descope:ProjectId"] = ProjectId,
                ["Descope:BaseUrl"] = "https://api.descope.com",
                ["Descope:ValidateAudience"] = "false",
                ["Descope:ClockSkewSeconds"] = "30",

                ["Pilot:SubjectToMemberMap:" + AliceSubject] = InMemoryIdCardRepository.DemoMemberId,
                ["Pilot:SubjectToMemberMap:" + NoCardSubject] = "member-with-no-card",
            });
        });

        builder.ConfigureTestServices(services =>
        {
            services.Configure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, options =>
            {
                var configuration = new OpenIdConnectConfiguration { Issuer = ProjectId };
                configuration.SigningKeys.Add(Tokens.SigningKey);

                options.Configuration = configuration;
                options.ConfigurationManager =
                    new StaticConfigurationManager<OpenIdConnectConfiguration>(configuration);
                options.RequireHttpsMetadata = false;
                options.TokenValidationParameters.IssuerSigningKeys = new[] { Tokens.SigningKey };
            });
        });
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            Tokens.Dispose();
        }

        base.Dispose(disposing);
    }
}

using Microsoft.OpenApi.Models;
using Swashbuckle.AspNetCore.SwaggerGen;

namespace PilotApi.Api;

/// <summary>
/// Swagger setup, whose only real job here is the <b>Authorize</b> button.
/// </summary>
/// <remarks>
/// The point of exposing Swagger in this sample is that testing a secured endpoint
/// otherwise means composing curl commands with a 700-character header. With the
/// security scheme declared below, you paste a Descope session token once and
/// every request from the UI carries it.
/// </remarks>
public static class OpenApiConfiguration
{
    private const string BearerSchemeName = "Bearer";

    public static void ConfigureSwaggerGen(SwaggerGenOptions options)
    {
        options.SwaggerDoc("v1", new OpenApiInfo
        {
            Title = "Pilot ID card API",
            Version = "v1",
            Description =
                "Reference implementation of Descope session-token validation for the ID card API. " +
                "Paste a Descope session JWT into Authorize, then call /api/idcard/me.",
        });

        options.AddSecurityDefinition(BearerSchemeName, new OpenApiSecurityScheme
        {
            Name = "Authorization",
            Type = SecuritySchemeType.Http,
            Scheme = "bearer",
            BearerFormat = "JWT",
            In = ParameterLocation.Header,
            Description =
                "Paste the Descope session JWT only — Swagger adds the 'Bearer ' prefix itself. " +
                "See pilot-api/tools/get-test-token.sh for how to obtain one.",
        });

        options.AddSecurityRequirement(new OpenApiSecurityRequirement
        {
            {
                new OpenApiSecurityScheme
                {
                    Reference = new OpenApiReference
                    {
                        Type = ReferenceType.SecurityScheme,
                        Id = BearerSchemeName,
                    },
                },
                Array.Empty<string>()
            },
        });
    }
}

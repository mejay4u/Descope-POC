using PilotApi.Api;
using PilotApi.Api.Endpoints;
using PilotApi.Infrastructure;

// -----------------------------------------------------------------------------
// Pilot ID card API.
//
// A reference for one question: how does a .NET API accept only requests carrying
// a valid Descope session token, and only serve each member their own ID card?
//
// The lines that answer it are AddDescopeJwtBearer, AddDescopeMemberOwnership, and
// the RequireAuthorization on the route group in Endpoints/IdCardEndpoints.cs.
// Everything else in this solution is scaffolding so those can be run and tested —
// see README.md for what to copy, where each half belongs, and what to leave behind.
// -----------------------------------------------------------------------------

var builder = WebApplication.CreateBuilder(args);

// ProblemDetails for framework-generated errors (415, 400 on a bad route value,
// unhandled exceptions). The auth pipeline writes its own — see
// Authentication/ProblemDetailsAuthEvents.cs — because the JWT handler's
// challenge does not pass through this.
builder.Services.AddProblemDetails();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(OpenApiConfiguration.ConfigureSwaggerGen);

// Authentication. Every HTTP service gets this one, downstream services included.
builder.Services.AddDescopeJwtBearer(builder.Configuration);

// Ownership. FRONT DOORS ONLY — in the real topology this belongs on the BFF, which
// resolves the Descope subject to a member once and answers "is this member allowed to
// see this record". Downstream services deliberately do not take it: putting a member
// lookup in every one of them is the coupling the enriched token exists to remove. It
// is here because the sample is both halves in one process.
builder.Services.AddDescopeMemberOwnership();

// Opt-in, and a breaking change for an existing service — see the method's remarks
// before adding it to one that already has anonymous endpoints.
builder.Services.RequireAuthenticatedUserByDefault();

// Stub data and the Descope-user-to-member mapping. Replaced wholesale in the
// real API by its existing data access.
builder.Services.AddPilotInfrastructure(builder.Configuration);

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();

if (app.Environment.IsDevelopment())
{
    // Swagger is Development-only. An anonymous, publicly reachable description of
    // every route on a member-facing API is a reconnaissance aid, and the
    // FallbackPolicy that guards the endpoints does not guard this middleware.
    app.UseSwagger();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/swagger/v1/swagger.json", "Pilot ID card API v1");
        options.DocumentTitle = "Pilot ID card API";
    });
}

app.UseAuthentication();
app.UseAuthorization();

app.MapIdCardEndpoints();

app.Run();

/// <summary>
/// Exposed so the test project can host the API in-process with
/// WebApplicationFactory. Top-level statements compile to an internal Program
/// class, which the factory cannot reach without this.
/// </summary>
public partial class Program
{
}

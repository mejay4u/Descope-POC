using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Mvc;

namespace PilotApi.Api.Authentication;

/// <summary>
/// Turns the JWT handler's 401 and 403 responses into ProblemDetails bodies.
/// </summary>
/// <remarks>
/// <para>
/// Out of the box a rejected token produces a 401 with an <b>empty body</b>. That
/// is a real problem for this client: the MemberPortal app reads an error message
/// out of the response in priority order — <c>detail</c>, then the validation
/// <c>errors</c> dictionary, then <c>title</c> — and falls back to a generic
/// "the service returned an error" string when it finds none. An empty 401
/// therefore reaches the member as an unexplained failure, and reaches the
/// on-call engineer as a screenshot of one.
/// </para>
/// <para>
/// What the bodies deliberately do not contain: why validation failed. "Signature
/// invalid", "token expired at 14:03:11", and "issuer 'X' is not valid" are useful
/// to an attacker probing what the API accepts and useless to a member, who can
/// only ever do one thing about a 401 — sign in again. The detail is written for
/// the member; the diagnosis goes to the log via
/// <see cref="JwtBearerEvents.OnAuthenticationFailed"/>.
/// </para>
/// </remarks>
public static class ProblemDetailsAuthEvents
{
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    /// <summary>Message returned on any authentication failure.</summary>
    public const string UnauthorizedDetail =
        "Your session has expired or is not valid. Please sign in again.";

    /// <summary>Message returned when a valid token is not allowed to see the resource.</summary>
    public const string ForbiddenDetail =
        "You are not allowed to view this ID card.";

    /// <summary>Builds the event handlers wired onto the JWT bearer scheme.</summary>
    public static JwtBearerEvents Create(ILoggerFactory loggerFactory)
    {
        var logger = loggerFactory.CreateLogger(typeof(ProblemDetailsAuthEvents).FullName!);

        return new JwtBearerEvents
        {
            OnAuthenticationFailed = context =>
            {
                // The only place the real reason is recorded. Logged at Debug
                // because a stream of failed tokens is normal traffic for a
                // mobile client with an expired session, not an incident.
                logger.LogDebug(
                    context.Exception,
                    "Descope token validation failed for {Path}.",
                    context.Request.Path);
                return Task.CompletedTask;
            },

            OnChallenge = async context =>
            {
                // Suppress the framework's own empty-bodied challenge so it does
                // not also write to the response.
                context.HandleResponse();

                if (context.Response.HasStarted)
                {
                    return;
                }

                await WriteProblemAsync(
                    context.HttpContext,
                    StatusCodes.Status401Unauthorized,
                    "Unauthorized",
                    UnauthorizedDetail).ConfigureAwait(false);
            },

            OnForbidden = async context =>
            {
                if (context.Response.HasStarted)
                {
                    return;
                }

                await WriteProblemAsync(
                    context.HttpContext,
                    StatusCodes.Status403Forbidden,
                    "Forbidden",
                    ForbiddenDetail).ConfigureAwait(false);
            },
        };
    }

    private static async Task WriteProblemAsync(
        HttpContext httpContext,
        int statusCode,
        string title,
        string detail)
    {
        var problem = new ProblemDetails
        {
            Status = statusCode,
            Title = title,
            Detail = detail,
            Instance = httpContext.Request.Path,
        };

        httpContext.Response.StatusCode = statusCode;

        // Written by hand rather than through WriteAsJsonAsync so the content type
        // is exactly application/problem+json — WriteAsJsonAsync would set
        // application/json, and a client sniffing the content type to decide
        // whether to look for a 'detail' field would then miss it.
        httpContext.Response.ContentType = "application/problem+json; charset=utf-8";

        var json = JsonSerializer.Serialize(problem, SerializerOptions);
        await httpContext.Response.WriteAsync(json).ConfigureAwait(false);
    }
}

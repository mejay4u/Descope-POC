using Microsoft.AspNetCore.Http.HttpResults;
using PilotApi.Api.Authorization;
using PilotApi.Application.IdCards;

namespace PilotApi.Api.Endpoints;

/// <summary>
/// The ID card endpoints — the thing being secured.
/// </summary>
/// <remarks>
/// <para>
/// Two routes return the same data, and the pair is the point of the sample.
/// </para>
/// <para>
/// <c>GET /api/idcard/me</c> is the shape to prefer. The member id comes from the
/// validated token and there is no way for the request to influence which card
/// comes back, so cross-member access is not prevented — it is unrepresentable.
/// No policy, no handler, nothing to forget.
/// </para>
/// <para>
/// <c>GET /api/idcard/{memberId}</c> is the shape most existing APIs already have,
/// and it needs the ownership policy to be safe. It is included precisely because
/// telling you to rewrite every route in the real API is not useful advice. If
/// you copy one line from this file, copy the
/// <c>.RequireAuthorization(AuthorizationPolicies.MemberOwnsResource)</c> on it.
/// </para>
/// <para>
/// A missing card returns 404 with a ProblemDetails body. Note that the 404 here
/// means "this member has no card", which the caller has already been proven
/// entitled to know — the ownership policy ran first. That ordering matters: a
/// 404 computed before an authorization check leaks which member ids exist.
/// </para>
/// </remarks>
public static class IdCardEndpoints
{
    private const string CardNotFoundTitle = "No ID card found";

    private const string CardNotFoundDetail =
        "We could not find an ID card for this member. If coverage has just started, " +
        "the card may not be ready yet.";

    public static IEndpointRouteBuilder MapIdCardEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app
            .MapGroup("/api/idcard")
            .RequireAuthorization()
            .WithTags("ID card");

        group
            .MapGet("/me", GetMyIdCardAsync)
            .WithName("GetMyIdCard")
            .WithSummary("Returns the calling member's ID card.")
            .WithDescription(
                "The member is taken from the token's 'sub' claim. Nothing in the request " +
                "selects which card is returned.")
            .Produces<IdCardResponse>(StatusCodes.Status200OK)
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status404NotFound);

        group
            .MapGet($"/{{{AuthorizationPolicies.MemberIdRouteValue}}}", GetIdCardByMemberIdAsync)
            .RequireAuthorization(AuthorizationPolicies.MemberOwnsResource)
            .WithName("GetIdCardByMemberId")
            .WithSummary("Returns a specific member's ID card, if it is the caller's own.")
            .WithDescription(
                "Requesting another member's id returns 403. Try the seeded 'member-bob' with a " +
                "token mapped to 'member-alice' to see it.")
            .Produces<IdCardResponse>(StatusCodes.Status200OK)
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound);

        return app;
    }

    private static async Task<Results<Ok<IdCardResponse>, ProblemHttpResult>> GetMyIdCardAsync(
        GetIdCardHandler handler,
        CancellationToken cancellationToken)
    {
        var card = await handler.GetForCallerAsync(cancellationToken).ConfigureAwait(false);

        return card is null
            ? TypedResults.Problem(
                detail: CardNotFoundDetail,
                statusCode: StatusCodes.Status404NotFound,
                title: CardNotFoundTitle)
            : TypedResults.Ok(card);
    }

    private static async Task<Results<Ok<IdCardResponse>, ProblemHttpResult>> GetIdCardByMemberIdAsync(
        string memberId,
        GetIdCardHandler handler,
        CancellationToken cancellationToken)
    {
        // No ownership check here on purpose — the policy on the route already ran
        // and this code is unreachable for a caller who is not this member. See
        // Authorization/MemberOwnsResourceHandler.cs.
        var card = await handler.GetByMemberIdAsync(memberId, cancellationToken).ConfigureAwait(false);

        return card is null
            ? TypedResults.Problem(
                detail: CardNotFoundDetail,
                statusCode: StatusCodes.Status404NotFound,
                title: CardNotFoundTitle)
            : TypedResults.Ok(card);
    }
}

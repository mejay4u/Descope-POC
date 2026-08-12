using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using PilotApi.Application.IdCards;
using PilotApi.Infrastructure.Persistence;
using Xunit;

namespace PilotApi.Api.Tests;

/// <summary>
/// What each test is really documenting is a rule that is easy to break by
/// accident later — a relaxed issuer check, a policy dropped from a route, an
/// empty 401 body the app cannot render.
/// </summary>
public sealed class IdCardEndpointTests : IClassFixture<PilotApiFactory>
{
    private readonly PilotApiFactory _factory;

    public IdCardEndpointTests(PilotApiFactory factory)
    {
        _factory = factory;
    }

    private HttpClient CreateClient(string? token = null)
    {
        var client = _factory.CreateClient();

        if (token is not null)
        {
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }

        return client;
    }

    [Fact]
    public async Task Anonymous_request_is_rejected_with_a_readable_problem_details_body()
    {
        var response = await CreateClient().GetAsync("/api/idcard/me");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);

        // The body matters as much as the status. The MemberPortal app reads
        // 'detail' out of the response; an empty 401 reaches the member as an
        // unexplained failure.
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>();
        Assert.NotNull(problem);
        Assert.False(string.IsNullOrWhiteSpace(problem!.Detail));
    }

    [Fact]
    public async Task Valid_token_returns_the_callers_own_card()
    {
        var token = _factory.Tokens.CreateToken(PilotApiFactory.AliceSubject);

        var response = await CreateClient(token).GetAsync("/api/idcard/me");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var card = await response.Content.ReadFromJsonAsync<IdCardResponse>();
        Assert.NotNull(card);
        Assert.Equal(InMemoryIdCardRepository.DemoMemberId, card!.MemberId);
    }

    [Fact]
    public async Task Requesting_your_own_member_id_by_route_succeeds()
    {
        var token = _factory.Tokens.CreateToken(PilotApiFactory.AliceSubject);

        var response = await CreateClient(token)
            .GetAsync($"/api/idcard/{InMemoryIdCardRepository.DemoMemberId}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Requesting_another_members_id_is_forbidden()
    {
        // The whole reason the sample seeds two members. A valid, unexpired,
        // correctly-signed token is not authorization to read anyone's card.
        var token = _factory.Tokens.CreateToken(PilotApiFactory.AliceSubject);

        var response = await CreateClient(token)
            .GetAsync($"/api/idcard/{InMemoryIdCardRepository.OtherMemberId}");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);

        // Explicitly not 200 and explicitly not 404: a 404 here would be
        // indistinguishable from "no card exists", which the logs and the app
        // have to treat differently.
        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>();
        Assert.NotNull(problem);
        Assert.Equal(StatusCodes.Status403Forbidden, problem!.Status ?? 0);
    }

    [Fact]
    public async Task Expired_token_is_rejected()
    {
        var token = _factory.Tokens.CreateExpiredToken(PilotApiFactory.AliceSubject);

        var response = await CreateClient(token).GetAsync("/api/idcard/me");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Token_signed_by_a_different_key_is_rejected()
    {
        // Same issuer, same claims, same algorithm — only the key is wrong. This
        // is what a token from someone else's Descope project looks like.
        using var attacker = new TestTokenFactory("attacker-key");
        var token = attacker.CreateToken(PilotApiFactory.AliceSubject);

        var response = await CreateClient(token).GetAsync("/api/idcard/me");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Hmac_signed_token_is_rejected()
    {
        // Algorithm confusion: a token that names a symmetric algorithm. Rejected
        // because Descope:ValidAlgorithms pins the accepted set to asymmetric
        // algorithms — see DescopeAuthenticationOptions.ValidAlgorithms.
        var token = _factory.Tokens.CreateHmacToken(PilotApiFactory.AliceSubject);

        var response = await CreateClient(token).GetAsync("/api/idcard/me");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Token_from_a_different_issuer_is_rejected()
    {
        var token = _factory.Tokens.CreateToken(
            PilotApiFactory.AliceSubject,
            issuer: "P2SomeOtherDescopeProject");

        var response = await CreateClient(token).GetAsync("/api/idcard/me");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Subject_that_maps_to_no_member_gets_no_card()
    {
        // The symptom of the DescopeUserId gap described in
        // IMemberIdentityResolver: a perfectly valid token whose 'sub' the API
        // cannot turn into a member. It must not fall through to somebody's card.
        var token = _factory.Tokens.CreateToken(PilotApiFactory.UnmappedSubject);

        var response = await CreateClient(token).GetAsync("/api/idcard/me");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Mapped_member_without_a_card_gets_a_readable_404()
    {
        var token = _factory.Tokens.CreateToken(PilotApiFactory.NoCardSubject);

        var response = await CreateClient(token).GetAsync("/api/idcard/me");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>();
        Assert.NotNull(problem);
        Assert.False(string.IsNullOrWhiteSpace(problem!.Detail));
    }
}

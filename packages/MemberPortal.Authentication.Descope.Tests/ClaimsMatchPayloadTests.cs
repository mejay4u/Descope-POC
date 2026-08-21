using MemberPortal.Authentication.Descope;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using System.Security.Claims;
using Xunit;

namespace MemberPortal.Authentication.Descope.Tests;

/// <summary>
/// Step 16 of the BFF Validation sequence: the request body the mobile app sends must
/// agree with the claims in the token it sends with it.
/// </summary>
/// <remarks>
/// Driven through <see cref="IAuthorizationService"/> rather than by newing up the
/// handler, so these also cover the registration in
/// <c>AddDescopeClaimsPayloadCheck()</c>. A handler that works but is never wired up
/// fails exactly as open as no handler at all.
/// </remarks>
public class ClaimsMatchPayloadTests
{
    private sealed record Body(string? SubscriberId, string? PlanInformation) : IMemberScopedRequest;

    private sealed record FakeCaller(
        bool IsAuthenticated,
        string? SubjectId,
        string? SubscriberId,
        string? PlanInformation) : ICallerIdentity;

    private static async Task<AuthorizationResult> AuthorizeAsync(
        ICallerIdentity caller,
        object? resource)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton(caller);
        services.AddDescopeClaimsPayloadCheck();

        var provider = services.BuildServiceProvider();
        var authorization = provider.GetRequiredService<IAuthorizationService>();

        var identity = caller.IsAuthenticated
            ? new ClaimsIdentity(authenticationType: "Test")
            : new ClaimsIdentity();

        return await authorization.AuthorizeAsync(
            new ClaimsPrincipal(identity), resource, DescopePolicies.ClaimsMatchPayload);
    }

    private static FakeCaller TokenSaying(string? subscriber, string? plan = "GOLD-PPO") =>
        new(IsAuthenticated: true, SubjectId: "U-9", SubscriberId: subscriber, PlanInformation: plan);

    [Fact]
    public async Task Allows_a_body_that_agrees_with_the_token()
    {
        var result = await AuthorizeAsync(
            TokenSaying("SUB-1001"),
            new Body("SUB-1001", "GOLD-PPO"));

        Assert.True(result.Succeeded);
    }

    [Fact]
    public async Task Allows_a_body_that_names_nothing()
    {
        // Nothing to contradict, so nothing to catch — the service reads the value
        // from the claim instead.
        var result = await AuthorizeAsync(TokenSaying("SUB-1001"), new Body(null, null));

        Assert.True(result.Succeeded);
    }

    [Fact]
    public async Task Refuses_a_body_naming_a_different_subscriber()
    {
        // The IDOR case: a valid token, someone else's subscriber in the payload.
        var result = await AuthorizeAsync(
            TokenSaying("SUB-1001"),
            new Body("SUB-2002", "GOLD-PPO"));

        Assert.False(result.Succeeded);
        Assert.True(result.IsClaimsMismatch());
    }

    [Fact]
    public async Task Refuses_a_body_naming_a_different_plan()
    {
        var result = await AuthorizeAsync(
            TokenSaying("SUB-1001"),
            new Body("SUB-1001", "BRONZE-HMO"));

        Assert.False(result.Succeeded);
        Assert.True(result.IsClaimsMismatch());
    }

    [Fact]
    public async Task Comparison_is_case_sensitive()
    {
        // These are identifiers, not prose. SUB-1001 and sub-1001 are different
        // subscribers, and a near-miss is exactly what this exists to refuse.
        var result = await AuthorizeAsync(
            TokenSaying("SUB-1001"),
            new Body("sub-1001", "GOLD-PPO"));

        Assert.False(result.Succeeded);
    }

    [Fact]
    public async Task Refuses_when_the_token_carries_no_such_claim()
    {
        // Usually a JWT template that never projected the claim. Every request is
        // then unverifiable, and refusing is louder than waving them all through.
        var result = await AuthorizeAsync(
            TokenSaying(subscriber: null),
            new Body("SUB-1001", null));

        Assert.False(result.Succeeded);
        Assert.True(result.IsClaimsMismatch());
    }

    [Fact]
    public async Task Refuses_an_unauthenticated_caller()
    {
        var caller = new FakeCaller(false, null, null, null);

        var result = await AuthorizeAsync(caller, new Body("SUB-1001", null));

        Assert.False(result.Succeeded);
    }

    [Fact]
    public async Task Refuses_when_the_body_was_not_passed()
    {
        // Forgetting the resource must fail closed: the handler never runs, so the
        // requirement is never satisfied.
        var result = await AuthorizeAsync(TokenSaying("SUB-1001"), resource: null);

        Assert.False(result.Succeeded);
    }

    [Fact]
    public void An_ordinary_denial_is_not_reported_as_a_mismatch()
    {
        // So a caller can tell tampering apart from "not allowed" and answer each
        // with its own status code.
        Assert.False(AuthorizationResult.Failed().IsClaimsMismatch());
        Assert.False(AuthorizationResult.Success().IsClaimsMismatch());
    }
}

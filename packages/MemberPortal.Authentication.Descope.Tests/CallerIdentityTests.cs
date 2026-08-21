using System.Security.Claims;
using MemberPortal.Authentication.Descope;
using Microsoft.AspNetCore.Http;
using Xunit;

namespace MemberPortal.Authentication.Descope.Tests;

/// <summary>
/// Covers the claim reading the BFF depends on to build a downstream request.
/// </summary>
/// <remarks>
/// The spellings matter more than they look. The claim name is decided in the Descope
/// JWT template, the sequence diagram writes <c>SubscriberID</c>, and the mobile client
/// reads <c>subscriberId</c>. A lookup that missed one would return null, and a null
/// subscriber does not throw — it silently makes every cross-check unverifiable.
/// </remarks>
public class CallerIdentityTests
{
    private static ICallerIdentity CallerWith(params Claim[] claims)
    {
        var identity = new ClaimsIdentity(claims, authenticationType: "Test");
        var accessor = new HttpContextAccessor
        {
            HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(identity) },
        };
        return new CallerIdentity(accessor);
    }

    [Theory]
    [InlineData("SubscriberID")]   // the sequence diagram's spelling
    [InlineData("subscriberId")]   // the mobile client's spelling
    [InlineData("subscriber_id")]
    [InlineData("SUBSCRIBERID")]   // case is not significant
    public void Reads_subscriber_under_any_accepted_spelling(string claimType)
    {
        var caller = CallerWith(new Claim(claimType, "SUB-1001"));

        Assert.Equal("SUB-1001", caller.SubscriberId);
    }

    [Theory]
    [InlineData("PlanInformation")]
    [InlineData("planInformation")]
    [InlineData("plan")]
    public void Reads_plan_under_any_accepted_spelling(string claimType)
    {
        var caller = CallerWith(new Claim(claimType, "GOLD-PPO"));

        Assert.Equal("GOLD-PPO", caller.PlanInformation);
    }

    [Fact]
    public void Absent_claims_are_null()
    {
        var caller = CallerWith(new Claim("sub", "U-9"));

        Assert.Null(caller.SubscriberId);
        Assert.Null(caller.PlanInformation);
    }

    [Fact]
    public void Blank_claim_is_treated_as_absent()
    {
        // Otherwise callers have to check for null and empty separately, and a blank
        // subscriber is no more verifiable than a missing one.
        var caller = CallerWith(new Claim("SubscriberID", "   "));

        Assert.Null(caller.SubscriberId);
    }

    [Fact]
    public void Subject_is_read_from_sub()
    {
        var caller = CallerWith(new Claim("sub", "U-9"));

        Assert.Equal("U-9", caller.SubjectId);
        Assert.True(caller.IsAuthenticated);
    }

    [Fact]
    public void Subject_falls_back_to_the_mapped_claim()
    {
        // Guards the case where another JWT scheme is registered with ASP.NET's
        // inbound claim mapping still on, which rewrites 'sub' into a SOAP-era URI.
        var caller = CallerWith(new Claim(ClaimTypes.NameIdentifier, "U-9"));

        Assert.Equal("U-9", caller.SubjectId);
    }

    [Fact]
    public void No_http_context_is_not_authenticated()
    {
        var caller = new CallerIdentity(new HttpContextAccessor { HttpContext = null });

        Assert.False(caller.IsAuthenticated);
        Assert.Null(caller.SubscriberId);
    }
}

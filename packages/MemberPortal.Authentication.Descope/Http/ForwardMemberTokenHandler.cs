using System.Net.Http.Headers;
using Microsoft.AspNetCore.Http;

namespace MemberPortal.Authentication.Descope;

/// <summary>
/// Copies the inbound request's <c>Authorization</c> header onto outbound calls, so a
/// front door can pass the member's Descope token to a downstream service unaltered.
/// </summary>
/// <remarks>
/// <para>
/// Attach it with <c>AddMemberTokenForwarding()</c> on a specific typed client. There
/// is deliberately no global registration path: a handler that forwards the member's
/// token on <i>every</i> outbound request is how a member token ends up in a log at a
/// third-party API. Opt in per client, and only for clients calling our own services.
/// </para>
/// <para>
/// Two behaviours worth knowing, both chosen to fail safely:
/// </para>
/// <list type="bullet">
///   <item><description>
///     <b>It never overwrites.</b> If the outgoing request already carries an
///     <c>Authorization</c> header, it is left alone — a call already authenticated
///     with a service credential must not be silently downgraded to a member token.
///   </description></item>
///   <item><description>
///     <b>No inbound token means no outbound header</b>, not an exception. The
///     downstream service then returns its own 401, which is where that decision
///     belongs. Throwing here would turn an authorization outcome into a 500 at the
///     wrong layer.
///   </description></item>
/// </list>
/// <para>
/// Note what it cannot do: work queued during a request and executed later has no
/// <see cref="HttpContext"/> to copy from, so it produces an unauthenticated outbound
/// call rather than one carrying a stale token. That is the correct outcome — Descope
/// session tokens live minutes, so a copied member token would have expired anyway.
/// Background work needs a service credential (a Descope access key, whose token
/// validates against the same JWKS), not a borrowed member token.
/// </para>
/// </remarks>
public sealed class ForwardMemberTokenHandler : DelegatingHandler
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public ForwardMemberTokenHandler(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    protected override Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        if (request.Headers.Authorization is null)
        {
            var inbound = _httpContextAccessor.HttpContext?.Request.Headers.Authorization.ToString();

            if (!string.IsNullOrEmpty(inbound) &&
                AuthenticationHeaderValue.TryParse(inbound, out var parsed))
            {
                request.Headers.Authorization = parsed;
            }
        }

        return base.SendAsync(request, cancellationToken);
    }
}

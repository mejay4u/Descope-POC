using Microsoft.Extensions.DependencyInjection.Extensions;
using MemberPortal.Authentication.Descope;

namespace Microsoft.Extensions.DependencyInjection;

/// <summary>
/// Opt-in member-token forwarding for a typed <c>HttpClient</c>. Front doors only.
/// </summary>
public static class DescopeHttpClientBuilderExtensions
{
    /// <summary>
    /// Forwards the inbound request's bearer token on calls made by this client.
    /// </summary>
    /// <remarks>
    /// Registered per client rather than globally, on purpose — see
    /// <see cref="ForwardMemberTokenHandler"/>. Add it to clients calling our own
    /// services and to nothing else:
    /// <code>
    /// services.AddHttpClient&lt;IIdCardClient, IdCardClient&gt;()
    ///         .AddMemberTokenForwarding();
    /// </code>
    /// </remarks>
    public static IHttpClientBuilder AddMemberTokenForwarding(this IHttpClientBuilder builder)
    {
        builder.Services.AddHttpContextAccessor();
        builder.Services.TryAddTransient<ForwardMemberTokenHandler>();

        return builder.AddHttpMessageHandler<ForwardMemberTokenHandler>();
    }
}

using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace MemberPortal.Authentication.Descope;

/// <summary>
/// Fails startup when the ownership policy is registered without an
/// <see cref="IMemberIdentityResolver"/> behind it.
/// </summary>
/// <remarks>
/// <para>
/// A hosted service rather than a check inside
/// <c>AddDescopeMemberOwnership()</c>, because that method
/// may legitimately be called before the resolver is registered — service registration
/// order is not something a shared package gets to dictate. By the time hosted services
/// start, the container is complete.
/// </para>
/// <para>
/// It resolves within a scope because the real resolver is scoped, and it disposes that
/// scope immediately: the point is to prove the registration exists, not to hold an
/// instance.
/// </para>
/// </remarks>
internal sealed class MemberIdentityResolverPresenceCheck : IHostedService
{
    private readonly IServiceProvider _services;

    public MemberIdentityResolverPresenceCheck(IServiceProvider services)
    {
        _services = services;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        using var scope = _services.CreateScope();

        if (scope.ServiceProvider.GetService<IMemberIdentityResolver>() is null)
        {
            throw new InvalidOperationException(
                "AddDescopeMemberOwnership() was called but no " +
                $"{nameof(IMemberIdentityResolver)} is registered, so the " +
                $"'{DescopePolicies.MemberOwnsResource}' policy could never be satisfied and " +
                "every request to a protected endpoint would return 403. Register an " +
                $"{nameof(IMemberIdentityResolver)} that maps a Descope 'sub' to a member id.");
        }

        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}

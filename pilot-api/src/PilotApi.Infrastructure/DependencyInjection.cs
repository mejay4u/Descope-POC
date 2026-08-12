using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using PilotApi.Application.Abstractions;
using PilotApi.Application.IdCards;
using PilotApi.Infrastructure.Identity;
using PilotApi.Infrastructure.Persistence;

namespace PilotApi.Infrastructure;

/// <summary>
/// Registers the sample's data and identity-mapping implementations.
/// </summary>
/// <remarks>
/// Everything here is scoped rather than singleton, matching what the real
/// implementations will need: a repository over EF Core takes a scoped DbContext,
/// and a resolver that queries the member database does too. Registering the
/// stubs as singletons would work today and then quietly break the day someone
/// swaps in the real thing.
/// </remarks>
public static class DependencyInjection
{
    public static IServiceCollection AddPilotInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.Configure<PilotIdentityOptions>(
            configuration.GetSection(PilotIdentityOptions.SectionName));

        services.AddScoped<IIdCardRepository, InMemoryIdCardRepository>();
        services.AddScoped<IMemberIdentityResolver, StubMemberIdentityResolver>();
        services.AddScoped<GetIdCardHandler>();

        return services;
    }
}

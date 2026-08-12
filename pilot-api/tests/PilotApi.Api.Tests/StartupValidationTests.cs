using System.Text;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace PilotApi.Api.Tests;

/// <summary>
/// The API must refuse to start on an authentication configuration that cannot
/// work.
/// </summary>
/// <remarks>
/// Worth a test of its own because the failure it prevents is so quiet. Without
/// ValidateOnStart, a deployment missing <c>Descope:ProjectId</c> starts cleanly,
/// passes a health check, and returns 401 to every member — which gets triaged as
/// a mobile app bug. A refusal to start is diagnosed in seconds.
/// </remarks>
public sealed class StartupValidationTests
{
    [Theory]
    [InlineData("")]
    [InlineData("YOUR_DESCOPE_PROJECT_ID")]
    public void Host_refuses_to_start_without_a_real_project_id(string projectId)
    {
        using var factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.UseEnvironment("Testing");
                builder.ConfigureAppConfiguration((_, configuration) =>
                {
                    configuration.AddInMemoryCollection(new Dictionary<string, string?>
                    {
                        ["Descope:ProjectId"] = projectId,
                    });
                });
            });

        var exception = Assert.ThrowsAny<Exception>(() => factory.CreateClient());

        Assert.Contains("Descope:ProjectId", Flatten(exception), StringComparison.Ordinal);
    }

    [Fact]
    public void Host_refuses_to_start_when_a_symmetric_algorithm_is_configured()
    {
        using var factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.UseEnvironment("Testing");
                builder.ConfigureAppConfiguration((_, configuration) =>
                {
                    configuration.AddInMemoryCollection(new Dictionary<string, string?>
                    {
                        ["Descope:ProjectId"] = PilotApiFactory.ProjectId,
                        ["Descope:ValidAlgorithms:0"] = "HS256",
                    });
                });
            });

        var exception = Assert.ThrowsAny<Exception>(() => factory.CreateClient());

        Assert.Contains("HS256", Flatten(exception), StringComparison.Ordinal);
    }

    private static string Flatten(Exception exception)
    {
        var builder = new StringBuilder();

        for (var current = exception; current is not null; current = current.InnerException)
        {
            builder.AppendLine(current.Message);

            if (current is AggregateException aggregate)
            {
                foreach (var inner in aggregate.InnerExceptions)
                {
                    builder.AppendLine(Flatten(inner));
                }
            }
        }

        return builder.ToString();
    }
}

using System.Security.Cryptography;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace PilotApi.Api.Tests;

/// <summary>
/// Mints JWTs locally so the tests never contact Descope.
/// </summary>
/// <remarks>
/// <para>
/// This is the piece that makes the suite worth having. Authentication tests that
/// need a real token from a real project are tests nobody runs: they need
/// credentials, they need network, and they fail on a Monday because a token
/// expired. Here a P-384 key is generated per test run, the test host is told to
/// treat its public half as the project's signing key (see PilotApiFactory), and
/// the tests mint whatever token the case calls for — expired, wrong issuer,
/// wrong key, wrong algorithm.
/// </para>
/// <para>
/// ES384 is the default because that is the shape of key Descope projects are
/// seen with. Nothing in the API is tied to it: <c>Descope:ValidAlgorithms</c>
/// lists what is accepted, and these tests pass just as well against RS256 if you
/// change both ends.
/// </para>
/// </remarks>
public sealed class TestTokenFactory : IDisposable
{
    private readonly ECDsa _ecdsa;

    public TestTokenFactory(string keyId = "pilot-test-key")
    {
        _ecdsa = ECDsa.Create(ECCurve.NamedCurves.nistP384);
        SigningKey = new ECDsaSecurityKey(_ecdsa) { KeyId = keyId };
    }

    /// <summary>The key this factory signs with, and that the test host trusts.</summary>
    public ECDsaSecurityKey SigningKey { get; }

    /// <summary>Creates a token that should pass validation.</summary>
    public string CreateToken(
        string subject,
        string? issuer = null,
        TimeSpan? lifetime = null,
        SigningCredentials? signingCredentials = null)
    {
        var now = DateTime.UtcNow;
        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = issuer ?? PilotApiFactory.ProjectId,
            IssuedAt = now,
            NotBefore = now.AddMinutes(-1),
            Expires = now.Add(lifetime ?? TimeSpan.FromMinutes(10)),
            SigningCredentials = signingCredentials
                ?? new SigningCredentials(SigningKey, SecurityAlgorithms.EcdsaSha384),

            // Written as raw claims rather than through a ClaimsIdentity so that
            // 'sub' lands in the token as 'sub'. This is the write-side twin of the
            // MapInboundClaims problem the API disables on the read side.
            Claims = new Dictionary<string, object>
            {
                ["sub"] = subject,
                ["drn"] = "DS",
                ["amr"] = new[] { "email" },
            },
        };

        return new JsonWebTokenHandler().CreateToken(descriptor);
    }

    /// <summary>
    /// Creates a token that has already expired.
    /// </summary>
    public string CreateExpiredToken(string subject)
    {
        var now = DateTime.UtcNow;
        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = PilotApiFactory.ProjectId,
            IssuedAt = now.AddHours(-2),
            NotBefore = now.AddHours(-2),
            Expires = now.AddHours(-1),
            SigningCredentials = new SigningCredentials(SigningKey, SecurityAlgorithms.EcdsaSha384),
            Claims = new Dictionary<string, object> { ["sub"] = subject },
        };

        return new JsonWebTokenHandler().CreateToken(descriptor);
    }

    /// <summary>
    /// Creates an HMAC-signed token, standing in for an algorithm-confusion attempt.
    /// </summary>
    public string CreateHmacToken(string subject)
    {
        var secret = new byte[32];
        RandomNumberGenerator.Fill(secret);

        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(secret) { KeyId = SigningKey.KeyId },
            SecurityAlgorithms.HmacSha256);

        return CreateToken(subject, signingCredentials: credentials);
    }

    public void Dispose() => _ecdsa.Dispose();
}

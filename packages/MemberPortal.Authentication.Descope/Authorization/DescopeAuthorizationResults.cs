using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;

namespace MemberPortal.Authentication.Descope;

/// <summary>
/// The responses this package defines, so every service returns the same body and
/// the same status code for the same condition.
/// </summary>
public static class DescopeAuthorizationResults
{
    /// <summary>
    /// The response for a claims/payload mismatch: <b>401</b>, with a
    /// <c>ProblemDetails</c> body matching the one a rejected token produces.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>401 and not 403, deliberately, against the grain of the HTTP semantics.</b>
    /// By the letter of the spec this is a 403 — the caller authenticated
    /// successfully and is simply not permitted. It is a 401 here because of what the
    /// client does with each: a 401 makes the mobile app purge its session and return
    /// to sign-in, a 403 makes it show an error and keep going. A body that
    /// contradicts the token means the app's own state is wrong about who it is, and
    /// carrying on with that state is the thing worth preventing. Signing the member
    /// out is the correct remedy, and 401 is the only status that triggers it.
    /// </para>
    /// <para>
    /// Note the contrast with <see cref="MemberOwnsResourceHandler"/>, which stays a
    /// 403 on purpose. Asking for another member's ID card by route is an ordinary
    /// refusal — the app's session is fine and signing the member out over it would
    /// be wrong. The two look similar and want opposite client behaviour.
    /// </para>
    /// </remarks>
    public static IResult ClaimsMismatch() =>
        // Results.Problem rather than Results.Json: it sets
        // application/problem+json itself. A client that sniffs the content type to
        // decide whether to look for a 'detail' field would miss it under
        // application/json, and this package's other error bodies are already
        // problem+json.
        Results.Problem(
            detail: ClaimsMismatchProblem.Detail,
            title: ClaimsMismatchProblem.Title,
            statusCode: StatusCodes.Status401Unauthorized);

    /// <summary>
    /// True when <paramref name="result"/> failed because the payload contradicted the
    /// token, rather than for any other reason.
    /// </summary>
    /// <remarks>
    /// Lets an endpoint that composes several policies tell a tampering failure apart
    /// from an ordinary denial, and answer each with its own status code.
    /// </remarks>
    public static bool IsClaimsMismatch(this AuthorizationResult result)
    {
        ArgumentNullException.ThrowIfNull(result);

        return result.Failure?.FailureReasons
            .Any(reason => reason.Message == ClaimsMismatchProblem.FailureReason) ?? false;
    }
}

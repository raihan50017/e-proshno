using EProshno.Api.Common;
using EProshno.Infrastructure.Messaging;
using Microsoft.AspNetCore.Http.HttpResults;

namespace EProshno.Api.Features.Auth;

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var auth = app.MapGroup("/api/v1/auth").WithTags("Auth");

        auth.MapPost("/register", async (Register.Command command, Dispatcher d, HttpContext http, CancellationToken ct) =>
            {
                var result = await d.Send(command with { UserAgent = http.UserAgent() }, ct);
                WriteSession(http, result.Session);
                return TypedResults.Ok(result.ToResponse());
            })
            .WithName("register")
            .AllowAnonymous()
            .RequireRateLimiting(RateLimits.Login)
            .ProducesValidationProblem();

        auth.MapPost("/login", async (Login.Command command, Dispatcher d, HttpContext http, CancellationToken ct) =>
            {
                var result = await d.Send(command with { UserAgent = http.UserAgent() }, ct);
                WriteSession(http, result.Session);
                return TypedResults.Ok(result.ToResponse());
            })
            .WithName("login")
            .AllowAnonymous()
            .RequireRateLimiting(RateLimits.Login)
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status403Forbidden);

        auth.MapPost("/otp/send", async (SendOtp.Command command, Dispatcher d, CancellationToken ct) =>
            {
                await d.Send(command, ct);
                return TypedResults.Accepted((string?)null);
            })
            .WithName("sendOtp")
            .AllowAnonymous()
            .RequireRateLimiting(RateLimits.Otp)
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status429TooManyRequests);

        auth.MapPost("/otp/verify", async (VerifyOtp.Command command, Dispatcher d, HttpContext http, CancellationToken ct) =>
            {
                var result = await d.Send(command with { UserAgent = http.UserAgent() }, ct);
                http.WriteRefreshCookie(result.Session);
                return TypedResults.Ok(result.ToResponse());
            })
            .WithName("verifyOtp")
            .AllowAnonymous()
            .RequireRateLimiting(RateLimits.Otp)
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status400BadRequest);

        auth.MapPost("/password/reset", async (ResetPassword.Command command, Dispatcher d, CancellationToken ct) =>
            {
                await d.Send(command, ct);
                return TypedResults.NoContent();
            })
            .WithName("resetPassword")
            .AllowAnonymous()
            .RequireRateLimiting(RateLimits.Otp)
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status400BadRequest);

        auth.MapPost("/refresh", async Task<Results<Ok<SessionResponse>, ProblemHttpResult>> (
                RefreshSession.Request? body, Dispatcher d, HttpContext http, CancellationToken ct) =>
            {
                var result = await d.Send(new RefreshSession.Command(http.ReadRefreshCookie(), body?.InstitutionId, http.UserAgent()), ct);
                if (result is null)
                {
                    http.DeleteRefreshCookie();
                    return TypedResults.Problem(statusCode: StatusCodes.Status401Unauthorized);
                }

                http.WriteRefreshCookie(result.Session);
                return TypedResults.Ok(result.ToResponse());
            })
            .WithName("refreshSession")
            .AllowAnonymous()
            .ProducesProblem(StatusCodes.Status403Forbidden);

        auth.MapPost("/logout", async (Dispatcher d, HttpContext http, CancellationToken ct) =>
            {
                await d.Send(new Logout.Command(http.ReadRefreshCookie()), ct);
                http.DeleteRefreshCookie();
                return TypedResults.NoContent();
            })
            .WithName("logout")
            .AllowAnonymous();

        auth.MapPost("/password/change", async (ChangePassword.Command command, Dispatcher d, HttpContext http, CancellationToken ct) =>
            {
                var result = await d.Send(command with { UserAgent = http.UserAgent() }, ct);
                http.WriteRefreshCookie(result.Session);
                return TypedResults.Ok(result.ToResponse());
            })
            .WithName("changePassword")
            .RequireAuthorization()
            .ProducesValidationProblem();

        var me = app.MapGroup("/api/v1/me").WithTags("Me").RequireAuthorization();

        me.MapGet("/", async (Dispatcher d, CancellationToken ct) => TypedResults.Ok(await d.Query(new GetMe.Query(), ct)))
            .WithName("getMe");

        me.MapPut("/", async (UpdateProfile.Command command, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Send(command, ct)))
            .WithName("updateProfile")
            .ProducesValidationProblem();
    }

    /// <summary>Development only: the SMS outbox (codes are never logged).</summary>
    public static void MapDevEndpoints(this IEndpointRouteBuilder app) =>
        app.MapGet("/api/v1/dev/sms", (DevSmsSender sms) => TypedResults.Ok(sms.Outbox))
            .WithTags("Dev")
            .WithName("getDevSms")
            .AllowAnonymous();

    private static void WriteSession(HttpContext http, SessionResult? session)
    {
        if (session is not null)
        {
            http.WriteRefreshCookie(session.Session);
        }
    }
}

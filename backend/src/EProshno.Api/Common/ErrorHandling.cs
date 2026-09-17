using System.Diagnostics;
using EProshno.Core.Common;
using FluentValidation;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace EProshno.Api.Common;

/// <summary>
/// Maps exceptions to ProblemDetails with a Bangla <c>title</c> and a stable <c>code</c> extension:
/// <see cref="AppException"/> → its status; <see cref="ValidationException"/> → 400 with field errors;
/// request binding errors → 400; everything else → 500 (logged, details hidden).
/// </summary>
public sealed class AppExceptionHandler(IProblemDetailsService problems, ILogger<AppExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext http, Exception exception, CancellationToken ct)
    {
        ProblemDetails problem;
        switch (exception)
        {
            case AppException app:
                problem = new ProblemDetails { Status = app.Status, Title = app.Message };
                problem.Extensions["code"] = app.Code;
                break;

            case ValidationException validation:
                problem = new ValidationProblemDetails(ToErrors(validation))
                {
                    Status = StatusCodes.Status400BadRequest,
                    Title = Messages.ValidationFailed,
                };
                problem.Extensions["code"] = "validation";
                break;

            case BadHttpRequestException bad:
                problem = new ProblemDetails
                {
                    Status = bad.StatusCode == StatusCodes.Status413PayloadTooLarge ? bad.StatusCode : StatusCodes.Status400BadRequest,
                    Title = bad.StatusCode == StatusCodes.Status413PayloadTooLarge ? Messages.FileTooLarge : Messages.ValidationFailed,
                };
                problem.Extensions["code"] = "bad_request";
                break;

            case OperationCanceledException when http.RequestAborted.IsCancellationRequested:
                return true;

            default:
                logger.LogError(exception, "Unhandled exception for {Method} {Path}", http.Request.Method, http.Request.Path);
                problem = new ProblemDetails { Status = StatusCodes.Status500InternalServerError, Title = Messages.UnexpectedError };
                problem.Extensions["code"] = "unexpected";
                break;
        }

        http.Response.StatusCode = problem.Status ?? 500;
        return await problems.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = http,
            ProblemDetails = problem,
            Exception = exception,
        });
    }

    /// <summary>camelCase field paths; the "Body." wrapper of route+body commands is removed.</summary>
    public static Dictionary<string, string[]> ToErrors(ValidationException validation) =>
        validation.Errors
            .GroupBy(e => FieldName(e.PropertyName))
            .ToDictionary(g => g.Key, g => g.Select(e => e.ErrorMessage).Distinct().ToArray());

    public static string FieldName(string propertyName)
    {
        var name = propertyName.StartsWith("Body.", StringComparison.Ordinal) ? propertyName[5..] : propertyName;
        return string.Join('.', name.Split('.').Select(part => part.Length == 0 ? part : char.ToLowerInvariant(part[0]) + part[1..]));
    }
}

public static class ProblemDetailsSetup
{
    public static IServiceCollection AddAppProblemDetails(this IServiceCollection services)
    {
        services.AddExceptionHandler<AppExceptionHandler>();
        services.AddProblemDetails(options => options.CustomizeProblemDetails = ctx =>
        {
            var problem = ctx.ProblemDetails;
            problem.Extensions["traceId"] = Activity.Current?.Id ?? ctx.HttpContext.TraceIdentifier;
            problem.Detail = null;

            // Bodiless status results (401, 403, 404, 429 …) get a Bangla title and a code too.
            if (!problem.Extensions.ContainsKey("code"))
            {
                (problem.Title, var code) = problem.Status switch
                {
                    401 => (Messages.LoginRequired, "auth.required"),
                    403 => (Messages.Forbidden, "forbidden"),
                    404 => (Messages.NotFound, "not_found"),
                    413 => (Messages.FileTooLarge, "file.too_large"),
                    415 => (Messages.InvalidFileType, "file.type"),
                    429 => (Messages.TooManyRequests, "rate_limited"),
                    >= 500 => (Messages.UnexpectedError, "unexpected"),
                    _ => (problem.Title ?? Messages.ValidationFailed, "error"),
                };
                problem.Extensions["code"] = code;
            }
        });
        return services;
    }
}

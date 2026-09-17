using EProshno.Api.Common;
using EProshno.Core.Questions;

namespace EProshno.Api.Features.Questions;

public static class QuestionEndpoints
{
    public static void Map(IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/v1/questions").WithTags("Questions").RequireAuthorization(Policies.Member);

        g.MapPost("/search", async (SearchQuestions.Query query, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Query(query, ct)))
            .WithName("searchQuestions")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status402PaymentRequired);

        g.MapGet("/{id:guid}", async (Guid id, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Query(new GetQuestion.Query(id), ct)))
            .WithName("getQuestion")
            .ProducesProblem(StatusCodes.Status402PaymentRequired)
            .ProducesProblem(StatusCodes.Status404NotFound);

        g.MapPost("/{id:guid}/report", async (Guid id, ReportQuestion.Request body, Dispatcher d, CancellationToken ct) =>
            {
                await d.Send(new ReportQuestion.Command(id, body), ct);
                return TypedResults.NoContent();
            })
            .WithName("reportQuestion")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound);

        g.MapPost("/copy", async (CopyQuestions.Command command, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Send(command, ct)))
            .WithName("copyQuestions")
            .RequireRateLimiting(RateLimits.Copy)
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status402PaymentRequired)
            .ProducesProblem(StatusCodes.Status404NotFound);

        var admin = app.MapGroup("/api/v1/admin/questions").WithTags("Admin").RequireAuthorization(Policies.ContentTeam);

        admin.MapGet("/", async (
                    ContentStatus? status, Guid? subjectId, Guid? chapterId, QuestionType? type, string? keyword, bool? mine,
                    string? cursor, int? limit, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Query(
                    new ListPlatformQuestions.Query(status, subjectId, chapterId, type, keyword, mine ?? false, cursor, limit), ct)))
            .WithName("listPlatformQuestions");

        admin.MapGet("/stats", async (Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Query(new GetContentStats.Query(), ct)))
            .WithName("getContentStats");

        admin.MapGet("/{id:guid}", async (Guid id, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Query(new GetPlatformQuestion.Query(id), ct)))
            .WithName("getPlatformQuestion")
            .ProducesProblem(StatusCodes.Status404NotFound);

        admin.MapPost("/", async (SavePlatformQuestion.Request body, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Send(new SavePlatformQuestion.Command(null, body), ct)))
            .WithName("createPlatformQuestion")
            .RequireAuthorization(Policies.ContentEditor)
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status409Conflict);

        admin.MapPut("/{id:guid}", async (Guid id, SavePlatformQuestion.Request body, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Send(new SavePlatformQuestion.Command(id, body), ct)))
            .WithName("updatePlatformQuestion")
            .RequireAuthorization(Policies.ContentEditor)
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        admin.MapPost("/{id:guid}/status", async (Guid id, ChangeQuestionStatus.Request body, Dispatcher d, CancellationToken ct) =>
            {
                await d.Send(new ChangeQuestionStatus.Command(id, body), ct);
                return TypedResults.NoContent();
            })
            .WithName("changeQuestionStatus")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status409Conflict);

        var reports = app.MapGroup("/api/v1/admin/question-reports").WithTags("Admin").RequireAuthorization(Policies.ContentTeam);

        reports.MapGet("/", async (ReportStatus? status, string? cursor, int? limit, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Query(new ListQuestionReports.Query(status, cursor, limit), ct)))
            .WithName("listQuestionReports");

        reports.MapPost("/{id:guid}/resolve", async (Guid id, ResolveQuestionReport.Request body, Dispatcher d, CancellationToken ct) =>
            {
                await d.Send(new ResolveQuestionReport.Command(id, body), ct);
                return TypedResults.NoContent();
            })
            .WithName("resolveQuestionReport")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound);
    }
}

using EProshno.Api.Common;
using EProshno.Infrastructure.Papers;

namespace EProshno.Api.Features.QuestionSets;

public static class QuestionSetEndpoints
{
    public static void Map(IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/v1/question-sets").WithTags("QuestionSets").RequireAuthorization(Policies.Member);

        g.MapPost("/", async (CreateQuestionSet.Command command, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Send(command, ct)))
            .WithName("createQuestionSet")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status402PaymentRequired);

        g.MapGet("/", async (string? keyword, Guid? subjectId, bool? mine, string? cursor, int? limit, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Query(new ListQuestionSets.Query(keyword, subjectId, mine ?? false, cursor, limit), ct)))
            .WithName("listQuestionSets");

        g.MapGet("/{id:guid}", async (Guid id, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Query(new GetQuestionSet.Query(id), ct)))
            .WithName("getQuestionSet")
            .ProducesProblem(StatusCodes.Status404NotFound);

        g.MapPut("/{id:guid}", async (Guid id, UpdateQuestionSet.Request body, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Send(new UpdateQuestionSet.Command(id, body), ct)))
            .WithName("updateQuestionSet")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status402PaymentRequired)
            .ProducesProblem(StatusCodes.Status404NotFound);

        g.MapDelete("/{id:guid}", async (Guid id, Dispatcher d, CancellationToken ct) =>
            {
                await d.Send(new DeleteQuestionSet.Command(id), ct);
                return TypedResults.NoContent();
            })
            .WithName("deleteQuestionSet")
            .ProducesProblem(StatusCodes.Status404NotFound);

        g.MapPost("/{id:guid}/duplicate", async (Guid id, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Send(new DuplicateQuestionSet.Command(id), ct)))
            .WithName("duplicateQuestionSet")
            .ProducesProblem(StatusCodes.Status402PaymentRequired)
            .ProducesProblem(StatusCodes.Status404NotFound);

        g.MapPost("/{id:guid}/search", async (Guid id, SearchSetQuestions.Request body, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Query(new SearchSetQuestions.Query(id, body), ct)))
            .WithName("searchSetQuestions")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status402PaymentRequired)
            .ProducesProblem(StatusCodes.Status404NotFound);

        g.MapPost("/{id:guid}/auto-select", async (Guid id, AutoSelectQuestions.Request body, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Query(new AutoSelectQuestions.Query(id, body), ct)))
            .WithName("autoSelectQuestions")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status402PaymentRequired)
            .ProducesProblem(StatusCodes.Status404NotFound);

        g.MapPut("/{id:guid}/items", async (Guid id, SaveSetItems.Request body, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Send(new SaveSetItems.Command(id, body), ct)))
            .WithName("saveSetItems")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status402PaymentRequired)
            .ProducesProblem(StatusCodes.Status404NotFound);

        g.MapPut("/{id:guid}/settings", async (Guid id, UpdateSetSettings.Request body, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Send(new UpdateSetSettings.Command(id, body), ct)))
            .WithName("updateSetSettings")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound);

        g.MapGet("/{id:guid}/paper", async (Guid id, int? variant, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Query(new GetSetPaper.Query(id, variant ?? 0), ct)))
            .WithName("getSetPaper")
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status404NotFound);

        g.MapPost("/{id:guid}/pdf", async (Guid id, RequestSetPdf.Request body, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Send(new RequestSetPdf.Command(id, body), ct)))
            .WithName("requestSetPdf")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        app.MapGet("/api/v1/jobs/{id:guid}", async (Guid id, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Query(new GetJob.Query(id), ct)))
            .WithTags("Jobs")
            .WithName("getJob")
            .RequireAuthorization(Policies.Member)
            .ProducesProblem(StatusCodes.Status404NotFound);

        // Chromium print pages: authorised by the render token instead of a session.
        app.MapGet("/api/v1/render/sets/{id:guid}", async (Guid id, int? variant, string? token, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok<RenderedPaper>(await d.Query(new RenderSetPaper.Query(id, variant ?? 0, token), ct)))
            .WithTags("Render")
            .WithName("renderSetPaper")
            .AllowAnonymous()
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status404NotFound);
    }
}

using EProshno.Api.Common;
using EProshno.Core.Questions;

namespace EProshno.Api.Features.QuestionBanks;

public static class QuestionBankEndpoints
{
    public static void Map(IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/v1/question-banks").WithTags("QuestionBanks").RequireAuthorization(Policies.Member);

        g.MapGet("/", async (Dispatcher d, CancellationToken ct) => TypedResults.Ok(await d.Query(new ListBanks.Query(), ct)))
            .WithName("listBanks");

        g.MapPost("/", async (SaveBank.Request body, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Send(new SaveBank.Command(null, body), ct)))
            .WithName("createBank")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status402PaymentRequired)
            .ProducesProblem(StatusCodes.Status403Forbidden);

        g.MapGet("/pending", async (string? cursor, int? limit, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Query(new ListPendingQuestions.Query(cursor, limit), ct)))
            .WithName("listPendingQuestions")
            .RequireAuthorization(Policies.InstitutionAdmin);

        g.MapGet("/{id:guid}", async (Guid id, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Query(new GetBank.Query(id), ct)))
            .WithName("getBank")
            .ProducesProblem(StatusCodes.Status404NotFound);

        g.MapPut("/{id:guid}", async (Guid id, SaveBank.Request body, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Send(new SaveBank.Command(id, body), ct)))
            .WithName("updateBank")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound);

        g.MapPost("/{id:guid}/archive", async (Guid id, Dispatcher d, CancellationToken ct) =>
            {
                await d.Send(new ArchiveBank.Command(id), ct);
                return TypedResults.NoContent();
            })
            .WithName("archiveBank")
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status409Conflict);

        g.MapPost("/{id:guid}/transfer", async (Guid id, TransferBank.Request body, Dispatcher d, CancellationToken ct) =>
            {
                await d.Send(new TransferBank.Command(id, body), ct);
                return TypedResults.NoContent();
            })
            .WithName("transferBank")
            .RequireAuthorization(Policies.InstitutionAdmin)
            .ProducesProblem(StatusCodes.Status404NotFound);

        g.MapGet("/{id:guid}/export", async (Guid id, ExportFormat? format, Dispatcher d, CancellationToken ct) =>
            {
                var file = await d.Query(new ExportBank.Query(id, format ?? ExportFormat.Xlsx), ct);
                return TypedResults.File(file.Content, file.ContentType, file.FileName);
            })
            .WithName("exportBank")
            .Produces(StatusCodes.Status200OK, contentType: "application/octet-stream")
            .ProducesProblem(StatusCodes.Status404NotFound);

        g.MapGet("/{id:guid}/questions", async (
                    Guid id, ContentStatus? status, Guid? subjectId, Guid? chapterId, QuestionType? type, Guid? tagId,
                    string? keyword, string? cursor, int? limit, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Query(
                    new ListBankQuestions.Query(id, status, subjectId, chapterId, type, tagId, keyword, cursor, limit), ct)))
            .WithName("listBankQuestions")
            .ProducesProblem(StatusCodes.Status404NotFound);

        g.MapPost("/{id:guid}/questions", async (Guid id, QuestionContent body, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Send(new SaveBankQuestion.Command(id, null, body), ct)))
            .WithName("createBankQuestion")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status402PaymentRequired)
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status409Conflict);

        g.MapGet("/{id:guid}/questions/{questionId:guid}", async (Guid id, Guid questionId, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Query(new GetBankQuestion.Query(id, questionId), ct)))
            .WithName("getBankQuestion")
            .ProducesProblem(StatusCodes.Status404NotFound);

        g.MapPut("/{id:guid}/questions/{questionId:guid}", async (Guid id, Guid questionId, QuestionContent body, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Send(new SaveBankQuestion.Command(id, questionId, body), ct)))
            .WithName("updateBankQuestion")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        g.MapDelete("/{id:guid}/questions/{questionId:guid}", async (Guid id, Guid questionId, Dispatcher d, CancellationToken ct) =>
            {
                await d.Send(new DeleteBankQuestion.Command(id, questionId), ct);
                return TypedResults.NoContent();
            })
            .WithName("deleteBankQuestion")
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound);

        g.MapPost("/{id:guid}/questions/bulk", async (Guid id, BulkBankQuestions.Request body, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Send(new BulkBankQuestions.Command(id, body), ct)))
            .WithName("bulkBankQuestions")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status409Conflict);

        g.MapPost("/{id:guid}/questions/{questionId:guid}/review", async (
                Guid id, Guid questionId, ReviewBankQuestion.Request body, Dispatcher d, CancellationToken ct) =>
            {
                await d.Send(new ReviewBankQuestion.Command(id, questionId, body), ct);
                return TypedResults.NoContent();
            })
            .WithName("reviewBankQuestion")
            .RequireAuthorization(Policies.InstitutionAdmin)
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status409Conflict);

        var tags = app.MapGroup("/api/v1/question-tags").WithTags("QuestionBanks").RequireAuthorization(Policies.Member);

        tags.MapGet("/", async (Dispatcher d, CancellationToken ct) => TypedResults.Ok(await d.Query(new ListTags.Query(), ct)))
            .WithName("listTags");

        tags.MapPost("/", async (CreateTag.Command command, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Send(command, ct)))
            .WithName("createTag")
            .ProducesValidationProblem();

        tags.MapDelete("/{id:guid}", async (Guid id, Dispatcher d, CancellationToken ct) =>
            {
                await d.Send(new DeleteTag.Command(id), ct);
                return TypedResults.NoContent();
            })
            .WithName("deleteTag")
            .RequireAuthorization(Policies.InstitutionAdmin)
            .ProducesProblem(StatusCodes.Status404NotFound);
    }
}

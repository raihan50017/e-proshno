using EProshno.Api.Common;
using EProshno.Core.Imports;
using EProshno.Core.Questions;

namespace EProshno.Api.Features.Imports;

public static class ImportEndpoints
{
    public static void Map(IEndpointRouteBuilder app)
    {
        // Templates are also used by the content team, who may have no institution.
        app.MapGet("/api/v1/imports/templates/{type}", async (QuestionType type, Guid subjectId, Dispatcher d, CancellationToken ct) =>
            {
                var file = await d.Query(new GetImportTemplate.Query(type, subjectId), ct);
                return TypedResults.File(file.Content, file.ContentType, file.FileName);
            })
            .WithTags("Imports")
            .WithName("getImportTemplate")
            .RequireAuthorization()
            .Produces(StatusCodes.Status200OK, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound);

        var teacher = app.MapGroup("/api/v1/imports").WithTags("Imports").RequireAuthorization(Policies.Member);
        MapRoutes(teacher, platform: false);

        // The content team imports into the platform bank; questions land as Draft for review.
        var platform = app.MapGroup("/api/v1/admin/imports").WithTags("Admin").RequireAuthorization(Policies.ContentEditor);
        MapRoutes(platform, platform: true);
    }

    private static void MapRoutes(RouteGroupBuilder g, bool platform)
    {
        string Name(string verb, string noun) => platform ? $"{verb}Platform{noun}" : $"{verb}{noun}";

        g.MapPost("/uploads", async (IFormFile file, Dispatcher d, CancellationToken ct) =>
            {
                await using var stream = file.OpenReadStream();
                return TypedResults.Ok(await d.Send(new UploadImportFile.Command(stream, file.FileName) { Platform = platform }, ct));
            })
            .WithName(Name("upload", "ImportFile"))
            .RequireRateLimiting(RateLimits.Uploads)
            .DisableAntiforgery()
            .ProducesProblem(StatusCodes.Status413PayloadTooLarge)
            .ProducesProblem(StatusCodes.Status415UnsupportedMediaType);

        g.MapPost("/", async (CreateImport.Command command, Dispatcher d, CancellationToken ct) =>
                TypedResults.Accepted((string?)null, await d.Send(command with { Platform = platform }, ct)))
            .WithName(Name("create", "Import"))
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status402PaymentRequired)
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status429TooManyRequests);

        g.MapGet("/", async (Guid? bankId, string? cursor, int? limit, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Query(new ListImports.Query(bankId, cursor, limit) { Platform = platform }, ct)))
            .WithName(Name("list", "Imports"));

        g.MapGet("/{id:guid}", async (Guid id, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Query(new GetImport.Query(id) { Platform = platform }, ct)))
            .WithName(Name("get", "Import"))
            .ProducesProblem(StatusCodes.Status404NotFound);

        g.MapPut("/{id:guid}/column-map", async (Guid id, SetImportColumnMap.Request body, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Send(new SetImportColumnMap.Command(id, body) { Platform = platform }, ct)))
            .WithName(Name("set", "ImportColumnMap"))
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        g.MapGet("/{id:guid}/rows", async (Guid id, ImportRowStatus? status, string? cursor, int? limit, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Query(new ListImportRows.Query(id, status, cursor, limit) { Platform = platform }, ct)))
            .WithName(Name("list", "ImportRows"))
            .ProducesProblem(StatusCodes.Status404NotFound);

        g.MapPatch("/{id:guid}/rows/{rowId:guid}", async (Guid id, Guid rowId, UpdateImportRow.Request body, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Send(new UpdateImportRow.Command(id, rowId, body) { Platform = platform }, ct)))
            .WithName(Name("update", "ImportRow"))
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        g.MapPost("/{id:guid}/commit", async (Guid id, Dispatcher d, CancellationToken ct) =>
                TypedResults.Accepted((string?)null, await d.Send(new CommitImport.Command(id) { Platform = platform }, ct)))
            .WithName(Name("commit", "Import"))
            .ProducesProblem(StatusCodes.Status402PaymentRequired)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        g.MapPost("/{id:guid}/rollback", async (Guid id, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Send(new RollbackImport.Command(id) { Platform = platform }, ct)))
            .WithName(Name("rollback", "Import"))
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        g.MapGet("/{id:guid}/error-report", async (Guid id, Dispatcher d, CancellationToken ct) =>
            {
                var file = await d.Query(new GetImportErrorReport.Query(id) { Platform = platform }, ct);
                return TypedResults.File(file.Content, file.ContentType, file.FileName);
            })
            .WithName(Name("get", "ImportErrorReport"))
            .Produces(StatusCodes.Status200OK, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            .ProducesProblem(StatusCodes.Status404NotFound);
    }
}

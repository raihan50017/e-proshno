using EProshno.Api.Common;

namespace EProshno.Api.Features.Taxonomy;

public static class TaxonomyEndpoints
{
    public static void Map(IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/v1/taxonomy").WithTags("Taxonomy").RequireAuthorization();

        g.MapGet("/levels", async (Dispatcher d, CancellationToken ct) => TypedResults.Ok(await d.Query(new ListLevels.Query(), ct)))
            .WithName("listLevels");

        g.MapGet("/subjects", async (Guid? levelId, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Query(new ListSubjects.Query(levelId), ct)))
            .WithName("listSubjects");

        g.MapGet("/subjects/{subjectId:guid}/chapters", async (Guid subjectId, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Query(new ListChapters.Query(subjectId), ct)))
            .WithName("listChapters")
            .ProducesProblem(StatusCodes.Status404NotFound);

        g.MapGet("/boards", async (Dispatcher d, CancellationToken ct) => TypedResults.Ok(await d.Query(new ListBoards.Query(), ct)))
            .WithName("listBoards");

        g.MapGet("/freshness", async (Dispatcher d, CancellationToken ct) => TypedResults.Ok(await d.Query(new GetFreshness.Query(), ct)))
            .WithName("getFreshness");

        // The institution's own syllabus (admission batches, job-exam prep, coaching modules).
        var custom = g.MapGroup("/custom").RequireAuthorization(Policies.Member);
        MapEditing(custom, official: false, prefix: "Custom");

        // The official syllabus, edited by the content team.
        var official = app.MapGroup("/api/v1/admin/taxonomy").WithTags("Admin").RequireAuthorization(Policies.ContentEditor);
        MapEditing(official, official: true, prefix: "Official");
    }

    private static void MapEditing(RouteGroupBuilder g, bool official, string prefix)
    {
        g.MapPost("/subjects", async (SaveSubject.Request body, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Send(new SaveSubject.Command(null, body) { Official = official }, ct)))
            .WithName($"create{prefix}Subject")
            .ProducesValidationProblem();

        g.MapPut("/subjects/{id:guid}", async (Guid id, SaveSubject.Request body, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Send(new SaveSubject.Command(id, body) { Official = official }, ct)))
            .WithName($"update{prefix}Subject")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound);

        g.MapPost("/chapters", async (SaveChapter.Request body, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Send(new SaveChapter.Command(null, body) { Official = official }, ct)))
            .WithName($"create{prefix}Chapter")
            .ProducesValidationProblem();

        g.MapPut("/chapters/{id:guid}", async (Guid id, SaveChapter.Request body, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Send(new SaveChapter.Command(id, body) { Official = official }, ct)))
            .WithName($"update{prefix}Chapter")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound);

        g.MapPost("/topics", async (SaveTopic.Request body, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Send(new SaveTopic.Command(null, body) { Official = official }, ct)))
            .WithName($"create{prefix}Topic")
            .ProducesValidationProblem();

        g.MapPut("/topics/{id:guid}", async (Guid id, SaveTopic.Request body, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Send(new SaveTopic.Command(id, body) { Official = official }, ct)))
            .WithName($"update{prefix}Topic")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound);

        var delete = g.MapDelete("/{kind}/{id:guid}", async (SyllabusItemKind kind, Guid id, Dispatcher d, CancellationToken ct) =>
            {
                await d.Send(new DeleteSyllabusItem.Command(kind, id) { Official = official }, ct);
                return TypedResults.NoContent();
            })
            .WithName($"delete{prefix}SyllabusItem")
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        if (!official)
        {
            delete.RequireAuthorization(Policies.InstitutionAdmin);
        }
    }
}

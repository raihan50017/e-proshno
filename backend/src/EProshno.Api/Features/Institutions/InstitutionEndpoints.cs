using EProshno.Api.Common;

namespace EProshno.Api.Features.Institutions;

public static class InstitutionEndpoints
{
    public static void Map(IEndpointRouteBuilder app)
    {
        app.MapPost("/api/v1/institutions", async (CreateInstitution.Command command, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Send(command, ct)))
            .WithTags("Institution")
            .WithName("createInstitution")
            .RequireAuthorization()
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status409Conflict);

        var g = app.MapGroup("/api/v1/institution").WithTags("Institution").RequireAuthorization(Policies.Member);

        g.MapGet("/", async (Dispatcher d, CancellationToken ct) => TypedResults.Ok(await d.Query(new GetInstitution.Query(), ct)))
            .WithName("getInstitution");

        g.MapPut("/", async (UpdateInstitution.Command command, Dispatcher d, CancellationToken ct) =>
            {
                await d.Send(command, ct);
                return TypedResults.NoContent();
            })
            .WithName("updateInstitution")
            .RequireAuthorization(Policies.InstitutionAdmin)
            .ProducesValidationProblem();

        g.MapPost("/logo", async (IFormFile file, Dispatcher d, CancellationToken ct) =>
            {
                await using var stream = file.OpenReadStream();
                return TypedResults.Ok(await d.Send(new UploadLogo.Command(stream), ct));
            })
            .WithName("uploadInstitutionLogo")
            .RequireAuthorization(Policies.InstitutionAdmin)
            .RequireRateLimiting(RateLimits.Uploads)
            .DisableAntiforgery()
            .ProducesProblem(StatusCodes.Status413PayloadTooLarge)
            .ProducesProblem(StatusCodes.Status415UnsupportedMediaType);

        g.MapPut("/paper-defaults", async (UpdatePaperDefaults.Command command, Dispatcher d, CancellationToken ct) =>
            {
                await d.Send(command, ct);
                return TypedResults.NoContent();
            })
            .WithName("updatePaperDefaults")
            .RequireAuthorization(Policies.InstitutionAdmin)
            .ProducesValidationProblem();

        g.MapGet("/members", async (Dispatcher d, CancellationToken ct) => TypedResults.Ok(await d.Query(new ListMembers.Query(), ct)))
            .WithName("listMembers");

        g.MapPut("/members/{userId:guid}", async (Guid userId, ChangeMemberRole.Request body, Dispatcher d, CancellationToken ct) =>
            {
                await d.Send(new ChangeMemberRole.Command(userId, body), ct);
                return TypedResults.NoContent();
            })
            .WithName("changeMemberRole")
            .RequireAuthorization(Policies.InstitutionAdmin)
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        g.MapDelete("/members/{userId:guid}", async (Guid userId, Dispatcher d, CancellationToken ct) =>
            {
                await d.Send(new RemoveMember.Command(userId), ct);
                return TypedResults.NoContent();
            })
            .WithName("removeMember")
            .RequireAuthorization(Policies.InstitutionAdmin)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        g.MapGet("/invitations", async (Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Query(new ListInvitations.Query(), ct)))
            .WithName("listInvitations")
            .RequireAuthorization(Policies.InstitutionAdmin);

        g.MapPost("/invitations", async (CreateInvitation.Command command, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Send(command, ct)))
            .WithName("createInvitation")
            .RequireAuthorization(Policies.InstitutionAdmin)
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status402PaymentRequired);

        g.MapDelete("/invitations/{id:guid}", async (Guid id, Dispatcher d, CancellationToken ct) =>
            {
                await d.Send(new RevokeInvitation.Command(id), ct);
                return TypedResults.NoContent();
            })
            .WithName("revokeInvitation")
            .RequireAuthorization(Policies.InstitutionAdmin)
            .ProducesProblem(StatusCodes.Status404NotFound);

        g.MapGet("/activity", async (Guid? userId, string? cursor, int? limit, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Query(new ListActivity.Query(userId, cursor, limit), ct)))
            .WithName("listActivity")
            .RequireAuthorization(Policies.InstitutionAdmin);

        var invites = app.MapGroup("/api/v1/invitations").WithTags("Institution");

        invites.MapGet("/{token}", async (string token, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Query(new GetInvitation.Query(token), ct)))
            .WithName("getInvitation")
            .AllowAnonymous()
            .RequireRateLimiting(RateLimits.Login)
            .ProducesProblem(StatusCodes.Status404NotFound);

        invites.MapPost("/{token}/accept", async (string token, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Send(new AcceptInvitation.Command(token), ct)))
            .WithName("acceptInvitation")
            .RequireAuthorization()
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status409Conflict);
    }
}

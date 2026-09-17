using EProshno.Api.Common;
using EProshno.Core.Common;
using EProshno.Infrastructure.Papers;
using EProshno.Infrastructure.Storage;
using Microsoft.Net.Http.Headers;

namespace EProshno.Api.Features.Files;

public static class UploadImage
{
    /// <param name="Platform">Content team: store as platform media instead of institution media.</param>
    public sealed record Command(Stream Content, bool Platform) : ICommand<Response>;

    public sealed record Response(string Url);

    /// <summary>Images for the question editor. Validated by content and stored under an unguessable key.</summary>
    internal sealed class Handler(ITenantContext tenant, MediaService media) : ICommandHandler<Command, Response>
    {
        public async Task<Response> Handle(Command command, CancellationToken ct)
        {
            Guid? owner;
            if (command.Platform)
            {
                if (!tenant.IsContentTeam)
                {
                    throw AppException.Forbidden();
                }

                owner = null;
            }
            else
            {
                owner = tenant.InstitutionId;
            }

            var stored = await media.SaveImageAsync(command.Content, owner, ct);
            return new Response(stored.Url);
        }
    }
}

public static class FileEndpoints
{
    public static void Map(IEndpointRouteBuilder app)
    {
        app.MapPost("/api/v1/media/images", async (IFormFile file, bool? platform, Dispatcher d, CancellationToken ct) =>
            {
                await using var stream = file.OpenReadStream();
                return TypedResults.Ok(await d.Send(new UploadImage.Command(stream, platform ?? false), ct));
            })
            .WithTags("Files")
            .WithName("uploadImage")
            .RequireAuthorization()
            .RequireRateLimiting(RateLimits.Uploads)
            .DisableAntiforgery()
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status413PayloadTooLarge)
            .ProducesProblem(StatusCodes.Status415UnsupportedMediaType);

        // Question images and logos: public, but only under unguessable keys and only the media/ and logos/ prefixes.
        app.MapGet("/api/v1/media/{**key}", async Task<IResult> (string key, IObjectStorage storage, HttpContext http, CancellationToken ct) =>
            {
                if (!MediaUrls.IsPublicKey(key))
                {
                    return TypedResults.NotFound();
                }

                var stored = await storage.GetAsync(key, ct);
                if (stored is null)
                {
                    return TypedResults.NotFound();
                }

                http.Response.Headers.CacheControl = "public, max-age=31536000, immutable";
                SetSafeHeaders(http);
                return TypedResults.Stream(stored.Content, StorageKeys.ContentTypeFor(key));
            })
            .WithTags("Files")
            .WithName("getMedia")
            .AllowAnonymous()
            .ExcludeFromDescription();

        // Private files (PDFs, exports): HMAC-signed, expiring links issued by the API.
        app.MapGet("/api/v1/files/{**key}", async Task<IResult> (
                string key, long? exp, string? sig, string? name, IObjectStorage storage, FileUrlSigner signer, HttpContext http, CancellationToken ct) =>
            {
                if (!StorageKeys.IsSafe(key) || exp is null || string.IsNullOrEmpty(sig) || !signer.IsValid(key, exp.Value, sig))
                {
                    return TypedResults.NotFound();
                }

                var stored = await storage.GetAsync(key, ct);
                if (stored is null)
                {
                    return TypedResults.NotFound();
                }

                http.Response.Headers.CacheControl = "private, no-store";
                SetSafeHeaders(http);
                var fileName = string.IsNullOrWhiteSpace(name) ? Path.GetFileName(key) : Path.GetFileName(name);
                return TypedResults.Stream(stored.Content, StorageKeys.ContentTypeFor(key), fileName);
            })
            .WithTags("Files")
            .WithName("getFile")
            .AllowAnonymous()
            .ExcludeFromDescription();
    }

    private static void SetSafeHeaders(HttpContext http)
    {
        http.Response.Headers[HeaderNames.XContentTypeOptions] = "nosniff";
        http.Response.Headers[HeaderNames.ContentSecurityPolicy] = "default-src 'none'; sandbox";
    }
}

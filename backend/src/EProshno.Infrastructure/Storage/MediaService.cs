using EProshno.Core.Common;
using EProshno.Infrastructure.Papers;

namespace EProshno.Infrastructure.Storage;

public sealed record StoredMedia(string Key, string Url, string ContentType, long Size);

/// <summary>Validates uploaded images by content (never by name) and stores them under unguessable keys.</summary>
public sealed class MediaService(IObjectStorage storage)
{
    public const long MaxImageBytes = 5L * 1024 * 1024;
    public const long MaxLogoBytes = 1L * 1024 * 1024;

    public async Task<StoredMedia> SaveImageAsync(Stream content, Guid? institutionId, CancellationToken ct) =>
        await SaveAsync(content, MaxImageBytes, ext => StorageKeys.Media(institutionId, ext), ct);

    public async Task<StoredMedia> SaveLogoAsync(Stream content, Guid institutionId, CancellationToken ct) =>
        await SaveAsync(content, MaxLogoBytes, ext => StorageKeys.Logo(institutionId, ext), ct);

    private async Task<StoredMedia> SaveAsync(Stream content, long maxBytes, Func<string, string> keyFor, CancellationToken ct)
    {
        var (type, bytes) = await FileSignature.ReadAndSniffAsync(content, maxBytes, ct);
        var extension = type switch
        {
            SniffedType.Png => ".png",
            SniffedType.Jpeg => ".jpg",
            SniffedType.Webp => ".webp",
            _ => throw new AppException("file.type", Messages.InvalidFileType, 415),
        };

        var key = keyFor(extension);
        var contentType = StorageKeys.ContentTypeFor(key);
        using var stream = new MemoryStream(bytes, writable: false);
        await storage.PutAsync(key, stream, contentType, ct);
        return new StoredMedia(key, MediaUrls.For(key)!, contentType, bytes.Length);
    }
}

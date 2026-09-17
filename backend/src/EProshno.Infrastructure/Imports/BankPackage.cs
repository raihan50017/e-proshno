using System.IO.Compression;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using EProshno.Core.Common;
using EProshno.Core.Content;
using EProshno.Core.Imports;
using EProshno.Infrastructure.Persistence;
using EProshno.Infrastructure.Storage;

namespace EProshno.Infrastructure.Imports;

public sealed record BankPackageInfo(string Name, string? Level, string? Subject);

public sealed record BankPackageSyllabusItem(int ChapterNumber, string ChapterName, IReadOnlyList<string> Topics);

public sealed record BankPackageDocument(
    string Format,
    int Version,
    BankPackageInfo Bank,
    IReadOnlyList<BankPackageSyllabusItem> Syllabus,
    IReadOnlyList<QuestionDraft> Questions)
{
    public const string FormatName = "eproshno.bank";
    public const int CurrentVersion = 1;
}

/// <summary>
/// JSON bank package: a zip with <c>bank.json</c> and <c>media/</c>. Used for backups and for moving a bank between
/// accounts. Only questions from the institution's own banks are ever written.
/// </summary>
public static partial class BankPackage
{
    private const string DocumentEntry = "bank.json";
    private const string MediaFolder = "media/";

    public static async Task<byte[]> WriteAsync(BankPackageDocument document, IObjectStorage storage, CancellationToken ct)
    {
        using var ms = new MemoryStream();
        using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, leaveOpen: true))
        {
            var media = new Dictionary<string, string>(StringComparer.Ordinal);
            var questions = new List<QuestionDraft>();
            foreach (var q in document.Questions)
            {
                questions.Add(await RewriteImagesAsync(q, async src =>
                {
                    if (media.TryGetValue(src, out var existing))
                    {
                        return existing;
                    }

                    var key = src[RichContent.MediaUrlPrefix.Length..];
                    var stored = StorageKeys.IsSafe(key) ? await storage.GetAsync(key, ct) : null;
                    if (stored is null)
                    {
                        return src;
                    }

                    var name = $"{MediaFolder}{media.Count + 1}{Path.GetExtension(key)}";
                    await using (stored.Content)
                    {
                        var entry = zip.CreateEntry(name, CompressionLevel.Fastest);
                        await using var target = entry.Open();
                        await stored.Content.CopyToAsync(target, ct);
                    }

                    media[src] = name;
                    return name;
                }));
            }

            var entryJson = zip.CreateEntry(DocumentEntry, CompressionLevel.Optimal);
            await using var stream = entryJson.Open();
            await JsonSerializer.SerializeAsync(stream, document with { Questions = questions }, AppJson.Options, ct);
        }

        return ms.ToArray();
    }

    /// <summary>
    /// Reads and checks a package. Images are validated, stored under the institution's media prefix, and the
    /// drafts are rewritten to point at them.
    /// </summary>
    public static async Task<BankPackageDocument> ReadAsync(byte[] bytes, Guid? institutionId, IObjectStorage storage, CancellationToken ct)
    {
        using var ms = new MemoryStream(bytes, writable: false);
        ZipArchive zip;
        try
        {
            zip = new ZipArchive(ms, ZipArchiveMode.Read);
        }
        catch (InvalidDataException)
        {
            throw Invalid();
        }

        using (zip)
        {
            if (zip.Entries.Count > ImportLimitsExt.MaxPackageEntries
                || zip.Entries.Sum(e => e.Length) > ImportLimitsExt.MaxPackageUncompressed
                || zip.Entries.Any(e => e.FullName.Contains("..", StringComparison.Ordinal)
                                        || e.FullName.StartsWith('/')
                                        || e.FullName.Contains('\\', StringComparison.Ordinal)
                                        || e.FullName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase)))
            {
                throw Invalid();
            }

            var docEntry = zip.GetEntry(DocumentEntry);
            if (docEntry is null || docEntry.Length > ImportLimits.MaxFileBytes)
            {
                throw Invalid();
            }

            BankPackageDocument? document;
            try
            {
                await using var stream = docEntry.Open();
                document = await JsonSerializer.DeserializeAsync<BankPackageDocument>(stream, AppJson.Options, ct);
            }
            catch (JsonException)
            {
                throw Invalid();
            }

            if (document is null
                || document.Format != BankPackageDocument.FormatName
                || document.Version != BankPackageDocument.CurrentVersion
                || document.Questions is null)
            {
                throw Invalid();
            }

            var stored = new Dictionary<string, string?>(StringComparer.Ordinal);
            var questions = new List<QuestionDraft>();
            foreach (var q in document.Questions)
            {
                questions.Add(await RewriteImagesAsync(q, async name =>
                {
                    if (stored.TryGetValue(name, out var url))
                    {
                        return url ?? name;
                    }

                    url = await StoreImageAsync(zip.GetEntry(name), institutionId, storage, ct);
                    stored[name] = url;
                    return url ?? name;
                }));
            }

            return document with { Questions = questions };
        }
    }

    private static async Task<string?> StoreImageAsync(ZipArchiveEntry? entry, Guid? institutionId, IObjectStorage storage, CancellationToken ct)
    {
        if (entry is null || !entry.FullName.StartsWith(MediaFolder, StringComparison.Ordinal) || entry.Length > ImportLimitsExt.MaxImageBytes)
        {
            return null;
        }

        await using var source = entry.Open();
        var (type, bytes) = await FileSignature.ReadAndSniffAsync(source, ImportLimitsExt.MaxImageBytes, ct);
        var extension = type switch
        {
            SniffedType.Png => ".png",
            SniffedType.Jpeg => ".jpg",
            SniffedType.Webp => ".webp",
            _ => null,
        };
        if (extension is null)
        {
            return null;
        }

        var key = StorageKeys.Media(institutionId, extension);
        using var content = new MemoryStream(bytes, writable: false);
        await storage.PutAsync(key, content, StorageKeys.ContentTypeFor(key), ct);
        return RichContent.MediaUrlPrefix + key;
    }

    /// <summary>Applies <paramref name="map"/> to every <c>[ছবি: …]</c> reference in the draft's text fields.</summary>
    private static async Task<QuestionDraft> RewriteImagesAsync(QuestionDraft d, Func<string, Task<string>> map)
    {
        async Task<string?> Rewrite(string? text)
        {
            if (string.IsNullOrEmpty(text) || !text.Contains("[ছবি:", StringComparison.Ordinal))
            {
                return text;
            }

            var sb = new StringBuilder();
            var pos = 0;
            foreach (Match m in ImageRef().Matches(text))
            {
                sb.Append(text, pos, m.Index - pos);
                sb.Append("[ছবি: ").Append(await map(m.Groups[1].Value.Trim())).Append(']');
                pos = m.Index + m.Length;
            }

            sb.Append(text, pos, text.Length - pos);
            return sb.ToString();
        }

        var options = new List<string>();
        foreach (var o in d.Options)
        {
            options.Add(await Rewrite(o) ?? "");
        }

        var statements = new List<string>();
        foreach (var s in d.Statements)
        {
            statements.Add(await Rewrite(s) ?? "");
        }

        var parts = new List<DraftCqPart>();
        foreach (var p in d.CqParts)
        {
            parts.Add(p with { Prompt = await Rewrite(p.Prompt) ?? "", Answer = await Rewrite(p.Answer) });
        }

        return d with
        {
            Stem = await Rewrite(d.Stem) ?? "",
            StemTail = await Rewrite(d.StemTail),
            Stimulus = await Rewrite(d.Stimulus),
            Explanation = await Rewrite(d.Explanation),
            Options = options,
            Statements = statements,
            CqParts = parts,
        };
    }

    private static AppException Invalid() => new("import.invalid_package", Messages.ImportInvalidPackage);

    [GeneratedRegex(@"\[ছবি:\s*([^\]]+)\]", RegexOptions.None, matchTimeoutMilliseconds: 200)]
    private static partial Regex ImageRef();
}

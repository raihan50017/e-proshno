using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using EProshno.Core.Common;
using EProshno.Core.Papers;
using EProshno.Core.Questions;
using EProshno.Core.Text;
using EProshno.Infrastructure.Persistence;
using EProshno.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace EProshno.Infrastructure.Papers;

public sealed class RenderOptions
{
    public const string Section = "Render";

    /// <summary>Origin of the SPA that Chromium opens (the /print routes).</summary>
    public string WebUrl { get; set; } = "http://localhost:5173";

    /// <summary>HMAC key for render tokens, at least 32 bytes.</summary>
    public string Secret { get; set; } = "";

    public int TokenMinutes { get; set; } = 2;

    /// <summary>Bump when print CSS or PaperDocument changes, so cached PDFs are rebuilt.</summary>
    public string RendererVersion { get; set; } = "1";

    public int TimeoutSeconds { get; set; } = 60;
}

public sealed record PaperHeaderInfo(
    string InstitutionName,
    string? InstitutionAddress,
    string? LogoUrl,
    string Title,
    string LevelName,
    string SubjectName,
    IReadOnlyList<string> ChapterNames,
    int DurationMin,
    decimal FullMarks,
    QuestionType Type);

/// <summary>Everything the print page needs for one variant; the React PaperDocument only renders it.</summary>
public sealed record RenderedPaper(
    Guid SetId,
    int ItemsVersion,
    int Variant,
    string VariantLabel,
    PaperHeaderInfo Header,
    PaperSettings Settings,
    IReadOnlyList<PaperBlock> Blocks,
    IReadOnlyList<AnswerKeyEntry> AnswerKey,
    int QuestionCount,
    decimal TotalMarks);

/// <summary>Loads a set (tenant filter applies) and composes one variant with <see cref="PaperComposer"/>.</summary>
public sealed class PaperLoader(AppDbContext db)
{
    public async Task<RenderedPaper> LoadAsync(Guid setId, int variant, CancellationToken ct)
    {
        var set = await db.QuestionSets.AsNoTracking()
            .Where(s => s.Id == setId)
            .Select(s => new
            {
                s.Id,
                s.Title,
                s.Type,
                s.ChapterIds,
                s.DurationMin,
                s.FullMarks,
                s.Settings,
                s.ItemsVersion,
                s.InstitutionId,
                LevelName = db.Levels.Where(l => l.Id == s.LevelId).Select(l => l.NameBn).FirstOrDefault(),
                Subject = db.Subjects.Where(x => x.Id == s.SubjectId).Select(x => new { x.NameBn, x.Paper }).FirstOrDefault(),
                Institution = db.Institutions.Where(i => i.Id == s.InstitutionId).Select(i => new { i.Name, i.Address, i.LogoKey }).FirstOrDefault(),
            })
            .FirstOr404Async(ct);

        if (variant < 0 || variant >= Math.Clamp(set.Settings.Variants, 1, PaperComposer.MaxVariants))
        {
            throw new AppException("paper.variant", Messages.InvalidVariant);
        }

        var chapters = await db.Chapters.AsNoTracking()
            .Where(c => set.ChapterIds.Contains(c.Id))
            .OrderBy(c => c.Number)
            .Select(c => new { c.Number, c.NameBn })
            .ToListAsync(ct);

        var items = await LoadItemsAsync(setId, ct);
        var body = PaperComposer.Compose(items, set.Settings, variant);

        return new RenderedPaper(
            set.Id,
            set.ItemsVersion,
            variant,
            PaperComposer.VariantLabels[variant],
            new PaperHeaderInfo(
                set.Institution?.Name ?? "",
                set.Institution?.Address,
                MediaUrls.For(set.Institution?.LogoKey),
                set.Title,
                set.LevelName ?? "",
                SubjectLabel(set.Subject?.NameBn, set.Subject?.Paper),
                chapters.Select(c => ChapterLabel(c.Number, c.NameBn)).ToList(),
                set.DurationMin,
                set.FullMarks,
                set.Type),
            set.Settings,
            body.Blocks,
            body.AnswerKey,
            items.Count,
            items.Sum(i => i.Marks));
    }

    public async Task<List<ComposerItem>> LoadItemsAsync(Guid setId, CancellationToken ct)
    {
        var rows = await db.QuestionSetItems.AsNoTracking()
            .Where(i => i.SetId == setId)
            .Select(i => new
            {
                i.QuestionId,
                i.Position,
                i.Marks,
                i.Question!.Type,
                i.Question.McqKind,
                i.Question.StimulusId,
                Stimulus = i.Question.Stimulus != null ? i.Question.Stimulus.Content : null,
                i.Question.Stem,
                i.Question.Explanation,
                i.Question.Importance,
                Options = i.Question.Options.Select(o => new ComposerOption(o.Index, o.Content, o.IsCorrect)).ToList(),
                Parts = i.Question.CqParts.Select(p => new ComposerCqPart(p.Part, p.Prompt, p.Marks, p.Answer)).ToList(),
                Boards = i.Question.Appearances
                    .Where(a => a.Source == ExamSource.Board && a.Board != null)
                    .Select(a => new { a.Board!.ShortBn, a.Year })
                    .ToList(),
            })
            .AsSplitQuery()
            .ToListAsync(ct);

        return rows.Select(r => new ComposerItem(
            r.QuestionId,
            r.Position,
            r.Marks,
            r.Type,
            r.McqKind,
            r.StimulusId,
            r.Stimulus,
            r.Stem,
            r.Options,
            r.Parts,
            r.Explanation,
            BoardTags(r.Boards.Select(b => (b.ShortBn, b.Year))),
            r.Importance)).ToList();
    }

    /// <summary>Newest first, at most three, then "+N".</summary>
    public static IReadOnlyList<string> BoardTags(IEnumerable<(string ShortBn, int Year)> appearances)
    {
        var ordered = appearances.OrderByDescending(a => a.Year).ThenBy(a => a.ShortBn, StringComparer.Ordinal).ToList();
        var tags = ordered.Take(QuestionRules.MaxBoardTagsShown).Select(a => QuestionRules.BoardTag(a.ShortBn, a.Year)).ToList();
        if (ordered.Count > QuestionRules.MaxBoardTagsShown)
        {
            tags.Add("+" + BanglaText.ToBanglaDigits(ordered.Count - QuestionRules.MaxBoardTagsShown));
        }

        return tags;
    }

    /// <summary>"অধ্যায় ১ - তাপগতিবিদ্যা".</summary>
    public static string ChapterLabel(int number, string name) =>
        $"{BanglaWords.Chapter} {BanglaText.ToBanglaDigits(number)} - {name}";

    public static string SubjectLabel(string? name, int? paper) => paper switch
    {
        1 => $"{name} ১ম পত্র",
        2 => $"{name} ২য় পত্র",
        _ => name ?? "",
    };

    /// <summary>
    /// Content-addressed PDF key: changes whenever items, settings, header data or the renderer change.
    /// </summary>
    public async Task<string> CacheKeyAsync(Guid setId, int variant, string rendererVersion, CancellationToken ct)
    {
        var data = await db.QuestionSets.AsNoTracking()
            .Where(s => s.Id == setId)
            .Select(s => new
            {
                s.ItemsVersion,
                s.Settings,
                s.UpdatedAt,
                InstitutionUpdatedAt = db.Institutions.Where(i => i.Id == s.InstitutionId).Select(i => i.UpdatedAt).FirstOrDefault(),
            })
            .FirstOr404Async(ct);

        var settingsJson = JsonSerializer.Serialize(data.Settings, AppJson.Options);
        var input = string.Join('|',
            setId.ToString("N"),
            data.ItemsVersion.ToString(CultureInfo.InvariantCulture),
            settingsJson,
            variant.ToString(CultureInfo.InvariantCulture),
            rendererVersion,
            data.UpdatedAt.UtcTicks.ToString(CultureInfo.InvariantCulture),
            data.InstitutionUpdatedAt.UtcTicks.ToString(CultureInfo.InvariantCulture));
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(input))).ToLowerInvariant();
    }
}

/// <summary>Resource names signed into render tokens.</summary>
public static class RenderResources
{
    public const string Set = "set";
    public const string Invoice = "invoice";
}

/// <summary>
/// Short-lived HMAC tokens that let the Worker's Chromium load one print page without a user session.
/// Format: <c>{institutionId:N}.{expUnix}.{sigHex}</c> over <c>resource|id|variant|institution|exp</c>.
/// </summary>
public sealed class RenderTokenService(IOptions<RenderOptions> options, TimeProvider clock)
{
    public string Create(string resource, Guid id, int variant, Guid institutionId)
    {
        var exp = clock.GetUtcNow().AddMinutes(options.Value.TokenMinutes).ToUnixTimeSeconds();
        return $"{institutionId:N}.{exp.ToString(CultureInfo.InvariantCulture)}.{Sign(resource, id, variant, institutionId, exp)}";
    }

    /// <summary>Returns the institution the token was issued for, or null when forged or expired.</summary>
    public Guid? Validate(string resource, Guid id, int variant, string? token)
    {
        var parts = token?.Split('.') ?? [];
        if (parts.Length != 3
            || !Guid.TryParseExact(parts[0], "N", out var institutionId)
            || !long.TryParse(parts[1], NumberStyles.None, CultureInfo.InvariantCulture, out var exp)
            || exp < clock.GetUtcNow().ToUnixTimeSeconds())
        {
            return null;
        }

        var expected = Encoding.ASCII.GetBytes(Sign(resource, id, variant, institutionId, exp));
        var actual = Encoding.ASCII.GetBytes(parts[2]);
        return CryptographicOperations.FixedTimeEquals(expected, actual) ? institutionId : null;
    }

    private string Sign(string resource, Guid id, int variant, Guid institutionId, long exp)
    {
        var key = Encoding.UTF8.GetBytes(options.Value.Secret);
        if (key.Length < 32)
        {
            throw new InvalidOperationException("Render:Secret must be at least 32 bytes.");
        }

        var payload = Encoding.UTF8.GetBytes(
            $"{resource}|{id:N}|{variant.ToString(CultureInfo.InvariantCulture)}|{institutionId:N}|{exp.ToString(CultureInfo.InvariantCulture)}");
        return Convert.ToHexString(HMACSHA256.HashData(key, payload)).ToLowerInvariant();
    }
}

/// <summary>Stored images and logos are served publicly by the API under unguessable keys.</summary>
public static class MediaUrls
{
    public static string? For(string? key) => key is null ? null : Core.Content.RichContent.MediaUrlPrefix + key;

    /// <summary>Only these prefixes are public; imports, PDFs and exports need signed links.</summary>
    public static bool IsPublicKey(string key) =>
        StorageKeys.IsSafe(key)
        && (key.StartsWith("media/", StringComparison.Ordinal) || key.StartsWith("logos/", StringComparison.Ordinal));
}

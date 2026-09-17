using System.Globalization;
using System.Text.RegularExpressions;
using EProshno.Core.Common;
using EProshno.Core.Imports;
using EProshno.Core.Questions;
using EProshno.Core.Text;
using EProshno.Infrastructure.Persistence;
using EProshno.Infrastructure.Questions;
using Microsoft.EntityFrameworkCore;

namespace EProshno.Infrastructure.Imports;

public sealed record ResolvedRow(QuestionDraft Draft, List<ImportMessage> Messages, ImportRowStatus Status, Guid? DuplicateOfQuestionId);

/// <summary>Syllabus and boards for one import, loaded once.</summary>
public sealed class ResolverContext
{
    public required Guid SubjectId { get; init; }
    public required Guid? InstitutionId { get; init; }
    public required IReadOnlyList<ChapterRef> Chapters { get; init; }
    public required IReadOnlyList<BoardRef> Boards { get; init; }
}

public sealed record ChapterRef(Guid Id, int Number, string Name, IReadOnlyList<TopicRef> Topics);

public sealed record TopicRef(Guid Id, string Name);

public sealed record BoardRef(Guid Id, IReadOnlyList<string> Names);

/// <summary>
/// Database-backed checks for import rows: chapter/topic/board matching, the shared question validator and dedupe.
/// Used by the parse job and when a teacher edits a row in the preview.
/// </summary>
public sealed partial class DraftResolver(AppDbContext db, QuestionContentValidator validator)
{
    public const double FuzzyThreshold = 0.4;

    public async Task<ResolverContext> LoadAsync(Guid subjectId, Guid? institutionId, CancellationToken ct)
    {
        var chapters = await db.Chapters.AsNoTracking()
            .Where(c => c.SubjectId == subjectId && (c.InstitutionId == null || c.InstitutionId == institutionId))
            .OrderBy(c => c.Number)
            .Select(c => new
            {
                c.Id,
                c.Number,
                c.NameBn,
                Topics = c.Topics
                    .Where(t => t.InstitutionId == null || t.InstitutionId == institutionId)
                    .OrderBy(t => t.Sort)
                    .Select(t => new TopicRef(t.Id, t.NameBn))
                    .ToList(),
            })
            .ToListAsync(ct);

        var boards = await db.Boards.AsNoTracking().OrderBy(b => b.Sort).ToListAsync(ct);

        return new ResolverContext
        {
            SubjectId = subjectId,
            InstitutionId = institutionId,
            Chapters = chapters.Select(c => new ChapterRef(c.Id, c.Number, c.NameBn, c.Topics)).ToList(),
            Boards = boards.Select(b => new BoardRef(
                b.Id,
                new[] { b.ShortBn, b.NameBn, b.NameEn, b.Code, b.ShortBn + " বো", b.ShortBn + " বোর্ড" }
                    .Select(n => BanglaText.Normalize(n))
                    .Where(n => n.Length > 0)
                    .Distinct()
                    .ToList())).ToList(),
        };
    }

    /// <summary>
    /// Resolves references and validates each draft, then marks duplicates (earlier in the file, in the
    /// institution's banks, or — as a warning — in the platform bank).
    /// </summary>
    public async Task<List<ResolvedRow>> ResolveAsync(
        IReadOnlyList<CheckedDraft> drafts, ImportDefaults defaults, ResolverContext context, bool platformTarget, CancellationToken ct)
    {
        var resolved = drafts.Select(d => ResolveOne(d, defaults, context)).ToList();
        var hashes = resolved.Select(r => QuestionRules.Fingerprint(DraftMapper.ToContent(r.Draft, defaults))).ToList();

        var distinct = hashes.Distinct().ToList();
        var existing = new Dictionary<string, (Guid Id, bool Platform)>(StringComparer.Ordinal);
        foreach (var chunk in distinct.Chunk(1000))
        {
            var query = db.Questions.AsNoTracking().Where(q => chunk.Contains(q.ContentHash) && q.Status != ContentStatus.Archived);
            query = platformTarget
                ? query.Where(q => q.BankId == null)
                : query.Where(q => q.BankId == null
                    ? q.Status == ContentStatus.Published
                    : q.Bank!.InstitutionId == context.InstitutionId);
            var found = await query.Select(q => new { q.Id, q.ContentHash, Platform = q.BankId == null }).ToListAsync(ct);

            // Prefer an institution match (a real duplicate) over a platform match (a warning).
            foreach (var f in found.OrderBy(f => f.Platform))
            {
                existing.TryAdd(f.ContentHash, (f.Id, f.Platform));
            }
        }

        var seen = new HashSet<string>(StringComparer.Ordinal);
        var rows = new List<ResolvedRow>(resolved.Count);
        for (var i = 0; i < resolved.Count; i++)
        {
            var (draft, messages) = resolved[i];
            var duplicate = false;
            Guid? duplicateOf = null;
            if (!seen.Add(hashes[i]))
            {
                duplicate = true;
                messages.Add(Warn("stem", "duplicate.file", Messages.DuplicateInFile));
            }
            else if (existing.TryGetValue(hashes[i], out var match))
            {
                if (match.Platform && !platformTarget)
                {
                    messages.Add(Warn("stem", "duplicate.platform", Messages.DuplicateInPlatform));
                }
                else
                {
                    duplicate = true;
                    duplicateOf = match.Id;
                    messages.Add(Warn("stem", "duplicate.bank", platformTarget ? Messages.DuplicateInPlatform : Messages.DuplicateInInstitution));
                }
            }

            rows.Add(new ResolvedRow(draft, messages, ImportRow.StatusFor(messages, duplicate), duplicateOf));
        }

        return rows;
    }

    private (QuestionDraft Draft, List<ImportMessage> Messages) ResolveOne(CheckedDraft input, ImportDefaults defaults, ResolverContext context)
    {
        var messages = new List<ImportMessage>(input.Messages);
        var draft = input.Draft;

        // Chapter
        ChapterRef? chapter = null;
        if (string.IsNullOrWhiteSpace(draft.ChapterRef))
        {
            chapter = context.Chapters.FirstOrDefault(c => c.Id == (draft.ChapterId ?? defaults.ChapterId));
        }
        else
        {
            var reference = BanglaText.ToAsciiDigits(WithoutChapterWord(draft.ChapterRef));
            var number = LeadingNumber().Match(reference);
            if (number.Success && int.TryParse(number.Groups["n"].Value, NumberStyles.None, CultureInfo.InvariantCulture, out var n))
            {
                chapter = context.Chapters.FirstOrDefault(c => c.Number == n);
            }

            if (chapter is null)
            {
                var name = LeadingNumber().Replace(reference, "").Trim(' ', '-', '.', ':', '।');
                var wanted = BanglaText.Normalize(name);
                chapter = context.Chapters.FirstOrDefault(c => BanglaText.Normalize(c.Name) == wanted);
                if (chapter is null && wanted.Length > 0)
                {
                    var best = context.Chapters
                        .Select(c => (Chapter: c, Score: Trigram.Similarity(c.Name, name)))
                        .OrderByDescending(x => x.Score)
                        .FirstOrDefault();
                    if (best.Chapter is not null && best.Score >= FuzzyThreshold)
                    {
                        chapter = best.Chapter;
                        messages.Add(Warn("chapter", "chapter.fuzzy",
                            string.Format(CultureInfo.InvariantCulture, Messages.ParseChapterFuzzy, ChapterLabel(chapter))));
                    }
                }
            }
        }

        if (chapter is null)
        {
            messages.Add(Error("chapter", "chapter.not_found", Messages.ParseChapterNotFound));
        }

        // Topic (optional)
        TopicRef? topic = null;
        if (chapter is not null && !string.IsNullOrWhiteSpace(draft.TopicRef))
        {
            var wanted = BanglaText.Normalize(draft.TopicRef);
            topic = chapter.Topics.FirstOrDefault(t => BanglaText.Normalize(t.Name) == wanted)
                ?? chapter.Topics
                    .Select(t => (Topic: t, Score: Trigram.Similarity(t.Name, draft.TopicRef)))
                    .Where(x => x.Score >= FuzzyThreshold)
                    .OrderByDescending(x => x.Score)
                    .Select(x => x.Topic)
                    .FirstOrDefault();
            if (topic is null)
            {
                messages.Add(Warn("topic", "topic.not_found", Messages.ImportTopicNotFound));
            }
        }
        else if (chapter is not null && draft.TopicId is { } topicId)
        {
            topic = chapter.Topics.FirstOrDefault(t => t.Id == topicId);
        }

        // Board tags
        var tags = new List<DraftBoardTag>();
        foreach (var tag in draft.BoardTags)
        {
            var boardName = BanglaText.Normalize(QuestionTextParser.BoardName(tag.Raw));
            var board = tag.BoardId is { } known
                ? context.Boards.FirstOrDefault(b => b.Id == known)
                : context.Boards.FirstOrDefault(b => b.Names.Contains(boardName));
            if (board is null || tag.Year is null)
            {
                messages.Add(Warn("boardTags", "board.unknown", Messages.ParseUnknownBoard));
                continue;
            }

            tags.Add(tag with { BoardId = board.Id });
        }

        draft = draft with { ChapterId = chapter?.Id, TopicId = topic?.Id, BoardTags = tags };

        // Structural rules shared with manual create (only when the draft itself parsed cleanly and has a chapter).
        if (chapter is not null && messages.All(m => m.Severity != MessageSeverity.Error))
        {
            var result = validator.Validate(DraftMapper.ToContent(draft, defaults));
            foreach (var failure in result.Errors.DistinctBy(e => e.ErrorMessage))
            {
                messages.Add(Error(FieldFor(failure.PropertyName), "validation", failure.ErrorMessage));
            }
        }

        return (draft, messages);
    }

    public static string ChapterLabel(ChapterRef c) => $"{BanglaWords.Chapter} {BanglaText.ToBanglaDigits(c.Number)} - {c.Name}";

    /// <summary>"অধ্যায় ১: তাপগতিবিদ্যা" → "১: তাপগতিবিদ্যা"; also drops "chapter" and "নং".</summary>
    private static string WithoutChapterWord(string reference)
    {
        var folded = BanglaText.FoldForParsing(reference).Trim();
        foreach (var prefix in new[] { BanglaWords.Chapter, "chapter", "Chapter", "CHAPTER" })
        {
            if (folded.StartsWith(prefix, StringComparison.Ordinal))
            {
                folded = folded[prefix.Length..].TrimStart(' ', ':', '-', '.');
                break;
            }
        }

        if (folded.StartsWith("নং", StringComparison.Ordinal))
        {
            folded = folded[2..];
        }

        return folded.Trim();
    }

    private static string FieldFor(string property)
    {
        var root = property.Split('.', '[')[0];
        return root.Length == 0 ? "stem" : char.ToLowerInvariant(root[0]) + root[1..];
    }

    private static ImportMessage Warn(string field, string code, string message) => new(field, code, message, MessageSeverity.Warning);

    private static ImportMessage Error(string field, string code, string message) => new(field, code, message, MessageSeverity.Error);

    [GeneratedRegex(@"^\s*(?<n>[0-9]{1,3})(?=\s|[.)।:\-]|$)", RegexOptions.None, matchTimeoutMilliseconds: 200)]
    private static partial Regex LeadingNumber();
}

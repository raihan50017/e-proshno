using System.Text.Json;
using EProshno.Core.Common;
using EProshno.Core.Content;
using EProshno.Core.Questions;
using EProshno.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace EProshno.Infrastructure.Questions;

/// <summary>
/// Creates and updates <see cref="Question"/> aggregates from <see cref="QuestionContent"/>, keeping derived
/// fields (StemText, ContentHash, HasImage) and shared CommonInfo stimuli consistent.
/// </summary>
public sealed class QuestionWriter(AppDbContext db, TimeProvider clock)
{
    /// <summary>
    /// Checks that the syllabus, board and tag references exist and are usable by <paramref name="institutionId"/>
    /// (null = platform content, which may only use the official syllabus).
    /// </summary>
    public async Task ValidateReferencesAsync(QuestionContent c, Guid? institutionId, Guid? bankId, CancellationToken ct)
    {
        var subjectOk = await db.Subjects.AnyAsync(
            s => s.Id == c.SubjectId && (s.InstitutionId == null || s.InstitutionId == institutionId), ct);
        if (!subjectOk)
        {
            throw Invalid(nameof(c.SubjectId), Messages.SubjectNotFound);
        }

        var chapterOk = await db.Chapters.AnyAsync(
            ch => ch.Id == c.ChapterId && ch.SubjectId == c.SubjectId
                  && (ch.InstitutionId == null || ch.InstitutionId == institutionId), ct);
        if (!chapterOk)
        {
            throw Invalid(nameof(c.ChapterId), Messages.ChapterNotInSubject);
        }

        if (c.TopicId is { } topicId)
        {
            var topicOk = await db.Topics.AnyAsync(
                t => t.Id == topicId && t.ChapterId == c.ChapterId
                     && (t.InstitutionId == null || t.InstitutionId == institutionId), ct);
            if (!topicOk)
            {
                throw Invalid(nameof(c.TopicId), Messages.TopicNotInChapter);
            }
        }

        var boardIds = c.Appearances.Where(a => a.BoardId is not null).Select(a => a.BoardId!.Value).Distinct().ToList();
        if (boardIds.Count > 0 && await db.Boards.CountAsync(b => boardIds.Contains(b.Id), ct) != boardIds.Count)
        {
            throw Invalid(nameof(c.Appearances), Messages.BoardRequired);
        }

        if (c.TagIds.Count > 0)
        {
            // Tags are tenant-owned: the query filter limits this to the current institution.
            var found = institutionId is null ? 0 : await db.QuestionTags.CountAsync(t => c.TagIds.Contains(t.Id), ct);
            if (found != c.TagIds.Count)
            {
                throw Invalid(nameof(c.TagIds), Messages.InvalidValue);
            }
        }

        if (c.StimulusId is { } stimulusId)
        {
            var groupOk = await db.Questions.AnyAsync(
                q => q.StimulusId == stimulusId && q.BankId == bankId && q.McqKind == McqKind.CommonInfo
                     && q.Status != ContentStatus.Archived, ct);
            if (!groupOk)
            {
                throw Invalid(nameof(c.StimulusId), Messages.StimulusRequired);
            }
        }
    }

    public Question Create(QuestionContent c, Guid? bankId, ContentStatus status, Guid userId, Guid? importJobId = null)
    {
        var now = clock.GetUtcNow();
        var q = new Question
        {
            Id = IdGen.New(),
            BankId = bankId,
            Status = status,
            CreatedById = userId,
            CreatedAt = now,
            UpdatedAt = now,
            PublishedAt = status == ContentStatus.Published ? now : null,
            ImportJobId = importJobId,
        };

        string? stimulusContent = null;
        if (c.StimulusId is { } existing)
        {
            q.StimulusId = existing;
            stimulusContent = c.Stimulus;
        }
        else if (NeedsStimulus(c))
        {
            var stimulus = new Stimulus { Id = IdGen.New(), Content = c.Stimulus!, CreatedAt = now };
            db.Stimuli.Add(stimulus);
            q.StimulusId = stimulus.Id;
            stimulusContent = stimulus.Content;
        }

        Apply(q, c);
        QuestionRules.Derive(q, stimulusContent);
        db.Questions.Add(q);
        return q;
    }

    /// <summary>Replaces content of a loaded question (children and stimulus must be loaded or loadable).</summary>
    public async Task UpdateAsync(Question q, QuestionContent c, CancellationToken ct)
    {
        await db.Entry(q).Collection(x => x.Options).LoadAsync(ct);
        await db.Entry(q).Collection(x => x.CqParts).LoadAsync(ct);
        await db.Entry(q).Collection(x => x.Appearances).LoadAsync(ct);
        await db.Entry(q).Collection(x => x.Tags).LoadAsync(ct);

        db.McqOptions.RemoveRange(q.Options);
        db.CqParts.RemoveRange(q.CqParts);
        db.QuestionAppearances.RemoveRange(q.Appearances);
        q.Options = [];
        q.CqParts = [];
        q.Appearances = [];

        // Tag links have a composite key, so diff them instead of delete + re-add.
        var wanted = c.TagIds.ToHashSet();
        foreach (var link in q.Tags.Where(t => !wanted.Contains(t.TagId)).ToList())
        {
            q.Tags.Remove(link);
            db.QuestionTagLinks.Remove(link);
        }

        foreach (var tagId in wanted.Where(id => q.Tags.All(t => t.TagId != id)))
        {
            q.Tags.Add(new QuestionTagLink { QuestionId = q.Id, TagId = tagId });
        }

        string? stimulusContent = null;
        if (NeedsStimulus(c) || c.StimulusId is not null)
        {
            var stimulusId = c.StimulusId ?? q.StimulusId;
            var stimulus = stimulusId is null ? null : await db.Stimuli.FirstOrDefaultAsync(s => s.Id == stimulusId, ct);
            if (stimulus is null)
            {
                stimulus = new Stimulus { Id = IdGen.New(), Content = c.Stimulus!, CreatedAt = clock.GetUtcNow() };
                db.Stimuli.Add(stimulus);
            }
            else if (c.Stimulus is not null && stimulus.Content != c.Stimulus)
            {
                stimulus.Content = c.Stimulus;
                await RederiveSiblingsAsync(stimulus, q.Id, ct);
            }

            q.StimulusId = stimulus.Id;
            stimulusContent = stimulus.Content;
        }
        else
        {
            q.StimulusId = null;
        }

        Apply(q, c, setTags: false);
        q.UpdatedAt = clock.GetUtcNow();
        QuestionRules.Derive(q, stimulusContent);
    }

    /// <summary>Copies platform questions (a whole CommonInfo group at once) into a custom bank.</summary>
    public async Task<List<Question>> CopyAsync(IReadOnlyList<Guid> sourceIds, Guid bankId, ContentStatus status, Guid userId, CancellationToken ct)
    {
        var sources = await LoadFullAsync(db.Questions.Where(q => sourceIds.Contains(q.Id)), ct);
        var stimulusMap = new Dictionary<Guid, Guid>();
        var copies = new List<Question>();
        foreach (var source in sources.OrderBy(s => sourceIds.ToList().IndexOf(s.Id)))
        {
            var content = ToContent(source) with { TagIds = [], StimulusId = null };
            Question copy;
            if (source is { McqKind: McqKind.CommonInfo, StimulusId: { } sid } && stimulusMap.TryGetValue(sid, out var newSid))
            {
                copy = Create(content with { StimulusId = newSid, Stimulus = null }, bankId, status, userId);
                QuestionRules.Derive(copy, source.Stimulus?.Content);
            }
            else
            {
                copy = Create(content, bankId, status, userId);
                if (source.StimulusId is { } oldSid && copy.StimulusId is { } createdSid)
                {
                    stimulusMap[oldSid] = createdSid;
                }
            }

            copy.SourceQuestionId = source.Id;
            copy.IsCommon = false;
            copies.Add(copy);
        }

        return copies;
    }

    public static async Task<List<Question>> LoadFullAsync(IQueryable<Question> query, CancellationToken ct) =>
        await query
            .Include(q => q.Stimulus)
            .Include(q => q.Options)
            .Include(q => q.CqParts)
            .Include(q => q.Appearances)
            .Include(q => q.Tags)
            .AsSplitQuery()
            .ToListAsync(ct);

    public static QuestionContent ToContent(Question q) => new()
    {
        Type = q.Type,
        McqKind = q.McqKind,
        SubjectId = q.SubjectId,
        ChapterId = q.ChapterId,
        TopicId = q.TopicId,
        Stem = q.Stem,
        Stimulus = q.Stimulus?.Content,
        StimulusId = q.McqKind == McqKind.CommonInfo ? q.StimulusId : null,
        Options = q.Options.OrderBy(o => o.Index).Select(o => new OptionContent(o.Content, o.IsCorrect)).ToList(),
        CqParts = q.CqParts.OrderBy(p => p.Part).Select(p => new CqPartContent(p.Prompt, p.Marks, p.Answer)).ToList(),
        Explanation = q.Explanation,
        Difficulty = q.Difficulty,
        Importance = q.Importance,
        IsMath = q.IsMath,
        IsCommon = q.IsCommon,
        Appearances = q.Appearances
            .OrderByDescending(a => a.Year)
            .Select(a => new AppearanceContent(a.Source, a.BoardId, a.SchoolName, a.Year))
            .ToList(),
        TagIds = q.Tags.Select(t => t.TagId).ToList(),
    };

    public static string Snapshot(Question q) => JsonSerializer.Serialize(ToContent(q), AppJson.Options);

    private static bool NeedsStimulus(QuestionContent c) =>
        c.Type == QuestionType.Cq || (c.Type == QuestionType.Mcq && c.McqKind == McqKind.CommonInfo);

    private static void Apply(Question q, QuestionContent c, bool setTags = true)
    {
        q.Type = c.Type;
        q.McqKind = c.Type == QuestionType.Mcq ? c.McqKind : null;
        q.SubjectId = c.SubjectId;
        q.ChapterId = c.ChapterId;
        q.TopicId = c.TopicId;
        q.Stem = c.Type == QuestionType.Cq && string.IsNullOrWhiteSpace(c.Stem) ? RichContent.EmptyDoc : c.Stem;
        q.Explanation = c.Explanation;
        q.Difficulty = c.Difficulty;
        q.Importance = c.Importance;
        q.IsMath = c.IsMath;
        q.IsCommon = c.IsCommon;

        q.Options = c.Type == QuestionType.Mcq
            ? c.Options.Select((o, i) => new McqOption
            {
                Id = IdGen.New(), QuestionId = q.Id, Index = i, Content = o.Content, IsCorrect = o.IsCorrect,
            }).ToList()
            : [];
        q.CqParts = c.Type == QuestionType.Cq
            ? c.CqParts.Select((p, i) => new CqPart
            {
                Id = IdGen.New(), QuestionId = q.Id, Part = i, Prompt = p.Prompt, Marks = p.Marks, Answer = p.Answer,
            }).ToList()
            : [];
        q.Appearances = c.Appearances.Select(a => new QuestionAppearance
        {
            Id = IdGen.New(),
            QuestionId = q.Id,
            Source = a.Source,
            BoardId = a.Source == ExamSource.Board ? a.BoardId : null,
            SchoolName = a.Source == ExamSource.Board ? null : a.SchoolName,
            Year = a.Year,
        }).ToList();
        if (setTags)
        {
            q.Tags = c.TagIds.Distinct().Select(t => new QuestionTagLink { QuestionId = q.Id, TagId = t }).ToList();
        }
    }

    private async Task RederiveSiblingsAsync(Stimulus stimulus, Guid exceptId, CancellationToken ct)
    {
        var siblings = await LoadFullAsync(db.Questions.Where(q => q.StimulusId == stimulus.Id && q.Id != exceptId), ct);
        foreach (var sibling in siblings)
        {
            QuestionRules.Derive(sibling, stimulus.Content);
            sibling.UpdatedAt = clock.GetUtcNow();
        }
    }

    private static FluentValidation.ValidationException Invalid(string property, string message) =>
        new([new FluentValidation.Results.ValidationFailure(property, message)]);
}

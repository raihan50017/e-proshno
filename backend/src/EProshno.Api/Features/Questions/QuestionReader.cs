using EProshno.Core.Auth;
using EProshno.Core.Common;
using EProshno.Core.Questions;
using EProshno.Infrastructure.Identity;
using EProshno.Infrastructure.Papers;
using EProshno.Infrastructure.Persistence;
using EProshno.Infrastructure.Questions;
using Microsoft.EntityFrameworkCore;

namespace EProshno.Api.Features.Questions;

public sealed record OptionDto(string Content, bool IsCorrect);

public sealed record CqPartDto(string Prompt, decimal Marks, string? Answer);

/// <summary>A question as shown in lists, the picker and previews (rich text fields are TipTap JSON).</summary>
public sealed record QuestionCard(
    Guid Id,
    QuestionType Type,
    McqKind? McqKind,
    string Stem,
    Guid? StimulusId,
    string? Stimulus,
    IReadOnlyList<OptionDto> Options,
    IReadOnlyList<CqPartDto> CqParts,
    string? Explanation,
    IReadOnlyList<string> BoardTags,
    byte Difficulty,
    byte Importance,
    bool IsMath,
    bool HasImage,
    bool IsCommon,
    Guid? BankId,
    string? BankName,
    Guid SubjectId,
    Guid ChapterId,
    int ChapterNumber,
    string ChapterName,
    string? TopicName,
    ContentStatus Status,
    bool CanEdit,
    DateTimeOffset UpdatedAt);

/// <summary>Card + editable content for the question editor.</summary>
public sealed record QuestionDetail(
    QuestionCard Card,
    QuestionContent Content,
    string SubjectLabel,
    string? ReviewNote,
    Guid? SourceQuestionId,
    string? CreatedByName,
    DateTimeOffset CreatedAt,
    DateTimeOffset? PublishedAt);

/// <summary>Projects questions to DTOs. The caller decides which questions may be read.</summary>
public sealed class QuestionReader(AppDbContext db, ITenantContext tenant)
{
    /// <summary>Runs <paramref name="query"/> (already filtered, ordered and limited) and maps the rows in order.</summary>
    public async Task<List<QuestionCard>> CardsAsync(IQueryable<Question> query, CancellationToken ct)
    {
        var rows = await query
            .Select(q => new CardRow
            {
                Id = q.Id,
                Type = q.Type,
                McqKind = q.McqKind,
                Stem = q.Stem,
                StimulusId = q.StimulusId,
                Stimulus = q.Stimulus != null ? q.Stimulus.Content : null,
                Options = q.Options.OrderBy(o => o.Index).Select(o => new OptionDto(o.Content, o.IsCorrect)).ToList(),
                CqParts = q.CqParts.OrderBy(p => p.Part).Select(p => new CqPartDto(p.Prompt, p.Marks, p.Answer)).ToList(),
                Boards = q.Appearances
                    .Where(a => a.Source == ExamSource.Board && a.Board != null)
                    .Select(a => new BoardRow { ShortBn = a.Board!.ShortBn, Year = a.Year })
                    .ToList(),
                Explanation = q.Explanation,
                Difficulty = q.Difficulty,
                Importance = q.Importance,
                IsMath = q.IsMath,
                HasImage = q.HasImage,
                IsCommon = q.IsCommon,
                BankId = q.BankId,
                BankName = q.Bank != null ? q.Bank.Name : null,
                BankOwnerId = q.Bank != null ? q.Bank.OwnerId : null,
                SubjectId = q.SubjectId,
                ChapterId = q.ChapterId,
                ChapterNumber = q.Chapter!.Number,
                ChapterName = q.Chapter.NameBn,
                TopicName = q.Topic != null ? q.Topic.NameBn : null,
                Status = q.Status,
                CreatedById = q.CreatedById,
                UpdatedAt = q.UpdatedAt,
            })
            .AsSplitQuery()
            .ToListAsync(ct);

        return rows.Select(ToCard).ToList();
    }

    public async Task<QuestionDetail> DetailAsync(Guid id, CancellationToken ct)
    {
        var card = (await CardsAsync(db.Questions.AsNoTracking().Where(q => q.Id == id), ct)).FirstOrDefault()
            ?? throw AppException.NotFound();
        var full = (await QuestionWriter.LoadFullAsync(db.Questions.AsNoTracking().Where(q => q.Id == id), ct)).Single();
        var meta = await (
                from q in db.Questions.AsNoTracking()
                where q.Id == id
                join u in db.Set<AppUser>() on q.CreatedById equals u.Id into users
                from u in users.DefaultIfEmpty()
                select new
                {
                    q.ReviewNote,
                    q.SourceQuestionId,
                    q.CreatedAt,
                    q.PublishedAt,
                    CreatedByName = u != null ? u.FullName : null,
                    SubjectName = q.Subject!.NameBn,
                    q.Subject.Paper,
                })
            .SingleAsync(ct);

        return new QuestionDetail(
            card,
            QuestionWriter.ToContent(full),
            PaperLoader.SubjectLabel(meta.SubjectName, meta.Paper),
            meta.ReviewNote,
            meta.SourceQuestionId,
            meta.CreatedByName,
            meta.CreatedAt,
            meta.PublishedAt);
    }

    private QuestionCard ToCard(CardRow r) => new(
        r.Id,
        r.Type,
        r.McqKind,
        r.Stem,
        r.StimulusId,
        r.Stimulus,
        r.Options,
        r.CqParts,
        r.Explanation,
        PaperLoader.BoardTags(r.Boards.Select(b => (b.ShortBn, b.Year))),
        r.Difficulty,
        r.Importance,
        r.IsMath,
        r.HasImage,
        r.IsCommon,
        r.BankId,
        r.BankName,
        r.SubjectId,
        r.ChapterId,
        r.ChapterNumber,
        r.ChapterName,
        r.TopicName,
        r.Status,
        CanEdit(r.BankId, r.BankOwnerId, r.CreatedById),
        r.UpdatedAt);

    /// <summary>Platform questions: the content team. Bank questions: bank owner, question author, institution admins.</summary>
    public bool CanEdit(Guid? bankId, Guid? bankOwnerId, Guid createdById)
    {
        if (bankId is null)
        {
            return tenant.IsInRole(Roles.SuperAdmin) || tenant.IsInRole(Roles.ContentEditor);
        }

        return (bankOwnerId is not null && bankOwnerId == tenant.CurrentUserId)
               || createdById == tenant.CurrentUserId
               || tenant.IsInstitutionAdmin;
    }

    private sealed class CardRow
    {
        public Guid Id { get; init; }
        public QuestionType Type { get; init; }
        public McqKind? McqKind { get; init; }
        public string Stem { get; init; } = "";
        public Guid? StimulusId { get; init; }
        public string? Stimulus { get; init; }
        public List<OptionDto> Options { get; init; } = [];
        public List<CqPartDto> CqParts { get; init; } = [];
        public List<BoardRow> Boards { get; init; } = [];
        public string? Explanation { get; init; }
        public byte Difficulty { get; init; }
        public byte Importance { get; init; }
        public bool IsMath { get; init; }
        public bool HasImage { get; init; }
        public bool IsCommon { get; init; }
        public Guid? BankId { get; init; }
        public string? BankName { get; init; }
        public Guid? BankOwnerId { get; init; }
        public Guid SubjectId { get; init; }
        public Guid ChapterId { get; init; }
        public int ChapterNumber { get; init; }
        public string ChapterName { get; init; } = "";
        public string? TopicName { get; init; }
        public ContentStatus Status { get; init; }
        public Guid CreatedById { get; init; }
        public DateTimeOffset UpdatedAt { get; init; }
    }

    private sealed class BoardRow
    {
        public string ShortBn { get; init; } = "";
        public int Year { get; init; }
    }
}

using EProshno.Api.Common;
using EProshno.Core.Auth;
using EProshno.Core.Common;
using EProshno.Core.Questions;
using EProshno.Core.Text;
using EProshno.Infrastructure.Identity;
using EProshno.Infrastructure.Persistence;
using EProshno.Infrastructure.Questions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace EProshno.Api.Features.Questions;

public sealed record AdminQuestionPage(IReadOnlyList<QuestionCard> Items, string? NextCursor);

public static class ListPlatformQuestions
{
    public sealed record Query(
        ContentStatus? Status,
        Guid? SubjectId,
        Guid? ChapterId,
        QuestionType? Type,
        string? Keyword,
        bool Mine,
        string? Cursor,
        int? Limit) : IQuery<AdminQuestionPage>;

    internal sealed class Handler(AppDbContext db, ITenantContext tenant, QuestionReader reader) : IQueryHandler<Query, AdminQuestionPage>
    {
        public async Task<AdminQuestionPage> Handle(Query query, CancellationToken ct)
        {
            var q = db.Questions.AsNoTracking().Where(x => x.BankId == null);
            if (query.Status is { } status)
            {
                q = q.Where(x => x.Status == status);
            }

            if (query.SubjectId is { } subjectId)
            {
                q = q.Where(x => x.SubjectId == subjectId);
            }

            if (query.ChapterId is { } chapterId)
            {
                q = q.Where(x => x.ChapterId == chapterId);
            }

            if (query.Type is { } type)
            {
                q = q.Where(x => x.Type == type);
            }

            if (query.Mine)
            {
                var userId = tenant.UserId;
                q = q.Where(x => x.CreatedById == userId);
            }

            if (!string.IsNullOrWhiteSpace(query.Keyword))
            {
                var pattern = $"%{LikePattern.Escape(BanglaText.Normalize(query.Keyword))}%";
                q = q.Where(x => EF.Functions.ILike(x.StemText, pattern, @"\"));
            }

            if (Paging.GuidCursor(query.Cursor) is { } cursor)
            {
                q = q.Where(x => x.Id.CompareTo(cursor) < 0);
            }

            var take = Paging.Limit(query.Limit);
            var cards = await reader.CardsAsync(q.OrderByDescending(x => x.Id).Take(take + 1), ct);
            string? next = null;
            if (cards.Count > take)
            {
                cards.RemoveAt(take);
                next = Paging.Cursor(cards[^1].Id);
            }

            return new AdminQuestionPage(cards, next);
        }
    }
}

public static class GetPlatformQuestion
{
    public sealed record Query(Guid Id) : IQuery<QuestionDetail>;

    internal sealed class Handler(AppDbContext db, QuestionReader reader) : IQueryHandler<Query, QuestionDetail>
    {
        public async Task<QuestionDetail> Handle(Query query, CancellationToken ct)
        {
            if (!await db.Questions.AnyAsync(q => q.Id == query.Id && q.BankId == null, ct))
            {
                throw AppException.NotFound();
            }

            return await reader.DetailAsync(query.Id, ct);
        }
    }
}

public sealed record SavedQuestion(Guid Id, ContentStatus Status, bool DuplicateWarning);

public static class SavePlatformQuestion
{
    public sealed record Request(QuestionContent Content, bool SubmitForReview);

    public sealed record Command(Guid? Id, Request Body) : ICommand<SavedQuestion>;

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator(QuestionContentValidator content)
        {
            RuleFor(x => x.Body.Content).NotNull().SetValidator(content);
            RuleFor(x => x.Body.Content.TagIds).Empty().WithMessage(Messages.InvalidValue).When(x => x.Body.Content is not null);
        }
    }

    /// <summary>
    /// Content team create/update. New questions start as Draft (or InReview); editing a published question keeps
    /// it published and stores a revision snapshot first.
    /// </summary>
    internal sealed class Handler(AppDbContext db, ITenantContext tenant, QuestionWriter writer, TimeProvider clock)
        : ICommandHandler<Command, SavedQuestion>
    {
        public async Task<SavedQuestion> Handle(Command command, CancellationToken ct)
        {
            var content = command.Body.Content;
            var submit = command.Body.SubmitForReview;
            await writer.ValidateReferencesAsync(content, null, null, ct);

            var hash = QuestionRules.Fingerprint(content);
            var duplicate = await db.Questions.AnyAsync(
                q => q.BankId == null && q.ContentHash == hash && q.Status != ContentStatus.Archived && q.Id != command.Id, ct);
            if (duplicate)
            {
                throw AppException.Conflict("question.duplicate", Messages.DuplicateInPlatform);
            }

            Question question;
            if (command.Id is { } id)
            {
                question = await db.Questions.Where(q => q.Id == id && q.BankId == null).FirstOr404Async(ct);
                if (question.Status == ContentStatus.Published)
                {
                    var full = (await QuestionWriter.LoadFullAsync(db.Questions.AsNoTracking().Where(q => q.Id == id), ct)).Single();
                    db.QuestionRevisions.Add(new QuestionRevision
                    {
                        Id = IdGen.New(),
                        QuestionId = id,
                        Snapshot = QuestionWriter.Snapshot(full),
                        EditedById = tenant.UserId,
                        CreatedAt = clock.GetUtcNow(),
                    });
                }

                await writer.UpdateAsync(question, content, ct);
                if (submit && question.Status == ContentStatus.Draft)
                {
                    question.Status = ContentStatus.InReview;
                }
            }
            else
            {
                question = writer.Create(content, null, submit ? ContentStatus.InReview : ContentStatus.Draft, tenant.UserId);
            }

            await db.SaveChangesAsync(ct);
            return new SavedQuestion(question.Id, question.Status, false);
        }
    }
}

public enum QuestionAction
{
    Submit,
    Approve,
    Reject,
    Archive,
    Restore,
}

public static class ChangeQuestionStatus
{
    public sealed record Request(QuestionAction Action, string? Note);

    public sealed record Command(Guid Id, Request Body) : ICommand<Unit>;

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator()
        {
            RuleFor(x => x.Body.Action).IsInEnum().WithMessage(Messages.InvalidValue);
            RuleFor(x => x.Body.Note).NotEmpty().WithMessage(Messages.Required).When(x => x.Body.Action == QuestionAction.Reject);
            RuleFor(x => x.Body.Note).MaximumLength(500).WithMessage(Messages.TooLong);
        }
    }

    /// <summary>Draft → InReview (editor) → Published or back to Draft (reviewer); archive/restore (editor).</summary>
    internal sealed class Handler(AppDbContext db, ITenantContext tenant, TimeProvider clock) : ICommandHandler<Command, Unit>
    {
        public async Task<Unit> Handle(Command command, CancellationToken ct)
        {
            var q = await db.Questions.Where(x => x.Id == command.Id && x.BankId == null).FirstOr404Async(ct);
            var (target, reviewer) = command.Body.Action switch
            {
                QuestionAction.Submit => (ContentStatus.InReview, false),
                QuestionAction.Approve => (ContentStatus.Published, true),
                QuestionAction.Reject => (ContentStatus.Draft, true),
                QuestionAction.Archive => (ContentStatus.Archived, false),
                _ => (ContentStatus.Published, false),
            };

            var allowed = tenant.IsInRole(Roles.SuperAdmin)
                          || tenant.IsInRole(reviewer ? Roles.ContentReviewer : Roles.ContentEditor);
            if (!allowed)
            {
                throw AppException.Forbidden();
            }

            var from = q.Status;
            if (command.Body.Action == QuestionAction.Restore && from != ContentStatus.Archived)
            {
                throw AppException.Conflict("question.status", Messages.InvalidStatusChange);
            }

            if (!QuestionRules.CanTransition(from, target))
            {
                throw AppException.Conflict("question.status", Messages.InvalidStatusChange);
            }

            var now = clock.GetUtcNow();
            q.Status = target;
            q.UpdatedAt = now;
            q.ReviewNote = command.Body.Action == QuestionAction.Reject ? command.Body.Note?.Trim() : null;
            if (target == ContentStatus.Published)
            {
                q.PublishedAt ??= now;
            }

            await db.SaveChangesAsync(ct);
            return Unit.Value;
        }
    }
}

public sealed record StatusCount(ContentStatus Status, int Count);

public sealed record SubjectCoverage(Guid SubjectId, string Label, int Published, int Mcq, int Cq);

public sealed record ContentStats(IReadOnlyList<StatusCount> ByStatus, IReadOnlyList<SubjectCoverage> Coverage, int OpenReports);

public static class GetContentStats
{
    public sealed record Query : IQuery<ContentStats>;

    internal sealed class Handler(AppDbContext db) : IQueryHandler<Query, ContentStats>
    {
        public async Task<ContentStats> Handle(Query query, CancellationToken ct)
        {
            var platform = db.Questions.AsNoTracking().Where(q => q.BankId == null);
            var byStatus = await platform.GroupBy(q => q.Status)
                .Select(g => new StatusCount(g.Key, g.Count()))
                .ToListAsync(ct);

            var coverage = await platform.Where(q => q.Status == ContentStatus.Published)
                .GroupBy(q => new { q.SubjectId, q.Subject!.NameBn, q.Subject.Paper })
                .Select(g => new
                {
                    g.Key.SubjectId,
                    g.Key.NameBn,
                    g.Key.Paper,
                    Published = g.Count(),
                    Mcq = g.Count(q => q.Type == QuestionType.Mcq),
                    Cq = g.Count(q => q.Type == QuestionType.Cq),
                })
                .ToListAsync(ct);

            // Reports come from every institution: an admin view across tenants.
            var openReports = await db.QuestionReports.IgnoreQueryFilters().CountAsync(r => r.Status == ReportStatus.Open, ct);

            return new ContentStats(
                byStatus,
                coverage
                    .OrderBy(c => c.NameBn, StringComparer.Ordinal)
                    .Select(c => new SubjectCoverage(c.SubjectId, Infrastructure.Papers.PaperLoader.SubjectLabel(c.NameBn, c.Paper), c.Published, c.Mcq, c.Cq))
                    .ToList(),
                openReports);
        }
    }
}

public sealed record QuestionReportDto(
    Guid Id,
    Guid QuestionId,
    string QuestionExcerpt,
    string Reason,
    ReportStatus Status,
    string? Resolution,
    string ReporterName,
    string InstitutionName,
    DateTimeOffset CreatedAt,
    DateTimeOffset? ResolvedAt);

public static class ListQuestionReports
{
    public sealed record Query(ReportStatus? Status, string? Cursor, int? Limit) : IQuery<CursorPage<QuestionReportDto>>;

    internal sealed class Handler(AppDbContext db) : IQueryHandler<Query, CursorPage<QuestionReportDto>>
    {
        public async Task<CursorPage<QuestionReportDto>> Handle(Query query, CancellationToken ct)
        {
            // Admin feature: reports from every institution.
            var reports = db.QuestionReports.AsNoTracking().IgnoreQueryFilters();
            if (query.Status is { } status)
            {
                reports = reports.Where(r => r.Status == status);
            }

            if (Paging.GuidCursor(query.Cursor) is { } cursor)
            {
                reports = reports.Where(r => r.Id.CompareTo(cursor) < 0);
            }

            var page = await (
                    from r in reports
                    join u in db.Set<AppUser>() on r.ReporterId equals u.Id
                    join i in db.Institutions on r.InstitutionId equals i.Id
                    orderby r.Id descending
                    select new
                    {
                        r.Id,
                        r.QuestionId,
                        r.Question!.StemText,
                        r.Reason,
                        r.Status,
                        r.Resolution,
                        ReporterName = u.FullName,
                        InstitutionName = i.Name,
                        r.CreatedAt,
                        r.ResolvedAt,
                    })
                .ToPageAsync(r => Paging.Cursor(r.Id), query.Limit, ct);

            return new CursorPage<QuestionReportDto>(
                page.Items.Select(r => new QuestionReportDto(
                    r.Id,
                    r.QuestionId,
                    r.StemText.Length > 160 ? r.StemText[..160] + "…" : r.StemText,
                    r.Reason,
                    r.Status,
                    r.Resolution,
                    r.ReporterName,
                    r.InstitutionName,
                    r.CreatedAt,
                    r.ResolvedAt)).ToList(),
                page.NextCursor);
        }
    }
}

public static class ResolveQuestionReport
{
    public sealed record Request(ReportStatus Status, string Resolution);

    public sealed record Command(Guid Id, Request Body) : ICommand<Unit>;

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator()
        {
            RuleFor(x => x.Body.Status).Must(s => s is ReportStatus.Resolved or ReportStatus.Rejected).WithMessage(Messages.InvalidValue);
            RuleFor(x => x.Body.Resolution).NotEmpty().WithMessage(Messages.Required).MaximumLength(500).WithMessage(Messages.TooLong);
        }
    }

    internal sealed class Handler(AppDbContext db, ITenantContext tenant, TimeProvider clock) : ICommandHandler<Command, Unit>
    {
        public async Task<Unit> Handle(Command command, CancellationToken ct)
        {
            // Admin feature: the report belongs to the reporter's institution.
            var report = await db.QuestionReports.IgnoreQueryFilters().Where(r => r.Id == command.Id).FirstOr404Async(ct);
            report.Status = command.Body.Status;
            report.Resolution = command.Body.Resolution.Trim();
            report.ResolvedById = tenant.UserId;
            report.ResolvedAt = clock.GetUtcNow();
            await db.SaveChangesAsync(ct);
            return Unit.Value;
        }
    }
}

using EProshno.Api.Common;
using EProshno.Api.Features.Questions;
using EProshno.Core.Billing;
using EProshno.Core.Common;
using EProshno.Core.Questions;
using EProshno.Core.Sets;
using EProshno.Core.Text;
using EProshno.Infrastructure.Billing;
using EProshno.Infrastructure.Persistence;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace EProshno.Api.Features.QuestionSets;

/// <summary>The scope fields shared by create and update.</summary>
public interface ISetScope
{
    string Title { get; }
    IReadOnlyList<Guid> ChapterIds { get; }
    SetMode Mode { get; }
    QuestionSource Source { get; }
    IReadOnlyList<Guid> BankIds { get; }
    int TargetCount { get; }
    int DurationMin { get; }
    decimal FullMarks { get; }
}

public sealed class SetScopeValidator : AbstractValidator<ISetScope>
{
    public const int MaxTarget = 200;

    public SetScopeValidator()
    {
        RuleFor(x => x.Title).NotEmpty().WithMessage(Messages.SetTitleRequired).MaximumLength(120).WithMessage(Messages.TooLong);
        RuleFor(x => x.ChapterIds).NotEmpty().WithMessage(Messages.ChaptersRequired)
            .Must(c => c is null || c.Count <= 100).WithMessage(Messages.InvalidValue);
        RuleFor(x => x.Mode).IsInEnum().WithMessage(Messages.InvalidValue);
        RuleFor(x => x.Source).IsInEnum().WithMessage(Messages.InvalidValue);
        RuleFor(x => x.BankIds).NotNull().WithMessage(Messages.Required)
            .Must(b => b is null || b.Count <= 50).WithMessage(Messages.InvalidValue);
        RuleFor(x => x.BankIds).NotEmpty().WithMessage(Messages.BanksRequired).When(x => x.Source == QuestionSource.MyBanks);
        RuleFor(x => x.TargetCount).InclusiveBetween(1, MaxTarget).WithMessage(Messages.TargetCountRange);
        RuleFor(x => x.DurationMin).InclusiveBetween(5, 300).WithMessage(Messages.DurationRange);
        RuleFor(x => x.FullMarks).InclusiveBetween(1m, 1000m).WithMessage(Messages.FullMarksRange);
    }
}

/// <summary>Database checks for a set's scope: syllabus, banks and — when the platform bank is a source — the subscription.</summary>
public sealed class SetScopeChecker(AppDbContext db, ITenantContext tenant, IEntitlements entitlements, QuestionSearch search)
{
    public async Task CheckAsync(Guid subjectId, ISetScope scope, CancellationToken ct)
    {
        var institutionId = tenant.InstitutionId;
        var chapterIds = scope.ChapterIds.Distinct().ToList();
        var found = await db.Chapters.CountAsync(
            c => chapterIds.Contains(c.Id) && c.SubjectId == subjectId && (c.InstitutionId == null || c.InstitutionId == institutionId), ct);
        if (found != chapterIds.Count)
        {
            throw SetAccess.Invalid("chapterIds", Messages.ChapterNotInSubject);
        }

        if (scope.Source != QuestionSource.Platform && scope.BankIds.Count > 0)
        {
            var accessible = await search.AccessibleBankIdsAsync(scope.BankIds, ct);
            if (accessible.Count != scope.BankIds.Distinct().Count())
            {
                throw SetAccess.Invalid("bankIds", Messages.BankNotEditable);
            }
        }

        if (scope.Source != QuestionSource.MyBanks)
        {
            await entitlements.EnsureSubjectAccessAsync(institutionId, subjectId, ct);
        }
    }
}

public static class CreateQuestionSet
{
    public sealed record Command(
        string Title,
        Guid LevelId,
        Guid SubjectId,
        IReadOnlyList<Guid> ChapterIds,
        QuestionType Type,
        SetMode Mode,
        QuestionSource Source,
        IReadOnlyList<Guid> BankIds,
        int TargetCount,
        int DurationMin,
        decimal FullMarks) : ICommand<SetDetailDto>, ISetScope;

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator()
        {
            Include(new SetScopeValidator());
            RuleFor(x => x.LevelId).NotEmpty().WithMessage(Messages.Required);
            RuleFor(x => x.SubjectId).NotEmpty().WithMessage(Messages.Required);
            RuleFor(x => x.Type).IsInEnum().WithMessage(Messages.InvalidValue);
        }
    }

    /// <summary>Step 1 of the generator. The paper settings start from the institution's defaults with a fresh seed.</summary>
    internal sealed class Handler(
        AppDbContext db,
        ITenantContext tenant,
        SetScopeChecker checker,
        IEntitlements entitlements,
        SetReader reader,
        TimeProvider clock) : ICommandHandler<Command, SetDetailDto>
    {
        public async Task<SetDetailDto> Handle(Command command, CancellationToken ct)
        {
            var institutionId = tenant.InstitutionId;
            var levelId = await db.Subjects.AsNoTracking()
                .Where(s => s.Id == command.SubjectId && (s.InstitutionId == null || s.InstitutionId == institutionId))
                .Select(s => (Guid?)s.LevelId)
                .FirstOrDefaultAsync(ct)
                ?? throw SetAccess.Invalid("subjectId", Messages.SubjectNotFound);
            if (levelId != command.LevelId)
            {
                throw SetAccess.Invalid("levelId", Messages.InvalidValue);
            }

            await checker.CheckAsync(command.SubjectId, command, ct);
            await entitlements.AssertWithinLimitAsync(institutionId, LimitKey.SavedSets, ct);

            var defaults = await db.Institutions.AsNoTracking()
                .Where(i => i.Id == institutionId)
                .Select(i => i.PaperDefaults)
                .FirstOr404Async(ct);

            var now = clock.GetUtcNow();
            var set = new QuestionSet
            {
                Id = IdGen.New(),
                InstitutionId = institutionId,
                CreatedById = tenant.UserId,
                Title = command.Title.Trim(),
                LevelId = command.LevelId,
                SubjectId = command.SubjectId,
                ChapterIds = command.ChapterIds.Distinct().ToArray(),
                Type = command.Type,
                Mode = command.Mode,
                Source = command.Source,
                BankIds = command.Source == QuestionSource.Platform ? [] : command.BankIds.Distinct().ToArray(),
                TargetCount = command.TargetCount,
                DurationMin = command.DurationMin,
                FullMarks = command.FullMarks,
                Settings = defaults with { Seed = SetAccess.NewSeed() },
                CreatedAt = now,
                UpdatedAt = now,
            };
            db.QuestionSets.Add(set);
            await db.SaveChangesAsync(ct);
            return await reader.DetailAsync(set.Id, ct);
        }
    }
}

public static class ListQuestionSets
{
    public sealed record Query(string? Keyword, Guid? SubjectId, bool Mine, string? Cursor, int? Limit) : IQuery<CursorPage<SetSummaryDto>>;

    internal sealed class Handler(SetAccess access, SetReader reader, ITenantContext tenant) : IQueryHandler<Query, CursorPage<SetSummaryDto>>
    {
        public async Task<CursorPage<SetSummaryDto>> Handle(Query query, CancellationToken ct)
        {
            var sets = access.Readable();
            if (query.Mine)
            {
                var userId = tenant.UserId;
                sets = sets.Where(s => s.CreatedById == userId);
            }

            if (query.SubjectId is { } subjectId)
            {
                sets = sets.Where(s => s.SubjectId == subjectId);
            }

            if (!string.IsNullOrWhiteSpace(query.Keyword))
            {
                var pattern = $"%{LikePattern.Escape(query.Keyword.Trim())}%";
                sets = sets.Where(s => EF.Functions.ILike(s.Title, pattern, @"\"));
            }

            if (Paging.GuidCursor(query.Cursor) is { } cursor)
            {
                sets = sets.Where(s => s.Id.CompareTo(cursor) < 0);
            }

            var take = Paging.Limit(query.Limit);
            var items = await reader.SummariesAsync(sets.OrderByDescending(s => s.Id).Take(take + 1), ct);
            items = items.OrderByDescending(i => i.Id).ToList();
            return items.Count > take
                ? new CursorPage<SetSummaryDto>(items.Take(take).ToList(), Paging.Cursor(items[take - 1].Id))
                : new CursorPage<SetSummaryDto>(items, null);
        }
    }
}

public static class GetQuestionSet
{
    public sealed record Query(Guid Id) : IQuery<SetDetailDto>;

    internal sealed class Handler(SetAccess access, SetReader reader) : IQueryHandler<Query, SetDetailDto>
    {
        public async Task<SetDetailDto> Handle(Query query, CancellationToken ct)
        {
            var set = await access.GetAsync(query.Id, ct);
            return await reader.DetailAsync(set.Id, ct);
        }
    }
}

public static class UpdateQuestionSet
{
    public sealed record Request(
        string Title,
        IReadOnlyList<Guid> ChapterIds,
        SetMode Mode,
        QuestionSource Source,
        IReadOnlyList<Guid> BankIds,
        int TargetCount,
        int DurationMin,
        decimal FullMarks) : ISetScope;

    public sealed record Command(Guid Id, Request Body) : ICommand<SetDetailDto>;

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator() => RuleFor(x => x.Body).NotNull().SetValidator(new SetScopeValidator());
    }

    /// <summary>Level, subject and question type are fixed once a set exists; everything else can change.</summary>
    internal sealed class Handler(AppDbContext db, SetAccess access, SetScopeChecker checker, SetReader reader, TimeProvider clock)
        : ICommandHandler<Command, SetDetailDto>
    {
        public async Task<SetDetailDto> Handle(Command command, CancellationToken ct)
        {
            var set = await access.GetAsync(command.Id, ct);
            var body = command.Body;
            await checker.CheckAsync(set.SubjectId, body, ct);

            set.Title = body.Title.Trim();
            set.ChapterIds = body.ChapterIds.Distinct().ToArray();
            set.Mode = body.Mode;
            set.Source = body.Source;
            set.BankIds = body.Source == QuestionSource.Platform ? [] : body.BankIds.Distinct().ToArray();
            set.TargetCount = body.TargetCount;
            set.DurationMin = body.DurationMin;
            set.FullMarks = body.FullMarks;
            set.UpdatedAt = clock.GetUtcNow();
            await db.SaveChangesAsync(ct);
            return await reader.DetailAsync(set.Id, ct);
        }
    }
}

public static class DeleteQuestionSet
{
    public sealed record Command(Guid Id) : ICommand<Unit>;

    /// <summary>Deleting a set also frees its questions for unique mode.</summary>
    internal sealed class Handler(AppDbContext db, SetAccess access) : ICommandHandler<Command, Unit>
    {
        public async Task<Unit> Handle(Command command, CancellationToken ct)
        {
            var set = await access.GetAsync(command.Id, ct);
            db.QuestionSets.Remove(set);
            await db.SaveChangesAsync(ct);
            return Unit.Value;
        }
    }
}

public static class DuplicateQuestionSet
{
    public sealed record Command(Guid Id) : ICommand<SetDetailDto>;

    /// <summary>A copy with the same questions and settings and a new shuffle seed, e.g. for another batch.</summary>
    internal sealed class Handler(
        AppDbContext db,
        ITenantContext tenant,
        SetAccess access,
        IEntitlements entitlements,
        SetReader reader,
        TimeProvider clock) : ICommandHandler<Command, SetDetailDto>
    {
        public const string CopySuffix = " (কপি)";

        public async Task<SetDetailDto> Handle(Command command, CancellationToken ct)
        {
            var source = await access.GetWithItemsAsync(command.Id, ct);
            await entitlements.AssertWithinLimitAsync(tenant.InstitutionId, LimitKey.SavedSets, ct);

            var now = clock.GetUtcNow();
            var title = source.Title + CopySuffix;
            var copy = new QuestionSet
            {
                Id = IdGen.New(),
                InstitutionId = source.InstitutionId,
                CreatedById = tenant.UserId,
                Title = title.Length > 120 ? title[..120] : title,
                LevelId = source.LevelId,
                SubjectId = source.SubjectId,
                ChapterIds = [.. source.ChapterIds],
                Type = source.Type,
                Mode = source.Mode,
                Source = source.Source,
                BankIds = [.. source.BankIds],
                TargetCount = source.TargetCount,
                DurationMin = source.DurationMin,
                FullMarks = source.FullMarks,
                Settings = source.Settings with { Seed = SetAccess.NewSeed() },
                CreatedAt = now,
                UpdatedAt = now,
                Items = source.Items
                    .Select(i => new QuestionSetItem { QuestionId = i.QuestionId, Position = i.Position, Marks = i.Marks })
                    .ToList(),
            };
            db.QuestionSets.Add(copy);
            db.QuestionUsages.AddRange(copy.Items.Select(i => new QuestionUsage
            {
                InstitutionId = copy.InstitutionId,
                QuestionId = i.QuestionId,
                SetId = copy.Id,
                UsedAt = now,
            }));
            await db.SaveChangesAsync(ct);
            return await reader.DetailAsync(copy.Id, ct);
        }
    }
}

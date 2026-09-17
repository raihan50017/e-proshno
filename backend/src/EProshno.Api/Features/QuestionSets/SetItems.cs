using System.Globalization;
using EProshno.Api.Common;
using EProshno.Api.Features.Questions;
using EProshno.Core.Common;
using EProshno.Core.Questions;
using EProshno.Core.Sets;
using EProshno.Core.Text;
using EProshno.Infrastructure.Billing;
using EProshno.Infrastructure.Persistence;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace EProshno.Api.Features.QuestionSets;

public static class SearchSetQuestions
{
    /// <param name="ChapterIds">A subset of the set's chapters; empty = all of them.</param>
    /// <param name="Source">Overrides the set's source for this search (the picker's source filter).</param>
    /// <param name="BankIds">Overrides the set's banks for this search.</param>
    public sealed record Request(
        SearchFilters Filters,
        IReadOnlyList<Guid>? ChapterIds,
        QuestionSource? Source,
        IReadOnlyList<Guid>? BankIds,
        string? Cursor,
        int? Limit);

    public sealed record Query(Guid SetId, Request Body) : IQuery<SearchPage>;

    public sealed class Validator : AbstractValidator<Query>
    {
        public Validator()
        {
            RuleFor(x => x.Body).NotNull().WithMessage(Messages.Required);
            RuleFor(x => x.Body.Filters).NotNull().SetValidator(new SearchQuestions.FiltersValidator()).When(x => x.Body is not null);
            RuleFor(x => x.Body.ChapterIds).Must(c => c is null || c.Count <= 100).WithMessage(Messages.InvalidValue).When(x => x.Body is not null);
            RuleFor(x => x.Body.BankIds).Must(c => c is null || c.Count <= 50).WithMessage(Messages.InvalidValue).When(x => x.Body is not null);
            RuleFor(x => x.Body.Source).IsInEnum().WithMessage(Messages.InvalidValue).When(x => x.Body is not null);
        }
    }

    /// <summary>The picker (step 3): questions within the set's subject, chapters and type.</summary>
    internal sealed class Handler(SetAccess access, QuestionSearch search) : IQueryHandler<Query, SearchPage>
    {
        public async Task<SearchPage> Handle(Query query, CancellationToken ct)
        {
            var set = await access.GetAsync(query.SetId, ct);
            var body = query.Body;
            var chapters = body.ChapterIds is { Count: > 0 } wanted
                ? set.ChapterIds.Intersect(wanted).ToList()
                : set.ChapterIds.ToList();
            if (chapters.Count == 0)
            {
                return new SearchPage([], null, 0);
            }

            var scope = new SearchScope(
                set.SubjectId,
                chapters,
                set.Type,
                body.Source ?? set.Source,
                body.BankIds ?? set.BankIds,
                set.Id);
            return await search.SearchAsync(scope, body.Filters, body.Cursor, body.Limit, ct);
        }
    }
}

public static class SaveSetItems
{
    public sealed record ItemInput(Guid QuestionId, decimal? Marks);

    public sealed record Request(IReadOnlyList<ItemInput> Items);

    public sealed record Command(Guid SetId, Request Body) : ICommand<SetDetailDto>;

    public const decimal DefaultMcqMarks = 1m;
    public const decimal DefaultCqMarks = 10m;

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator()
        {
            RuleFor(x => x.Body.Items).NotNull().WithMessage(Messages.Required)
                .Must(i => i is null || i.Count <= SetScopeValidator.MaxTarget).WithMessage(Messages.TooManyItems)
                .Must(i => i is null || i.Select(x => x.QuestionId).Distinct().Count() == i.Count).WithMessage(Messages.InvalidValue);
            RuleForEach(x => x.Body.Items).ChildRules(item =>
                item.RuleFor(i => i.Marks).InclusiveBetween(0.5m, 100m).WithMessage(Messages.InvalidValue).When(i => i.Marks is not null));
        }
    }

    /// <summary>
    /// Replaces the set's questions in the given order. Common-information groups are completed automatically, the
    /// items version is bumped (new PDFs) and QuestionUsage is rewritten in the same transaction (unique mode).
    /// </summary>
    internal sealed class Handler(
        AppDbContext db,
        ITenantContext tenant,
        SetAccess access,
        IEntitlements entitlements,
        SetReader reader,
        TimeProvider clock) : ICommandHandler<Command, SetDetailDto>
    {
        public async Task<SetDetailDto> Handle(Command command, CancellationToken ct)
        {
            var set = await access.GetWithItemsAsync(command.SetId, ct);
            var institutionId = tenant.InstitutionId;
            var userId = tenant.UserId;
            var requested = command.Body.Items;
            var ids = requested.Select(i => i.QuestionId).ToList();
            var existingIds = set.Items.Select(i => i.QuestionId).ToList();

            // New questions must be visible; questions already in the set stay printable even if archived since.
            var visible = await Candidates(db.Questions.AsNoTracking().VisibleTo(institutionId, userId).Where(q => ids.Contains(q.Id)), ct);
            var kept = await Candidates(db.Questions.AsNoTracking().Where(q => ids.Contains(q.Id) && existingIds.Contains(q.Id)), ct);
            var found = visible.Concat(kept).DistinctBy(q => q.Id).ToDictionary(q => q.Id);

            if (ids.Any(id => !found.TryGetValue(id, out var q) || q.SubjectId != set.SubjectId || q.Type != set.Type))
            {
                throw SetAccess.Invalid("items", Messages.QuestionNotAvailable);
            }

            if (found.Values.Any(q => q.BankId is null && !existingIds.Contains(q.Id)))
            {
                await entitlements.EnsureSubjectAccessAsync(institutionId, set.SubjectId, ct);
            }

            var ordered = await CompleteGroupsAsync(requested, found, institutionId, userId, ct);
            if (ordered.Count > SetScopeValidator.MaxTarget)
            {
                throw SetAccess.Invalid("items", Messages.TooManyItems);
            }

            var marks = new Dictionary<Guid, decimal>();
            for (var i = 0; i < ordered.Count; i++)
            {
                var (questionId, requestedMarks) = ordered[i];
                var q = found[questionId];
                marks[questionId] = requestedMarks ?? q.Type switch
                {
                    QuestionType.Mcq => DefaultMcqMarks,
                    QuestionType.Cq => q.PartMarks > 0 ? q.PartMarks : DefaultCqMarks,
                    _ => throw SetAccess.Invalid(string.Create(CultureInfo.InvariantCulture, $"items[{i}].marks"), Messages.Required),
                };
            }

            var now = clock.GetUtcNow();
            await using var tx = await db.Database.BeginTransactionAsync(ct);

            // Diff instead of delete + insert: the item key is (SetId, QuestionId).
            var positions = ordered.Select((o, i) => (o.QuestionId, Position: i + 1)).ToDictionary(x => x.QuestionId, x => x.Position);
            foreach (var item in set.Items.ToList())
            {
                if (positions.TryGetValue(item.QuestionId, out var position))
                {
                    item.Position = position;
                    item.Marks = marks[item.QuestionId];
                }
                else
                {
                    set.Items.Remove(item);
                    db.QuestionSetItems.Remove(item);
                }
            }

            foreach (var (questionId, position) in positions.Where(p => !existingIds.Contains(p.Key)))
            {
                set.Items.Add(new QuestionSetItem { SetId = set.Id, QuestionId = questionId, Position = position, Marks = marks[questionId] });
            }

            await db.QuestionUsages.Where(u => u.SetId == set.Id).ExecuteDeleteAsync(ct);
            db.QuestionUsages.AddRange(positions.Keys.Select(questionId => new QuestionUsage
            {
                InstitutionId = set.InstitutionId,
                QuestionId = questionId,
                SetId = set.Id,
                UsedAt = now,
            }));

            set.ItemsVersion++;
            set.UpdatedAt = now;
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return await reader.DetailAsync(set.Id, ct);
        }

        private static Task<List<Candidate>> Candidates(IQueryable<Question> query, CancellationToken ct) =>
            query.Select(q => new Candidate(
                    q.Id,
                    q.SubjectId,
                    q.Type,
                    q.McqKind,
                    q.StimulusId,
                    q.BankId,
                    q.CqParts.Sum(p => p.Marks)))
                .ToListAsync(ct);

        /// <summary>Adds missing siblings of common-information questions right after the group's last selected member.</summary>
        private async Task<List<(Guid QuestionId, decimal? Marks)>> CompleteGroupsAsync(
            IReadOnlyList<ItemInput> requested, Dictionary<Guid, Candidate> found, Guid institutionId, Guid userId, CancellationToken ct)
        {
            var ordered = requested.Select(i => (i.QuestionId, i.Marks)).ToList();
            var groups = found.Values
                .Where(q => q is { McqKind: McqKind.CommonInfo, StimulusId: not null })
                .Select(q => q.StimulusId!.Value)
                .Distinct()
                .ToList();
            if (groups.Count == 0)
            {
                return ordered;
            }

            var siblings = await Candidates(
                db.Questions.AsNoTracking()
                    .VisibleTo(institutionId, userId)
                    .Where(q => q.StimulusId != null && groups.Contains(q.StimulusId.Value) && q.McqKind == McqKind.CommonInfo)
                    .OrderBy(q => q.Id),
                ct);

            foreach (var group in siblings.GroupBy(s => s.StimulusId!.Value))
            {
                var missing = group.Where(s => !found.ContainsKey(s.Id)).ToList();
                if (missing.Count == 0)
                {
                    continue;
                }

                var lastIndex = ordered.FindLastIndex(o => found[o.QuestionId].StimulusId == group.Key);
                ordered.InsertRange(lastIndex + 1, missing.Select(m => (m.Id, (decimal?)null)));
                foreach (var m in missing)
                {
                    found[m.Id] = m;
                }
            }

            return ordered;
        }

        private sealed record Candidate(
            Guid Id,
            Guid SubjectId,
            QuestionType Type,
            McqKind? McqKind,
            Guid? StimulusId,
            Guid? BankId,
            decimal PartMarks);
    }
}

public static class AutoSelectQuestions
{
    /// <param name="Filters">Picker filters; defaults to the set's mode.</param>
    /// <param name="TargetCount">Defaults to the set's target.</param>
    /// <param name="KeepExisting">Keep the current items and only top up.</param>
    /// <param name="Seed">Fixed seed for a reproducible pick; random when omitted.</param>
    public sealed record Request(SearchFilters? Filters, int? TargetCount, bool KeepExisting, uint? Seed);

    public sealed record Query(Guid SetId, Request Body) : IQuery<Response>;

    /// <summary>Selected ids in order; nothing is saved until <c>saveSetItems</c>.</summary>
    public sealed record Response(IReadOnlyList<Guid> QuestionIds, int AvailableCount, string? ShortfallMessage);

    public const int MaxCandidates = 20_000;

    public sealed class Validator : AbstractValidator<Query>
    {
        public Validator()
        {
            RuleFor(x => x.Body).NotNull().WithMessage(Messages.Required);
            RuleFor(x => x.Body.TargetCount).InclusiveBetween(1, SetScopeValidator.MaxTarget).WithMessage(Messages.TargetCountRange)
                .When(x => x.Body?.TargetCount is not null);
            RuleFor(x => x.Body.Filters!).SetValidator(new SearchQuestions.FiltersValidator()).When(x => x.Body?.Filters is not null);
        }
    }

    /// <summary>One-click selection: spreads questions over the chapters (see <see cref="AutoSelector"/>).</summary>
    internal sealed class Handler(AppDbContext db, SetAccess access, QuestionSearch search) : IQueryHandler<Query, Response>
    {
        public async Task<Response> Handle(Query query, CancellationToken ct)
        {
            var set = await access.GetAsync(query.SetId, ct);
            var body = query.Body;
            var target = body.TargetCount ?? set.TargetCount;
            var existing = body.KeepExisting
                ? await db.QuestionSetItems.AsNoTracking()
                    .Where(i => i.SetId == set.Id)
                    .OrderBy(i => i.Position)
                    .Select(i => i.QuestionId)
                    .ToListAsync(ct)
                : [];

            var filters = body.Filters ?? new SearchFilters { Mode = SetAccess.SearchModeFor(set.Mode) };
            var scope = new SearchScope(set.SubjectId, set.ChapterIds, set.Type, set.Source, set.BankIds, set.Id);
            var candidatesQuery = (await search.QueryAsync(scope, filters, ct)).Where(q => !existing.Contains(q.Id));
            var available = await candidatesQuery.CountAsync(ct);

            var remaining = target - existing.Count;
            var picked = new List<Guid>();
            if (remaining > 0)
            {
                var candidates = await candidatesQuery
                    .OrderBy(q => q.Id)
                    .Take(MaxCandidates)
                    .Select(q => new SelectionCandidate(q.Id, q.ChapterId, q.McqKind == McqKind.CommonInfo ? q.StimulusId : null))
                    .ToListAsync(ct);
                picked.AddRange(AutoSelector.Select(candidates, remaining, body.Seed ?? SetAccess.NewSeed()).QuestionIds);
            }

            var ids = existing.Concat(picked).ToList();
            var shortfall = ids.Count < target
                ? string.Format(
                    CultureInfo.InvariantCulture,
                    Messages.AutoSelectShortfall,
                    BanglaText.ToBanglaDigits(target),
                    BanglaText.ToBanglaDigits(ids.Count))
                : null;
            return new Response(ids, available + existing.Count, shortfall);
        }
    }
}

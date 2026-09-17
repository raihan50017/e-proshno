using EProshno.Api.Common;
using EProshno.Api.Features.QuestionBanks;
using EProshno.Core.Billing;
using EProshno.Core.Common;
using EProshno.Core.Questions;
using EProshno.Core.Sets;
using EProshno.Infrastructure.Billing;
using EProshno.Infrastructure.Imports;
using EProshno.Infrastructure.Persistence;
using EProshno.Infrastructure.Questions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace EProshno.Api.Features.Questions;

public static class SearchQuestions
{
    public sealed record Query(
        Guid SubjectId,
        IReadOnlyList<Guid> ChapterIds,
        QuestionType? Type,
        QuestionSource Source,
        IReadOnlyList<Guid> BankIds,
        SearchFilters Filters,
        string? Cursor,
        int? Limit) : IQuery<SearchPage>;

    public sealed class Validator : AbstractValidator<Query>
    {
        public Validator()
        {
            RuleFor(x => x.SubjectId).NotEmpty().WithMessage(Messages.Required);
            RuleFor(x => x.ChapterIds).Must(c => c.Count <= 100).WithMessage(Messages.InvalidValue);
            RuleFor(x => x.BankIds).Must(c => c.Count <= 100).WithMessage(Messages.InvalidValue);
            RuleFor(x => x.Source).IsInEnum().WithMessage(Messages.InvalidValue);
            RuleFor(x => x.Filters).NotNull().SetValidator(new FiltersValidator());
        }
    }

    public sealed class FiltersValidator : AbstractValidator<SearchFilters>
    {
        public FiltersValidator()
        {
            RuleFor(x => x.Keyword).MaximumLength(QuestionSearch.MaxKeywordLength).WithMessage(Messages.TooLong);
            RuleFor(x => x.Mode).IsInEnum().WithMessage(Messages.InvalidValue);
            RuleFor(x => x.TopicIds).Must(c => c.Count <= 100).WithMessage(Messages.InvalidValue);
            RuleFor(x => x.TagIds).Must(c => c.Count <= 50).WithMessage(Messages.InvalidValue);
        }
    }

    internal sealed class Handler(QuestionSearch search) : IQueryHandler<Query, SearchPage>
    {
        public Task<SearchPage> Handle(Query query, CancellationToken ct) =>
            search.SearchAsync(
                new SearchScope(query.SubjectId, query.ChapterIds, query.Type, query.Source, query.BankIds),
                query.Filters,
                query.Cursor,
                query.Limit,
                ct);
    }
}

public static class GetQuestion
{
    public sealed record Query(Guid Id) : IQuery<QuestionDetail>;

    /// <summary>A question the teacher can see; platform questions need the subject subscription.</summary>
    internal sealed class Handler(AppDbContext db, ITenantContext tenant, IEntitlements entitlements, QuestionReader reader)
        : IQueryHandler<Query, QuestionDetail>
    {
        public async Task<QuestionDetail> Handle(Query query, CancellationToken ct)
        {
            var q = await db.Questions.AsNoTracking()
                .VisibleTo(tenant.InstitutionId, tenant.UserId)
                .Where(x => x.Id == query.Id)
                .Select(x => new { x.BankId, x.SubjectId })
                .FirstOr404Async(ct);
            if (q.BankId is null)
            {
                await entitlements.EnsureSubjectAccessAsync(tenant.InstitutionId, q.SubjectId, ct);
            }

            return await reader.DetailAsync(query.Id, ct);
        }
    }
}

public static class ReportQuestion
{
    public sealed record Request(string Reason);

    public sealed record Command(Guid Id, Request Body) : ICommand<Unit>;

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator() =>
            RuleFor(x => x.Body.Reason).NotEmpty().WithMessage(Messages.ReportReasonRequired).MaximumLength(500).WithMessage(Messages.TooLong);
    }

    internal sealed class Handler(AppDbContext db, ITenantContext tenant, TimeProvider clock) : ICommandHandler<Command, Unit>
    {
        public async Task<Unit> Handle(Command command, CancellationToken ct)
        {
            var exists = await db.Questions.VisibleTo(tenant.InstitutionId, tenant.UserId)
                .AnyAsync(q => q.Id == command.Id && q.BankId == null, ct);
            if (!exists)
            {
                throw AppException.NotFound();
            }

            db.QuestionReports.Add(new QuestionReport
            {
                Id = IdGen.New(),
                InstitutionId = tenant.InstitutionId,
                QuestionId = command.Id,
                ReporterId = tenant.UserId,
                Reason = command.Body.Reason.Trim(),
                Status = ReportStatus.Open,
                CreatedAt = clock.GetUtcNow(),
            });
            await db.SaveChangesAsync(ct);
            return Unit.Value;
        }
    }
}

public static class CopyQuestions
{
    public sealed record Command(IReadOnlyList<Guid> QuestionIds, Guid BankId) : ICommand<Response>;

    public sealed record Response(IReadOnlyList<Guid> CreatedIds);

    public const int MaxPerRequest = 50;

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator()
        {
            RuleFor(x => x.QuestionIds).NotEmpty().WithMessage(Messages.Required)
                .Must(ids => ids.Count <= MaxPerRequest).WithMessage(Messages.InvalidValue);
            RuleFor(x => x.BankId).NotEmpty().WithMessage(Messages.BanksRequired);
        }
    }

    /// <summary>
    /// "Copy to my bank": editable copies of published platform questions (a CommonInfo question brings its whole
    /// group), only for subscribed subjects.
    /// </summary>
    internal sealed class Handler(
        AppDbContext db,
        ITenantContext tenant,
        BankAccess banks,
        IEntitlements entitlements,
        QuestionWriter writer) : ICommandHandler<Command, Response>
    {
        public async Task<Response> Handle(Command command, CancellationToken ct)
        {
            var bank = await banks.GetWritableAsync(command.BankId, ct);
            var institutionId = tenant.InstitutionId;

            var requested = await db.Questions.AsNoTracking()
                .Where(q => command.QuestionIds.Contains(q.Id) && q.BankId == null && q.Status == ContentStatus.Published)
                .Select(q => new { q.Id, q.SubjectId, q.StimulusId, q.McqKind })
                .ToListAsync(ct);
            if (requested.Count == 0)
            {
                throw AppException.NotFound();
            }

            foreach (var subjectId in requested.Select(r => r.SubjectId).Distinct())
            {
                await entitlements.EnsureSubjectAccessAsync(institutionId, subjectId, ct);
            }

            var groupStimuli = requested.Where(r => r.McqKind == McqKind.CommonInfo && r.StimulusId != null)
                .Select(r => r.StimulusId!.Value).Distinct().ToList();
            var siblings = await db.Questions.AsNoTracking()
                .Where(q => q.StimulusId != null && groupStimuli.Contains(q.StimulusId.Value)
                            && q.BankId == null && q.Status == ContentStatus.Published)
                .OrderBy(q => q.Id)
                .Select(q => q.Id)
                .ToListAsync(ct);
            var ids = requested.Select(r => r.Id).Concat(siblings).Distinct().ToList();

            await entitlements.AssertWithinLimitAsync(institutionId, LimitKey.CustomQuestions, ct, ids.Count);

            var copies = await writer.CopyAsync(ids, bank.Id, banks.StatusForNew(bank), tenant.UserId, ct);
            await db.SaveChangesAsync(ct);
            await BankCounter.RecountAsync(db, bank.Id, ct);
            return new Response(copies.Select(c => c.Id).ToList());
        }
    }
}

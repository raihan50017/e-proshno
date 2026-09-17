using EProshno.Api.Common;
using EProshno.Api.Features.Questions;
using EProshno.Core.Billing;
using EProshno.Core.Common;
using EProshno.Core.Questions;
using EProshno.Core.Text;
using EProshno.Infrastructure.Billing;
using EProshno.Infrastructure.Imports;
using EProshno.Infrastructure.Persistence;
using EProshno.Infrastructure.Questions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace EProshno.Api.Features.QuestionBanks;

public sealed record BankQuestionPage(IReadOnlyList<QuestionCard> Items, string? NextCursor, int TotalCount);

public static class ListBankQuestions
{
    public sealed record Query(
        Guid BankId,
        ContentStatus? Status,
        Guid? SubjectId,
        Guid? ChapterId,
        QuestionType? Type,
        Guid? TagId,
        string? Keyword,
        string? Cursor,
        int? Limit) : IQuery<BankQuestionPage>;

    internal sealed class Handler(AppDbContext db, BankAccess access, QuestionReader reader) : IQueryHandler<Query, BankQuestionPage>
    {
        public async Task<BankQuestionPage> Handle(Query query, CancellationToken ct)
        {
            var bank = await access.GetReadableAsync(query.BankId, ct);
            var q = db.Questions.AsNoTracking().Where(x => x.BankId == bank.Id);
            q = query.Status is { } status ? q.Where(x => x.Status == status) : q.Where(x => x.Status != ContentStatus.Archived);

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

            if (query.TagId is { } tagId)
            {
                q = q.Where(x => x.Tags.Any(t => t.TagId == tagId));
            }

            if (!string.IsNullOrWhiteSpace(query.Keyword))
            {
                var pattern = $"%{LikePattern.Escape(BanglaText.Normalize(query.Keyword))}%";
                q = q.Where(x => EF.Functions.ILike(x.StemText, pattern, @"\"));
            }

            var total = await q.CountAsync(ct);
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

            return new BankQuestionPage(cards, next, total);
        }
    }
}

public static class GetBankQuestion
{
    public sealed record Query(Guid BankId, Guid QuestionId) : IQuery<QuestionDetail>;

    internal sealed class Handler(BankAccess access, QuestionReader reader) : IQueryHandler<Query, QuestionDetail>
    {
        public async Task<QuestionDetail> Handle(Query query, CancellationToken ct)
        {
            var bank = await access.GetReadableAsync(query.BankId, ct);
            await access.GetQuestionAsync(bank, query.QuestionId, ct);
            return await reader.DetailAsync(query.QuestionId, ct);
        }
    }
}

public static class SaveBankQuestion
{
    public sealed record Command(Guid BankId, Guid? QuestionId, QuestionContent Body) : ICommand<SavedQuestion>;

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator(QuestionContentValidator content) => RuleFor(x => x.Body).NotNull().SetValidator(content);
    }

    /// <summary>
    /// Hand-written custom questions. Same content in the same bank is rejected; the same content elsewhere in the
    /// institution or in the platform bank is saved with a warning.
    /// </summary>
    internal sealed class Handler(
        AppDbContext db,
        ITenantContext tenant,
        BankAccess access,
        IEntitlements entitlements,
        QuestionWriter writer) : ICommandHandler<Command, SavedQuestion>
    {
        public async Task<SavedQuestion> Handle(Command command, CancellationToken ct)
        {
            var institutionId = tenant.InstitutionId;
            var bank = await access.GetWritableAsync(command.BankId, ct);
            var content = command.Body with { IsCommon = false };
            await writer.ValidateReferencesAsync(content, institutionId, bank.Id, ct);

            var hash = QuestionRules.Fingerprint(content);
            var matches = await db.Questions.AsNoTracking()
                .Where(q => q.ContentHash == hash && q.Status != ContentStatus.Archived && q.Id != command.QuestionId)
                .Where(q => q.BankId == null ? q.Status == ContentStatus.Published : q.Bank!.InstitutionId == institutionId)
                .Select(q => q.BankId)
                .ToListAsync(ct);
            if (matches.Contains(bank.Id))
            {
                throw AppException.Conflict("question.duplicate", Messages.DuplicateInBank);
            }

            Question question;
            if (command.QuestionId is { } id)
            {
                question = await access.GetQuestionAsync(bank, id, ct);
                if (!access.CanEditQuestion(bank, question))
                {
                    throw AppException.Forbidden(Messages.BankNotEditable);
                }

                await writer.UpdateAsync(question, content, ct);
                if (question.Status != ContentStatus.Archived)
                {
                    question.Status = access.StatusForNew(bank);
                }
            }
            else
            {
                await entitlements.AssertWithinLimitAsync(institutionId, LimitKey.CustomQuestions, ct);
                question = writer.Create(content, bank.Id, access.StatusForNew(bank), tenant.UserId);
            }

            await db.SaveChangesAsync(ct);
            await BankCounter.RecountAsync(db, bank.Id, ct);
            return new SavedQuestion(question.Id, question.Status, matches.Count > 0);
        }
    }
}

public static class DeleteBankQuestion
{
    public sealed record Command(Guid BankId, Guid QuestionId) : ICommand<Unit>;

    internal sealed class Handler(AppDbContext db, BankAccess access, BankQuestionRemover remover) : ICommandHandler<Command, Unit>
    {
        public async Task<Unit> Handle(Command command, CancellationToken ct)
        {
            var bank = await access.GetReadableAsync(command.BankId, ct);
            var question = await access.GetQuestionAsync(bank, command.QuestionId, ct);
            if (!access.CanEditQuestion(bank, question))
            {
                throw AppException.Forbidden(Messages.BankNotEditable);
            }

            await remover.RemoveAsync(bank.Id, [question.Id], ct);
            await BankCounter.RecountAsync(db, bank.Id, ct);
            return Unit.Value;
        }
    }
}

/// <summary>Deletes questions that no set uses and archives the rest (they stay printable).</summary>
public sealed class BankQuestionRemover(AppDbContext db, TimeProvider clock)
{
    public async Task RemoveAsync(Guid bankId, IReadOnlyList<Guid> ids, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var scoped = db.Questions.Where(q => q.BankId == bankId && ids.Contains(q.Id));
        var stimulusIds = await scoped.Where(q => q.StimulusId != null).Select(q => q.StimulusId!.Value).Distinct().ToListAsync(ct);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await scoped.Where(q => db.QuestionSetItems.Any(i => i.QuestionId == q.Id))
            .ExecuteUpdateAsync(s => s.SetProperty(q => q.Status, ContentStatus.Archived).SetProperty(q => q.UpdatedAt, now), ct);
        await scoped.Where(q => !db.QuestionSetItems.Any(i => i.QuestionId == q.Id)).ExecuteDeleteAsync(ct);
        if (stimulusIds.Count > 0)
        {
            await db.Stimuli.Where(s => stimulusIds.Contains(s.Id) && !db.Questions.Any(q => q.StimulusId == s.Id)).ExecuteDeleteAsync(ct);
        }

        await tx.CommitAsync(ct);
    }
}

public enum BulkAction
{
    Move,
    SetChapter,
    SetDifficulty,
    SetImportance,
    AddTags,
    RemoveTags,
    Delete,
}

public static class BulkBankQuestions
{
    public sealed record Request(
        IReadOnlyList<Guid> QuestionIds,
        BulkAction Action,
        Guid? TargetBankId,
        Guid? ChapterId,
        Guid? TopicId,
        byte? Value,
        IReadOnlyList<Guid>? TagIds);

    public sealed record Command(Guid BankId, Request Body) : ICommand<Response>;

    public sealed record Response(int Affected);

    public const int MaxPerRequest = 500;

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator()
        {
            RuleFor(x => x.Body.QuestionIds).NotEmpty().WithMessage(Messages.Required)
                .Must(ids => ids.Count <= MaxPerRequest).WithMessage(Messages.InvalidValue);
            RuleFor(x => x.Body.Action).IsInEnum().WithMessage(Messages.InvalidValue);
            RuleFor(x => x.Body.TargetBankId).NotNull().WithMessage(Messages.BanksRequired).When(x => x.Body.Action == BulkAction.Move);
            RuleFor(x => x.Body.ChapterId).NotNull().WithMessage(Messages.ChaptersRequired).When(x => x.Body.Action == BulkAction.SetChapter);
            RuleFor(x => x.Body.Value).NotNull().InclusiveBetween((byte)1, (byte)3).WithMessage(Messages.DifficultyRange)
                .When(x => x.Body.Action == BulkAction.SetDifficulty);
            RuleFor(x => x.Body.Value).NotNull().InclusiveBetween((byte)0, (byte)3).WithMessage(Messages.ImportanceRange)
                .When(x => x.Body.Action == BulkAction.SetImportance);
            RuleFor(x => x.Body.TagIds).NotEmpty().WithMessage(Messages.Required)
                .When(x => x.Body.Action is BulkAction.AddTags or BulkAction.RemoveTags);
        }
    }

    /// <summary>Bank managers only (owner or admin); questions are matched inside the bank.</summary>
    internal sealed class Handler(
        AppDbContext db,
        BankAccess access,
        BankQuestionRemover remover,
        TimeProvider clock) : ICommandHandler<Command, Response>
    {
        public async Task<Response> Handle(Command command, CancellationToken ct)
        {
            var bank = await access.GetManageableAsync(command.BankId, ct);
            var body = command.Body;
            var ids = await db.Questions.Where(q => q.BankId == bank.Id && body.QuestionIds.Contains(q.Id)).Select(q => q.Id).ToListAsync(ct);
            var now = clock.GetUtcNow();
            var scoped = db.Questions.Where(q => ids.Contains(q.Id));

            switch (body.Action)
            {
                case BulkAction.Move:
                {
                    var target = await access.GetWritableAsync(body.TargetBankId!.Value, ct);

                    // CommonInfo groups move together or not at all.
                    var groups = await scoped.Where(q => q.McqKind == McqKind.CommonInfo && q.StimulusId != null)
                        .Select(q => q.StimulusId).Distinct().ToListAsync(ct);
                    var outside = await db.Questions.AnyAsync(
                        q => q.BankId == bank.Id && groups.Contains(q.StimulusId) && !ids.Contains(q.Id), ct);
                    if (outside)
                    {
                        throw AppException.Conflict("bulk.group", Messages.ImportGroupIncomplete);
                    }

                    var targetId = target.Id;
                    var newStatus = access.StatusForNew(target);
                    await scoped.ExecuteUpdateAsync(s => s
                        .SetProperty(q => q.BankId, targetId)
                        .SetProperty(q => q.Status, q => q.Status == ContentStatus.Archived ? q.Status : newStatus)
                        .SetProperty(q => q.UpdatedAt, now), ct);
                    await BankCounter.RecountAsync(db, target.Id, ct);
                    break;
                }

                case BulkAction.SetChapter:
                {
                    var chapterId = body.ChapterId!.Value;
                    var institutionId = bank.InstitutionId;
                    var chapter = await db.Chapters
                        .Where(c => c.Id == chapterId && (c.InstitutionId == null || c.InstitutionId == institutionId))
                        .Select(c => new { c.SubjectId })
                        .FirstOr404Async(ct);
                    var topicOk = body.TopicId is null || await db.Topics.AnyAsync(t => t.Id == body.TopicId && t.ChapterId == chapterId, ct);
                    if (!topicOk)
                    {
                        throw AppException.NotFound(Messages.TopicNotInChapter);
                    }

                    await scoped.ExecuteUpdateAsync(s => s
                        .SetProperty(q => q.SubjectId, chapter.SubjectId)
                        .SetProperty(q => q.ChapterId, chapterId)
                        .SetProperty(q => q.TopicId, body.TopicId)
                        .SetProperty(q => q.UpdatedAt, now), ct);
                    break;
                }

                case BulkAction.SetDifficulty:
                    await scoped.ExecuteUpdateAsync(s => s.SetProperty(q => q.Difficulty, body.Value!.Value).SetProperty(q => q.UpdatedAt, now), ct);
                    break;

                case BulkAction.SetImportance:
                    await scoped.ExecuteUpdateAsync(s => s.SetProperty(q => q.Importance, body.Value!.Value).SetProperty(q => q.UpdatedAt, now), ct);
                    break;

                case BulkAction.AddTags:
                {
                    var tagIds = await db.QuestionTags.Where(t => body.TagIds!.Contains(t.Id)).Select(t => t.Id).ToListAsync(ct);
                    var existing = await db.QuestionTagLinks.Where(l => ids.Contains(l.QuestionId) && tagIds.Contains(l.TagId))
                        .Select(l => new { l.QuestionId, l.TagId }).ToListAsync(ct);
                    foreach (var questionId in ids)
                    {
                        foreach (var tagId in tagIds.Where(t => !existing.Any(e => e.QuestionId == questionId && e.TagId == t)))
                        {
                            db.QuestionTagLinks.Add(new QuestionTagLink { QuestionId = questionId, TagId = tagId });
                        }
                    }

                    await db.SaveChangesAsync(ct);
                    break;
                }

                case BulkAction.RemoveTags:
                    await db.QuestionTagLinks.Where(l => ids.Contains(l.QuestionId) && body.TagIds!.Contains(l.TagId)).ExecuteDeleteAsync(ct);
                    break;

                case BulkAction.Delete:
                    await remover.RemoveAsync(bank.Id, ids, ct);
                    break;
            }

            await BankCounter.RecountAsync(db, bank.Id, ct);
            return new Response(ids.Count);
        }
    }
}

public static class ReviewBankQuestion
{
    public sealed record Request(bool Approve, string? Note);

    public sealed record Command(Guid BankId, Guid QuestionId, Request Body) : ICommand<Unit>;

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator()
        {
            RuleFor(x => x.Body.Note).NotEmpty().WithMessage(Messages.Required).When(x => !x.Body.Approve);
            RuleFor(x => x.Body.Note).MaximumLength(500).WithMessage(Messages.TooLong);
        }
    }

    /// <summary>Institution admins approve (Published) or send back (Draft with a note) pending questions.</summary>
    internal sealed class Handler(AppDbContext db, BankAccess access, TimeProvider clock) : ICommandHandler<Command, Unit>
    {
        public async Task<Unit> Handle(Command command, CancellationToken ct)
        {
            var bank = await access.GetReadableAsync(command.BankId, ct);
            var question = await access.GetQuestionAsync(bank, command.QuestionId, ct);
            var target = command.Body.Approve ? ContentStatus.Published : ContentStatus.Draft;
            if (!QuestionRules.CanTransition(question.Status, target) || question.Status != ContentStatus.PendingApproval)
            {
                throw AppException.Conflict("question.status", Messages.InvalidStatusChange);
            }

            var now = clock.GetUtcNow();
            question.Status = target;
            question.ReviewNote = command.Body.Approve ? null : command.Body.Note?.Trim();
            question.UpdatedAt = now;
            if (command.Body.Approve)
            {
                question.PublishedAt ??= now;
            }

            await db.SaveChangesAsync(ct);
            await BankCounter.RecountAsync(db, bank.Id, ct);
            return Unit.Value;
        }
    }
}

public static class ListPendingQuestions
{
    public sealed record Query(string? Cursor, int? Limit) : IQuery<AdminQuestionPage>;

    /// <summary>Everything waiting for approval in the institution's banks.</summary>
    internal sealed class Handler(AppDbContext db, ITenantContext tenant, QuestionReader reader) : IQueryHandler<Query, AdminQuestionPage>
    {
        public async Task<AdminQuestionPage> Handle(Query query, CancellationToken ct)
        {
            var institutionId = tenant.InstitutionId;
            var q = db.Questions.AsNoTracking()
                .Where(x => x.Status == ContentStatus.PendingApproval && x.BankId != null && x.Bank!.InstitutionId == institutionId);
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

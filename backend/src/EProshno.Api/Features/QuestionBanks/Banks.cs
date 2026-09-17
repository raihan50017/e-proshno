using EProshno.Api.Common;
using EProshno.Core.Billing;
using EProshno.Core.Common;
using EProshno.Core.Institutions;
using EProshno.Core.Questions;
using EProshno.Infrastructure.Billing;
using EProshno.Infrastructure.Identity;
using EProshno.Infrastructure.Institutions;
using EProshno.Infrastructure.Papers;
using EProshno.Infrastructure.Persistence;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace EProshno.Api.Features.QuestionBanks;

public sealed record BankDto(
    Guid Id,
    string Name,
    string? Description,
    Guid? LevelId,
    Guid? SubjectId,
    string? SubjectLabel,
    BankSharing Sharing,
    bool RequireApproval,
    bool IsDefault,
    int QuestionCount,
    int PendingCount,
    Guid OwnerId,
    string OwnerName,
    bool IsOwner,
    bool CanManage,
    bool CanWrite,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

internal static class BankProjection
{
    public static async Task<List<BankDto>> ToDtosAsync(AppDbContext db, BankAccess access, ITenantContext tenant, IQueryable<QuestionBank> banks, CancellationToken ct)
    {
        var rows = await (
                from b in banks.AsNoTracking()
                join u in db.Set<AppUser>() on b.OwnerId equals u.Id
                select new
                {
                    Bank = b,
                    OwnerName = u.FullName,
                    Subject = db.Subjects.Where(s => s.Id == b.SubjectId).Select(s => new { s.NameBn, s.Paper }).FirstOrDefault(),
                    Pending = db.Questions.Count(q => q.BankId == b.Id && q.Status == ContentStatus.PendingApproval),
                })
            .ToListAsync(ct);

        return rows
            .OrderByDescending(r => r.Bank.IsDefault && r.Bank.OwnerId == tenant.CurrentUserId)
            .ThenBy(r => r.Bank.Name, StringComparer.Ordinal)
            .Select(r => new BankDto(
                r.Bank.Id,
                r.Bank.Name,
                r.Bank.Description,
                r.Bank.LevelId,
                r.Bank.SubjectId,
                r.Subject is null ? null : PaperLoader.SubjectLabel(r.Subject.NameBn, r.Subject.Paper),
                r.Bank.Sharing,
                r.Bank.RequireApproval,
                r.Bank.IsDefault,
                r.Bank.QuestionCount,
                r.Pending,
                r.Bank.OwnerId,
                r.OwnerName,
                r.Bank.OwnerId == tenant.CurrentUserId,
                access.CanManage(r.Bank),
                access.CanWrite(r.Bank),
                r.Bank.CreatedAt,
                r.Bank.UpdatedAt))
            .ToList();
    }
}

public static class ListBanks
{
    public sealed record Query : IQuery<IReadOnlyList<BankDto>>;

    /// <summary>Also creates the teacher's default "আমার প্রশ্ন" bank on first use.</summary>
    internal sealed class Handler(AppDbContext db, ITenantContext tenant, BankAccess access, InstitutionSetup setup)
        : IQueryHandler<Query, IReadOnlyList<BankDto>>
    {
        public async Task<IReadOnlyList<BankDto>> Handle(Query query, CancellationToken ct)
        {
            await setup.EnsureDefaultBankAsync(tenant.InstitutionId, tenant.UserId, ct);
            return await BankProjection.ToDtosAsync(db, access, tenant, access.Readable(), ct);
        }
    }
}

public static class GetBank
{
    public sealed record Query(Guid Id) : IQuery<BankDto>;

    internal sealed class Handler(AppDbContext db, ITenantContext tenant, BankAccess access) : IQueryHandler<Query, BankDto>
    {
        public async Task<BankDto> Handle(Query query, CancellationToken ct) =>
            (await BankProjection.ToDtosAsync(db, access, tenant, access.Readable().Where(b => b.Id == query.Id), ct)).FirstOrDefault()
            ?? throw AppException.NotFound();
    }
}

public static class SaveBank
{
    public sealed record Request(
        string Name,
        string? Description,
        Guid? LevelId,
        Guid? SubjectId,
        BankSharing Sharing,
        bool RequireApproval);

    public sealed record Command(Guid? Id, Request Body) : ICommand<BankDto>;

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator()
        {
            RuleFor(x => x.Body.Name).NotEmpty().WithMessage(Messages.BankNameRequired).MaximumLength(120).WithMessage(Messages.TooLong);
            RuleFor(x => x.Body.Description).MaximumLength(500).WithMessage(Messages.TooLong);
            RuleFor(x => x.Body.Sharing).IsInEnum().WithMessage(Messages.InvalidValue);
        }
    }

    internal sealed class Handler(
        AppDbContext db,
        ITenantContext tenant,
        BankAccess access,
        IEntitlements entitlements,
        TimeProvider clock) : ICommandHandler<Command, BankDto>
    {
        public async Task<BankDto> Handle(Command command, CancellationToken ct)
        {
            var body = command.Body;
            var now = clock.GetUtcNow();
            var institutionId = tenant.InstitutionId;

            if (body.SubjectId is { } subjectId
                && !await db.Subjects.AnyAsync(s => s.Id == subjectId && (s.InstitutionId == null || s.InstitutionId == institutionId), ct))
            {
                throw AppException.NotFound(Messages.SubjectNotFound);
            }

            QuestionBank bank;
            if (command.Id is { } id)
            {
                bank = await access.GetManageableAsync(id, ct);
            }
            else
            {
                await entitlements.AssertWithinLimitAsync(institutionId, LimitKey.CustomBanks, ct);
                bank = new QuestionBank
                {
                    Id = IdGen.New(),
                    InstitutionId = institutionId,
                    OwnerId = tenant.UserId,
                    CreatedAt = now,
                };
                db.QuestionBanks.Add(bank);
            }

            // Only admins decide whether a bank needs approval.
            if (bank.RequireApproval != body.RequireApproval && !tenant.IsInstitutionAdmin)
            {
                throw AppException.Forbidden();
            }

            bank.Name = body.Name.Trim();
            bank.Description = string.IsNullOrWhiteSpace(body.Description) ? null : body.Description.Trim();
            bank.LevelId = body.LevelId;
            bank.SubjectId = body.SubjectId;
            bank.Sharing = body.Sharing;
            bank.RequireApproval = body.RequireApproval;
            bank.UpdatedAt = now;
            await db.SaveChangesAsync(ct);

            return (await BankProjection.ToDtosAsync(db, access, tenant, db.QuestionBanks.Where(b => b.Id == bank.Id), ct)).Single();
        }
    }
}

public static class ArchiveBank
{
    public sealed record Command(Guid Id) : ICommand<Unit>;

    /// <summary>Archiving a bank archives its questions; they stay printable in existing sets.</summary>
    internal sealed class Handler(AppDbContext db, BankAccess access, TimeProvider clock) : ICommandHandler<Command, Unit>
    {
        public async Task<Unit> Handle(Command command, CancellationToken ct)
        {
            var bank = await access.GetManageableAsync(command.Id, ct);
            if (bank.IsDefault)
            {
                throw AppException.Conflict("bank.default", Messages.CannotArchiveDefaultBank);
            }

            var now = clock.GetUtcNow();
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            await db.Questions
                .Where(q => q.BankId == bank.Id && q.Status != ContentStatus.Archived)
                .ExecuteUpdateAsync(s => s.SetProperty(q => q.Status, ContentStatus.Archived).SetProperty(q => q.UpdatedAt, now), ct);
            bank.ArchivedAt = now;
            bank.UpdatedAt = now;
            bank.QuestionCount = 0;
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return Unit.Value;
        }
    }
}

public static class TransferBank
{
    public sealed record Request(Guid OwnerId);

    public sealed record Command(Guid Id, Request Body) : ICommand<Unit>;

    /// <summary>Institution admins reassign a bank, e.g. when a teacher leaves.</summary>
    internal sealed class Handler(AppDbContext db, ITenantContext tenant, BankAccess access, TimeProvider clock) : ICommandHandler<Command, Unit>
    {
        public async Task<Unit> Handle(Command command, CancellationToken ct)
        {
            var bank = await access.GetReadableAsync(command.Id, ct);
            var institutionId = tenant.InstitutionId;
            var isMember = await db.Memberships.AnyAsync(
                m => m.InstitutionId == institutionId && m.UserId == command.Body.OwnerId && m.Status == MembershipStatus.Active, ct);
            if (!isMember)
            {
                throw AppException.NotFound(Messages.NotAMember);
            }

            bank.OwnerId = command.Body.OwnerId;
            bank.IsDefault = false;
            bank.UpdatedAt = clock.GetUtcNow();
            await db.SaveChangesAsync(ct);
            return Unit.Value;
        }
    }
}

public sealed record TagDto(Guid Id, string Name, int QuestionCount);

public static class ListTags
{
    public sealed record Query : IQuery<IReadOnlyList<TagDto>>;

    internal sealed class Handler(AppDbContext db) : IQueryHandler<Query, IReadOnlyList<TagDto>>
    {
        public async Task<IReadOnlyList<TagDto>> Handle(Query query, CancellationToken ct) =>
            await db.QuestionTags.AsNoTracking()
                .OrderBy(t => t.Name)
                .Select(t => new TagDto(t.Id, t.Name, db.QuestionTagLinks.Count(l => l.TagId == t.Id)))
                .ToListAsync(ct);
    }
}

public static class CreateTag
{
    public sealed record Command(string Name) : ICommand<TagDto>;

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator() => RuleFor(x => x.Name).NotEmpty().WithMessage(Messages.Required).MaximumLength(60).WithMessage(Messages.TooLong);
    }

    internal sealed class Handler(AppDbContext db, ITenantContext tenant, TimeProvider clock) : ICommandHandler<Command, TagDto>
    {
        public async Task<TagDto> Handle(Command command, CancellationToken ct)
        {
            var name = command.Name.Trim();
            var existing = await db.QuestionTags.FirstOrDefaultAsync(t => t.Name == name, ct);
            if (existing is not null)
            {
                return new TagDto(existing.Id, existing.Name, 0);
            }

            var tag = new QuestionTag { Id = IdGen.New(), InstitutionId = tenant.InstitutionId, Name = name, CreatedAt = clock.GetUtcNow() };
            db.QuestionTags.Add(tag);
            await db.SaveChangesAsync(ct);
            return new TagDto(tag.Id, tag.Name, 0);
        }
    }
}

public static class DeleteTag
{
    public sealed record Command(Guid Id) : ICommand<Unit>;

    internal sealed class Handler(AppDbContext db) : ICommandHandler<Command, Unit>
    {
        public async Task<Unit> Handle(Command command, CancellationToken ct)
        {
            var tag = await db.QuestionTags.Where(t => t.Id == command.Id).FirstOr404Async(ct);
            db.QuestionTags.Remove(tag);
            await db.SaveChangesAsync(ct);
            return Unit.Value;
        }
    }
}

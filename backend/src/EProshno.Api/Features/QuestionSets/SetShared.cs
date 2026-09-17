using System.Security.Cryptography;
using EProshno.Api.Features.Questions;
using EProshno.Core.Common;
using EProshno.Core.Papers;
using EProshno.Core.Questions;
using EProshno.Core.Sets;
using EProshno.Infrastructure.Billing;
using EProshno.Infrastructure.Identity;
using EProshno.Infrastructure.Papers;
using EProshno.Infrastructure.Persistence;
using FluentValidation;
using FluentValidation.Results;
using Microsoft.EntityFrameworkCore;

namespace EProshno.Api.Features.QuestionSets;

public sealed record SetSummaryDto(
    Guid Id,
    string Title,
    string LevelName,
    Guid SubjectId,
    string SubjectLabel,
    QuestionType Type,
    int ItemCount,
    int TargetCount,
    int DurationMin,
    decimal FullMarks,
    QuestionSource Source,
    string? CreatedByName,
    bool IsMine,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record SetItemDto(Guid QuestionId, int Position, decimal Marks);

public sealed record SetChapterDto(Guid Id, int Number, string Label);

public sealed record SetBankDto(Guid Id, string Name);

public sealed record SetDetailDto(
    Guid Id,
    string Title,
    Guid LevelId,
    string LevelName,
    Guid SubjectId,
    string SubjectLabel,
    IReadOnlyList<SetChapterDto> Chapters,
    QuestionType Type,
    SetMode Mode,
    QuestionSource Source,
    IReadOnlyList<SetBankDto> Banks,
    int TargetCount,
    int DurationMin,
    decimal FullMarks,
    PaperSettings Settings,
    int ItemsVersion,
    IReadOnlyList<SetItemDto> Items,
    decimal TotalMarks,
    bool HasSubjectAccess,
    string InstitutionName,
    string? InstitutionLogoUrl,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

/// <summary>Teachers work with the sets they created; institution admins with every set of the institution.</summary>
public sealed class SetAccess(AppDbContext db, ITenantContext tenant)
{
    public IQueryable<QuestionSet> Readable()
    {
        var userId = tenant.UserId;
        return tenant.IsInstitutionAdmin ? db.QuestionSets : db.QuestionSets.Where(s => s.CreatedById == userId);
    }

    public async Task<QuestionSet> GetAsync(Guid id, CancellationToken ct) =>
        await Readable().Where(s => s.Id == id).FirstOr404Async(ct);

    public async Task<QuestionSet> GetWithItemsAsync(Guid id, CancellationToken ct) =>
        await Readable().Include(s => s.Items).Where(s => s.Id == id).FirstOr404Async(ct);

    /// <summary>A new per-set shuffle seed. Cryptographic RNG: persisted values never come from System.Random.</summary>
    public static uint NewSeed() => BitConverter.ToUInt32(RandomNumberGenerator.GetBytes(4));

    public static SearchMode SearchModeFor(SetMode mode) => mode switch
    {
        SetMode.Unique => SearchMode.Unique,
        SetMode.Common => SearchMode.Common,
        _ => SearchMode.All,
    };

    public static ValidationException Invalid(string field, string message) => new([new ValidationFailure(field, message)]);
}

public sealed class SetReader(AppDbContext db, ITenantContext tenant, IEntitlements entitlements)
{
    public async Task<SetDetailDto> DetailAsync(Guid id, CancellationToken ct)
    {
        var row = await db.QuestionSets.AsNoTracking()
            .Where(s => s.Id == id)
            .Select(s => new
            {
                Set = s,
                LevelName = db.Levels.Where(l => l.Id == s.LevelId).Select(l => l.NameBn).FirstOrDefault(),
                Subject = db.Subjects.Where(x => x.Id == s.SubjectId).Select(x => new { x.NameBn, x.Paper }).FirstOrDefault(),
                Institution = db.Institutions.Where(i => i.Id == s.InstitutionId).Select(i => new { i.Name, i.LogoKey }).FirstOrDefault(),
                Items = s.Items.OrderBy(i => i.Position).Select(i => new SetItemDto(i.QuestionId, i.Position, i.Marks)).ToList(),
            })
            .FirstOr404Async(ct);
        var set = row.Set;

        var chapters = await db.Chapters.AsNoTracking()
            .Where(c => set.ChapterIds.Contains(c.Id))
            .OrderBy(c => c.Number)
            .Select(c => new { c.Id, c.Number, c.NameBn })
            .ToListAsync(ct);
        var banks = await db.QuestionBanks.AsNoTracking()
            .Where(b => set.BankIds.Contains(b.Id))
            .OrderBy(b => b.Name)
            .Select(b => new SetBankDto(b.Id, b.Name))
            .ToListAsync(ct);

        return new SetDetailDto(
            set.Id,
            set.Title,
            set.LevelId,
            row.LevelName ?? "",
            set.SubjectId,
            PaperLoader.SubjectLabel(row.Subject?.NameBn, row.Subject?.Paper),
            chapters.Select(c => new SetChapterDto(c.Id, c.Number, PaperLoader.ChapterLabel(c.Number, c.NameBn))).ToList(),
            set.Type,
            set.Mode,
            set.Source,
            banks,
            set.TargetCount,
            set.DurationMin,
            set.FullMarks,
            set.Settings,
            set.ItemsVersion,
            row.Items,
            row.Items.Sum(i => i.Marks),
            await entitlements.HasSubjectAccessAsync(tenant.InstitutionId, set.SubjectId, ct),
            row.Institution?.Name ?? "",
            MediaUrls.For(row.Institution?.LogoKey),
            set.CreatedAt,
            set.UpdatedAt);
    }

    /// <summary>Runs an ordered, limited query of sets.</summary>
    public async Task<List<SetSummaryDto>> SummariesAsync(IQueryable<QuestionSet> sets, CancellationToken ct)
    {
        var rows = await sets.AsNoTracking()
            .Select(s => new
            {
                s.Id,
                s.Title,
                LevelName = db.Levels.Where(l => l.Id == s.LevelId).Select(l => l.NameBn).FirstOrDefault(),
                s.SubjectId,
                Subject = db.Subjects.Where(x => x.Id == s.SubjectId).Select(x => new { x.NameBn, x.Paper }).FirstOrDefault(),
                s.Type,
                ItemCount = s.Items.Count,
                s.TargetCount,
                s.DurationMin,
                s.FullMarks,
                s.Source,
                s.CreatedById,
                s.CreatedAt,
                s.UpdatedAt,
            })
            .ToListAsync(ct);

        var userIds = rows.Select(r => r.CreatedById).Distinct().ToList();
        var names = await db.Set<AppUser>().AsNoTracking()
            .Where(u => userIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.FullName, ct);
        var me = tenant.CurrentUserId;

        return rows.Select(r => new SetSummaryDto(
            r.Id,
            r.Title,
            r.LevelName ?? "",
            r.SubjectId,
            PaperLoader.SubjectLabel(r.Subject?.NameBn, r.Subject?.Paper),
            r.Type,
            r.ItemCount,
            r.TargetCount,
            r.DurationMin,
            r.FullMarks,
            r.Source,
            names.GetValueOrDefault(r.CreatedById),
            r.CreatedById == me,
            r.CreatedAt,
            r.UpdatedAt)).ToList();
    }
}

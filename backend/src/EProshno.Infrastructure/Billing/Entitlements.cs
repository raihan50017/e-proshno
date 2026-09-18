using EProshno.Core.Billing;
using EProshno.Core.Common;
using EProshno.Core.Imports;
using EProshno.Core.Institutions;
using EProshno.Core.Questions;
using EProshno.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ZiggyCreatures.Caching.Fusion;

namespace EProshno.Infrastructure.Billing;

public sealed class BillingOptions
{
    public const string Section = "Billing";

    /// <summary>All-subject trial for new institutions; 0 disables it (business decision pending).</summary>
    public int TrialDays { get; set; }

    /// <summary>Limits without a paid plan (business decision pending, see PRD §3b).</summary>
    public PlanLimits FreeLimits { get; set; } = new()
    {
        SavedSets = 20,
        Teachers = 2,
        Students = 50,
        CustomBanks = 3,
        CustomQuestions = 500,
        ImportsPerMonth = 5,
    };

    public PaymentGateway Gateway { get; set; } = PaymentGateway.Fake;

    /// <summary>Seller shown on invoices (the public brand is still undecided).</summary>
    public string SellerName { get; set; } = "e-proshno";

    public string? SellerAddress { get; set; }

    /// <summary>Development-only gateway that lets you approve a payment in the browser.</summary>
    public bool EnableFakeGateway { get; set; }
}

public sealed class AppOptions
{
    public const string Section = "App";

    /// <summary>Public SPA origin for links in SMS and gateway redirects (e.g. https://app.example.com).</summary>
    public string PublicBaseUrl { get; set; } = "http://localhost:5173";

    /// <summary>Public API origin the payment gateway can reach for IPN and browser POST-backs.</summary>
    public string ApiBaseUrl { get; set; } = "http://localhost:5080";
}

public sealed record EntitlementSnapshot(
    bool AllSubjects,
    IReadOnlyList<Guid> SubjectIds,
    IReadOnlyList<string> LevelSlugs,
    PlanLimits Limits,
    DateTimeOffset? EndsAt,
    bool HasActivePlan);

public interface IEntitlements
{
    Task<EntitlementSnapshot> GetAsync(Guid institutionId, CancellationToken ct);

    Task<bool> HasSubjectAccessAsync(Guid institutionId, Guid subjectId, CancellationToken ct);

    Task EnsureSubjectAccessAsync(Guid institutionId, Guid subjectId, CancellationToken ct);

    Task AssertWithinLimitAsync(Guid institutionId, LimitKey key, CancellationToken ct, int adding = 1);

    /// <summary>How much of a limit is used right now (not cached).</summary>
    Task<int> CountUsageAsync(Guid institutionId, LimitKey key, CancellationToken ct);

    Task InvalidateAsync(Guid institutionId, CancellationToken ct);
}

/// <summary>
/// One place for "may this institution do X". Cached per institution for five minutes and evicted on any
/// subscription change. Expects the current tenant to be <paramref name="institutionId"/> (tenant filter applies).
/// </summary>
public sealed class Entitlements(
    AppDbContext db,
    IFusionCache cache,
    IOptions<BillingOptions> options,
    TimeProvider clock) : IEntitlements
{
    public static string CacheKey(Guid institutionId) => $"entitlements:{institutionId:N}";

    public async Task<EntitlementSnapshot> GetAsync(Guid institutionId, CancellationToken ct) =>
        await cache.GetOrSetAsync<EntitlementSnapshot>(
            CacheKey(institutionId),
            async (_, token) => await LoadAsync(institutionId, token),
            options: new FusionCacheEntryOptions(TimeSpan.FromMinutes(5)),
            token: ct);

    public async Task<bool> HasSubjectAccessAsync(Guid institutionId, Guid subjectId, CancellationToken ct)
    {
        var snapshot = await GetAsync(institutionId, ct);
        if (snapshot.SubjectIds.Contains(subjectId))
        {
            return true;
        }

        if (!snapshot.AllSubjects)
        {
            return false;
        }

        if (snapshot.LevelSlugs.Count == 0)
        {
            return true;
        }

        var slug = await db.Subjects.AsNoTracking()
            .Where(s => s.Id == subjectId)
            .Select(s => s.Level!.Slug)
            .FirstOrDefaultAsync(ct);
        return slug is not null && snapshot.LevelSlugs.Contains(slug);
    }

    public async Task EnsureSubjectAccessAsync(Guid institutionId, Guid subjectId, CancellationToken ct)
    {
        if (!await HasSubjectAccessAsync(institutionId, subjectId, ct))
        {
            throw new AppException("subscription.subject_required", Messages.SubjectSubscriptionRequired, 402);
        }
    }

    public async Task AssertWithinLimitAsync(Guid institutionId, LimitKey key, CancellationToken ct, int adding = 1)
    {
        var limits = (await GetAsync(institutionId, ct)).Limits;
        var limit = key switch
        {
            LimitKey.SavedSets => limits.SavedSets,
            LimitKey.Teachers => limits.Teachers,
            LimitKey.Students => limits.Students,
            LimitKey.CustomBanks => limits.CustomBanks,
            LimitKey.CustomQuestions => limits.CustomQuestions,
            LimitKey.ImportsPerMonth => limits.ImportsPerMonth,
            _ => null,
        };

        if (limit is null)
        {
            return;
        }

        var used = await CountUsageAsync(institutionId, key, ct);
        if (used + adding > limit)
        {
            throw new AppException($"limit.{key.ToString().ToLowerInvariant()}", LimitMessage(key), 402);
        }
    }

    public async Task InvalidateAsync(Guid institutionId, CancellationToken ct) =>
        await cache.RemoveAsync(CacheKey(institutionId), token: ct);

    private async Task<EntitlementSnapshot> LoadAsync(Guid institutionId, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var active = await db.Subscriptions.AsNoTracking()
            .Where(s => s.InstitutionId == institutionId && s.Status == SubscriptionStatus.Active && s.StartsAt <= now && s.EndsAt > now)
            .Select(s => new
            {
                s.AllSubjects,
                s.EndsAt,
                Limits = s.Plan!.Limits,
                Pricing = s.Plan.Pricing,
                SubjectIds = s.Subjects.Select(x => x.SubjectId).ToList(),
            })
            .ToListAsync(ct);

        var paid = active.Where(a => a.Pricing != PlanPricing.Free).ToList();
        var limits = active.Aggregate(options.Value.FreeLimits, (acc, a) => PlanLimits.Max(acc, a.Limits));
        var allSubjects = paid.Where(a => a.AllSubjects).ToList();

        return new EntitlementSnapshot(
            AllSubjects: allSubjects.Count > 0,
            SubjectIds: paid.SelectMany(a => a.SubjectIds).Distinct().ToList(),
            LevelSlugs: allSubjects.Any(a => a.Limits.LevelSlugs.Length == 0)
                ? []
                : allSubjects.SelectMany(a => a.Limits.LevelSlugs).Distinct().ToList(),
            Limits: limits,
            EndsAt: paid.Count > 0 ? paid.Max(a => a.EndsAt) : null,
            HasActivePlan: paid.Count > 0);
    }

    public async Task<int> CountUsageAsync(Guid institutionId, LimitKey key, CancellationToken ct)
    {
        switch (key)
        {
            case LimitKey.SavedSets:
                return await db.QuestionSets.CountAsync(s => s.InstitutionId == institutionId, ct);
            case LimitKey.Teachers:
                return await db.Memberships.CountAsync(m => m.InstitutionId == institutionId && m.Status == MembershipStatus.Active, ct);
            case LimitKey.Students:
                return await db.Students.CountAsync(s => s.InstitutionId == institutionId, ct);
            case LimitKey.CustomBanks:
                return await db.QuestionBanks.CountAsync(b => b.InstitutionId == institutionId && b.ArchivedAt == null, ct);
            case LimitKey.CustomQuestions:
                return await db.Questions.CountAsync(
                    q => q.BankId != null && q.Bank!.InstitutionId == institutionId && q.Status != ContentStatus.Archived, ct);
            case LimitKey.ImportsPerMonth:
                var monthStart = BdTime.MonthStartUtc(clock.GetUtcNow());
                return await db.ImportJobs.CountAsync(
                    j => j.InstitutionId == institutionId && j.CreatedAt >= monthStart && j.Status != ImportStatus.Failed, ct);
            default:
                return 0;
        }
    }

    private static string LimitMessage(LimitKey key) => key switch
    {
        LimitKey.SavedSets => Messages.SetLimitReached,
        LimitKey.Teachers => Messages.TeacherLimitReached,
        LimitKey.Students => Messages.StudentLimitReached,
        LimitKey.CustomBanks => Messages.BankLimitReached,
        LimitKey.CustomQuestions => Messages.QuestionLimitReached,
        _ => Messages.ImportLimitReached,
    };
}

using EProshno.Api.Common;
using EProshno.Api.Features.QuestionSets;
using EProshno.Core.Common;
using EProshno.Core.Institutions;
using EProshno.Core.Questions;
using EProshno.Infrastructure.Billing;
using EProshno.Infrastructure.Identity;
using EProshno.Infrastructure.Papers;
using EProshno.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ZiggyCreatures.Caching.Fusion;

namespace EProshno.Api.Features.Dashboard;

/// <summary>Assumptions behind the "time and money saved" card (placeholders until the business sets them).</summary>
public sealed class DashboardOptions
{
    public const string Section = "Dashboard";

    public decimal MinutesSavedPerMcq { get; set; } = 2m;
    public decimal MinutesSavedPerCq { get; set; } = 8m;

    /// <summary>What typing one question would otherwise cost, in poisha.</summary>
    public long TypingCostPoishaPerQuestion { get; set; } = 500;
}

public sealed record DashboardCounters(int Sets, int OnlineExams, int OmrEvaluated, int Students, int Teachers, int MyQuestions);

public sealed record DashboardImpact(int QuestionsUsed, decimal HoursSaved, long MoneySavedPoisha);

public sealed record GrowthPoint(DateOnly Day, int PlatformQuestions, int InstitutionQuestions);

public sealed record DashboardSubscription(bool HasActivePlan, DateTimeOffset? EndsAt, int? DaysLeft, bool RenewalDue);

public sealed record AnnouncementDto(Guid Id, string TitleBn, string BodyBn, string? LinkUrl, DateTimeOffset StartsAt);

public sealed record SupportDto(string Phone, string Email, string? WhatsApp, string? Messenger, string Hours);

public sealed record DashboardDto(
    string UserName,
    string InstitutionName,
    string? InstitutionAddress,
    string? InstitutionLogoUrl,
    InstitutionType InstitutionType,
    DashboardCounters Counters,
    DashboardImpact Impact,
    IReadOnlyList<SetSummaryDto> RecentSets,
    IReadOnlyList<GrowthPoint> Growth,
    DateTimeOffset? LastContentUpdate,
    DashboardSubscription Subscription,
    IReadOnlyList<AnnouncementDto> Announcements,
    SupportDto Support);

public static class GetDashboard
{
    public const int RecentSetCount = 5;
    public const int GrowthDays = 7;

    public sealed record Query : IQuery<DashboardDto>;

    /// <summary>Everything the dashboard needs in one call. Counters follow the viewer: admins see the institution, teachers their own work.</summary>
    internal sealed class Handler(
        AppDbContext db,
        ITenantContext tenant,
        SetAccess sets,
        SetReader setReader,
        IEntitlements entitlements,
        IFusionCache cache,
        IOptions<DashboardOptions> options,
        IOptions<SupportOptions> support,
        TimeProvider clock) : IQueryHandler<Query, DashboardDto>
    {
        public async Task<DashboardDto> Handle(Query query, CancellationToken ct)
        {
            var institutionId = tenant.InstitutionId;
            var userId = tenant.UserId;
            var now = clock.GetUtcNow();

            var institution = await db.Institutions.AsNoTracking()
                .Where(i => i.Id == institutionId)
                .Select(i => new { i.Name, i.Address, i.LogoKey, i.Type })
                .FirstOr404Async(ct);
            var userName = await db.Set<AppUser>().Where(u => u.Id == userId).Select(u => u.FullName).FirstOrDefaultAsync(ct) ?? "";

            var readable = sets.Readable();
            var setIds = readable.Select(s => s.Id);
            var mcqUsed = await db.QuestionSetItems.CountAsync(i => setIds.Contains(i.SetId) && i.Question!.Type == QuestionType.Mcq, ct);
            var otherUsed = await db.QuestionSetItems.CountAsync(i => setIds.Contains(i.SetId) && i.Question!.Type != QuestionType.Mcq, ct);
            var o = options.Value;

            var counters = new DashboardCounters(
                Sets: await readable.CountAsync(ct),
                OnlineExams: 0,
                OmrEvaluated: 0,
                Students: await db.Students.CountAsync(ct),
                Teachers: await db.Memberships.CountAsync(m => m.InstitutionId == institutionId && m.Status == MembershipStatus.Active, ct),
                MyQuestions: await db.Questions.CountAsync(
                    q => q.BankId != null && q.Bank!.InstitutionId == institutionId && q.Bank.OwnerId == userId && q.Status != ContentStatus.Archived, ct));

            var impact = new DashboardImpact(
                mcqUsed + otherUsed,
                Math.Round(((mcqUsed * o.MinutesSavedPerMcq) + (otherUsed * o.MinutesSavedPerCq)) / 60m, 1),
                (mcqUsed + otherUsed) * o.TypingCostPoishaPerQuestion);

            var recent = await setReader.SummariesAsync(readable.OrderByDescending(s => s.UpdatedAt).Take(RecentSetCount), ct);
            recent = recent.OrderByDescending(s => s.UpdatedAt).ToList();

            var growth = await cache.GetOrSetAsync<List<GrowthPoint>>(
                $"dashboard-growth:{institutionId:N}",
                async (_, token) => await GrowthAsync(institutionId, now, token),
                options: new FusionCacheEntryOptions(TimeSpan.FromMinutes(10)),
                token: ct);

            var lastUpdate = await db.Questions.AsNoTracking()
                .Where(q => q.BankId == null && q.Status == ContentStatus.Published)
                .MaxAsync(q => (DateTimeOffset?)q.UpdatedAt, ct);

            var snapshot = await entitlements.GetAsync(institutionId, ct);
            int? daysLeft = snapshot.EndsAt is { } endsAt ? (int)Math.Ceiling((endsAt - now).TotalDays) : null;

            var announcements = await db.Announcements.AsNoTracking()
                .Where(a => a.IsActive && a.StartsAt <= now && (a.EndsAt == null || a.EndsAt > now))
                .OrderByDescending(a => a.StartsAt)
                .Take(5)
                .Select(a => new AnnouncementDto(a.Id, a.TitleBn, a.BodyBn, a.LinkUrl, a.StartsAt))
                .ToListAsync(ct);

            var s = support.Value;
            return new DashboardDto(
                userName,
                institution.Name,
                institution.Address,
                MediaUrls.For(institution.LogoKey),
                institution.Type,
                counters,
                impact,
                recent,
                growth,
                lastUpdate,
                new DashboardSubscription(snapshot.HasActivePlan, snapshot.EndsAt, daysLeft, daysLeft is not null && daysLeft <= 7),
                announcements,
                new SupportDto(s.Phone, s.Email, s.WhatsApp, s.Messenger, s.Hours));
        }

        /// <summary>New questions per Dhaka calendar day: published platform questions and the institution's own.</summary>
        private async Task<List<GrowthPoint>> GrowthAsync(Guid institutionId, DateTimeOffset now, CancellationToken ct)
        {
            var today = BdTime.ToLocal(now).Date;
            var points = new List<GrowthPoint>(GrowthDays);
            for (var i = GrowthDays - 1; i >= 0; i--)
            {
                var day = today.AddDays(-i);
                var from = new DateTimeOffset(day, BdTime.Zone.BaseUtcOffset).ToUniversalTime();
                var to = from.AddDays(1);
                var platform = await db.Questions.CountAsync(
                    q => q.BankId == null && q.Status == ContentStatus.Published && q.PublishedAt >= from && q.PublishedAt < to, ct);
                var own = await db.Questions.CountAsync(
                    q => q.BankId != null && q.Bank!.InstitutionId == institutionId && q.CreatedAt >= from && q.CreatedAt < to, ct);
                points.Add(new GrowthPoint(DateOnly.FromDateTime(day), platform, own));
            }

            return points;
        }
    }
}

public static class DashboardEndpoints
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGet("/api/v1/dashboard", async (Dispatcher d, CancellationToken ct) => TypedResults.Ok(await d.Query(new GetDashboard.Query(), ct)))
            .WithTags("Dashboard")
            .WithName("getDashboard")
            .RequireAuthorization(Policies.Member);
}

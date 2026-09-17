using System.Globalization;
using EProshno.Core.Billing;
using EProshno.Core.Common;
using EProshno.Core.Institutions;
using EProshno.Core.Text;
using EProshno.Infrastructure.Identity;
using EProshno.Infrastructure.Messaging;
using EProshno.Infrastructure.Persistence;
using Hangfire;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace EProshno.Infrastructure.Billing;

/// <summary>
/// Recurring system jobs. They work across all institutions, so they deliberately bypass the tenant filter
/// (no user or tenant is involved) and always filter by institution explicitly when they act.
/// </summary>
public sealed class BillingJobs(
    AppDbContext db,
    PaymentGatewayResolver gateways,
    PaymentApplier applier,
    ISmsSender sms,
    TimeProvider clock,
    ILogger<BillingJobs> logger)
{
    public static readonly int[] ReminderDays = [7, 3, 1];

    /// <summary>Every 15 minutes: pending payments older than 10 minutes are checked with the gateway.</summary>
    [AutomaticRetry(Attempts = 0), DisableConcurrentExecution(600)]
    public async Task ReconcileAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var pending = await db.Payments.IgnoreQueryFilters()   // system job across tenants
            .AsNoTracking()
            .Where(p => p.Status == PaymentStatus.Pending && p.CreatedAt < now.AddMinutes(-10) && p.CreatedAt > now.AddDays(-3))
            .Select(p => new { p.TranId, p.Gateway })
            .Take(200)
            .ToListAsync(ct);

        foreach (var payment in pending)
        {
            try
            {
                var gateway = gateways.Get(payment.Gateway);
                var validation = await gateway.QueryAsync(payment.TranId, ct);
                if (validation is not null)
                {
                    await applier.ApplyAsync(validation, ct);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Reconciliation failed for {TranId}", payment.TranId);
            }

            db.ChangeTracker.Clear();
        }

        // Abandoned checkouts: close them after three days so history stays readable.
        await db.Payments.IgnoreQueryFilters()   // system job across tenants
            .Where(p => p.Status == PaymentStatus.Pending && p.CreatedAt <= now.AddDays(-3))
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.Status, PaymentStatus.Cancelled).SetProperty(p => p.UpdatedAt, now), ct);
    }

    /// <summary>Daily at 10:00 Asia/Dhaka: SMS the owner 7, 3 and 1 days before a paid subscription ends.</summary>
    [AutomaticRetry(Attempts = 0), DisableConcurrentExecution(600)]
    public async Task RenewalRemindersAsync(CancellationToken ct)
    {
        var todayLocal = BdTime.ToLocal(clock.GetUtcNow()).Date;
        foreach (var days in ReminderDays)
        {
            var dayStart = new DateTimeOffset(todayLocal.AddDays(days), BdTime.Zone.BaseUtcOffset).ToUniversalTime();
            var dayEnd = dayStart.AddDays(1);
            var ending = await db.Subscriptions.IgnoreQueryFilters()   // system job across tenants
                .AsNoTracking()
                .Where(s => s.Status == SubscriptionStatus.Active && s.EndsAt >= dayStart && s.EndsAt < dayEnd
                            && s.Plan!.Pricing != PlanPricing.Free && s.Plan.Code != TrialService.TrialPlanCode)
                .Select(s => new { s.InstitutionId, PlanName = s.Plan!.NameBn })
                .ToListAsync(ct);

            foreach (var sub in ending)
            {
                var phone = await (
                        from m in db.Memberships
                        join u in db.Set<AppUser>() on m.UserId equals u.Id
                        where m.InstitutionId == sub.InstitutionId && m.Role == Core.Auth.InstitutionRole.Owner
                              && m.Status == MembershipStatus.Active && u.PhoneNumberConfirmed
                        select u.PhoneNumber)
                    .FirstOrDefaultAsync(ct);
                if (phone is null)
                {
                    continue;
                }

                var text = string.Format(CultureInfo.InvariantCulture, Messages.RenewalReminderSms, sub.PlanName, BanglaText.ToBanglaDigits(days));
                await sms.SendAsync(phone, text, ct);
            }
        }
    }
}

/// <summary>Daily housekeeping for import files, spent refresh tokens and old job records.</summary>
public sealed class CleanupJobs(AppDbContext db, Storage.IObjectStorage storage, TimeProvider clock, ILogger<CleanupJobs> logger)
{
    [AutomaticRetry(Attempts = 0), DisableConcurrentExecution(600)]
    public async Task RunAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow();

        // Original import files are kept for 30 days.
        var oldFiles = await db.ImportJobs.IgnoreQueryFilters()   // system job across tenants
            .Where(j => j.FileKey != null && j.CreatedAt < now.AddDays(-30))
            .Select(j => new { j.Id, j.FileKey })
            .Take(500)
            .ToListAsync(ct);
        foreach (var file in oldFiles)
        {
            try
            {
                await storage.DeleteAsync(file.FileKey!, ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Could not delete import file for {ImportJobId}", file.Id);
                continue;
            }

            await db.ImportJobs.IgnoreQueryFilters()
                .Where(j => j.Id == file.Id)
                .ExecuteUpdateAsync(s => s.SetProperty(j => j.FileKey, (string?)null).SetProperty(j => j.PastedText, (string?)null), ct);
        }

        // Import rows are kept until the rollback window + 30 days.
        var rowCutoff = now - ImportLimitsWindow.RowRetention;
        await db.ImportRows.IgnoreQueryFilters()   // system job across tenants
            .Where(r => db.ImportJobs.IgnoreQueryFilters().Any(j => j.Id == r.ImportJobId && j.UpdatedAt < rowCutoff
                && (j.Status == Core.Imports.ImportStatus.Completed || j.Status == Core.Imports.ImportStatus.RolledBack
                    || j.Status == Core.Imports.ImportStatus.Failed)))
            .ExecuteDeleteAsync(ct);

        await db.RefreshTokens
            .Where(t => t.ExpiresAt < now.AddDays(-1) || (t.RevokedAt != null && t.RevokedAt < now.AddDays(-30)))
            .ExecuteDeleteAsync(ct);

        await db.JobRecords.IgnoreQueryFilters()   // system job across tenants
            .Where(j => j.CreatedAt < now.AddDays(-30))
            .ExecuteDeleteAsync(ct);
    }
}

internal static class ImportLimitsWindow
{
    public static readonly TimeSpan RowRetention = Core.Imports.ImportLimits.RollbackWindow + TimeSpan.FromDays(30);
}

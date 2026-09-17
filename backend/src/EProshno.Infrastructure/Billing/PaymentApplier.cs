using EProshno.Core.Billing;
using EProshno.Core.Common;
using EProshno.Core.Text;
using EProshno.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace EProshno.Infrastructure.Billing;

/// <summary>
/// Applies a verified gateway result exactly once: row-locks the payment, marks it paid or failed, activates or
/// extends the subscription and issues the invoice in one transaction. Shared by IPN and reconciliation.
/// </summary>
public sealed class PaymentApplier(
    AppDbContext db,
    IEntitlements entitlements,
    TimeProvider clock,
    ILogger<PaymentApplier> logger)
{
    public async Task<PaymentStatus?> ApplyAsync(GatewayValidation validation, CancellationToken ct)
    {
        if (!validation.IsFinal)
        {
            return PaymentStatus.Pending;
        }

        // Server-to-server validation already happened (outside the transaction; never hold a row lock during HTTP calls).
        await using var tx = await db.Database.BeginTransactionAsync(ct);

        // IPN is anonymous, so there is no tenant in context: bypass the tenant filter deliberately (verified callback).
        var payment = await db.Payments
            .FromSql($"SELECT * FROM payments WHERE tran_id = {validation.TranId} FOR UPDATE")
            .IgnoreQueryFilters()
            .SingleOrDefaultAsync(ct);

        if (payment is null)
        {
            logger.LogWarning("Gateway callback for unknown transaction {TranId}", validation.TranId);
            return null;
        }

        if (payment.Status != PaymentStatus.Pending)
        {
            return payment.Status;   // already applied → idempotent
        }

        var now = clock.GetUtcNow();
        if (!validation.IsSuccess
            || validation.AmountPoisha != payment.AmountPoisha
            || !string.Equals(validation.Currency, payment.Currency, StringComparison.OrdinalIgnoreCase))
        {
            if (validation.IsSuccess)
            {
                logger.LogWarning("Amount/currency mismatch for {TranId}", payment.TranId);
            }

            payment.MarkFailed(validation.RawJson, now);
        }
        else
        {
            payment.MarkPaid(validation.GatewayRef, validation.RawJson, now);
            var subscription = await ActivateOrExtendAsync(payment, now, ct);
            await IssueInvoiceAsync(payment, subscription, now, ct);
        }

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        if (payment.Status == PaymentStatus.Paid)
        {
            await entitlements.InvalidateAsync(payment.InstitutionId, ct);
        }

        return payment.Status;
    }

    private async Task<Subscription> ActivateOrExtendAsync(Payment payment, DateTimeOffset now, CancellationToken ct)
    {
        var plan = await db.Plans.SingleAsync(p => p.Id == payment.PlanId, ct);
        var subjectIds = payment.SubjectIds.Order().ToArray();

        // Anonymous callback context: filter by the payment's institution explicitly.
        var candidates = await db.Subscriptions
            .IgnoreQueryFilters()
            .Include(s => s.Subjects)
            .Where(s => s.InstitutionId == payment.InstitutionId && s.PlanId == plan.Id
                        && s.Status == SubscriptionStatus.Active && s.EndsAt > now)
            .ToListAsync(ct);

        var existing = candidates.FirstOrDefault(s =>
            plan.Pricing != PlanPricing.PerSubject
            || s.Subjects.Select(x => x.SubjectId).Order().SequenceEqual(subjectIds));

        if (existing is not null)
        {
            // Renewal extends from max(now, EndsAt).
            existing.EndsAt = (existing.EndsAt > now ? existing.EndsAt : now).AddDays(plan.DurationDays);
            existing.UpdatedAt = now;
            return existing;
        }

        var subscription = new Subscription
        {
            Id = IdGen.New(),
            InstitutionId = payment.InstitutionId,
            PlanId = plan.Id,
            AllSubjects = plan.Pricing == PlanPricing.AllSubjects,
            StartsAt = now,
            EndsAt = now.AddDays(plan.DurationDays),
            Status = SubscriptionStatus.Active,
            CreatedAt = now,
            UpdatedAt = now,
            Subjects = plan.Pricing == PlanPricing.PerSubject
                ? subjectIds.Select(id => new SubscriptionSubject { SubjectId = id }).ToList()
                : [],
        };
        db.Subscriptions.Add(subscription);
        return subscription;
    }

    private async Task IssueInvoiceAsync(Payment payment, Subscription subscription, DateTimeOffset now, CancellationToken ct)
    {
        var plan = await db.Plans.SingleAsync(p => p.Id == payment.PlanId, ct);
        var institutionName = await db.Institutions
            .Where(i => i.Id == payment.InstitutionId)
            .Select(i => i.Name)
            .SingleAsync(ct);

        var fiscalYear = InvoiceNumbers.FiscalYear(now);
        // Atomic per-year counter; the row lock lasts until the surrounding transaction commits.
        var next = (await db.Database.SqlQuery<long>(
                $"""
                INSERT INTO invoice_counters (fiscal_year, last_number) VALUES ({fiscalYear}, 1)
                ON CONFLICT (fiscal_year) DO UPDATE SET last_number = invoice_counters.last_number + 1
                RETURNING last_number AS "Value"
                """)
            .ToListAsync(ct)).Single();

        var quantity = plan.Pricing == PlanPricing.PerSubject ? Math.Max(payment.SubjectIds.Length, 1) : 1;
        var vat = plan.VatFor(payment.AmountPoisha);
        db.Invoices.Add(new Invoice
        {
            Id = IdGen.New(),
            InstitutionId = payment.InstitutionId,
            PaymentId = payment.Id,
            Number = InvoiceNumbers.Format(fiscalYear, next),
            BilledToName = institutionName,
            Lines =
            [
                new InvoiceLine(
                    $"{plan.NameBn} ({BanglaText.ToBanglaDigits(plan.DurationDays)} দিন)",
                    quantity,
                    payment.AmountPoisha / quantity,
                    payment.AmountPoisha),
            ],
            SubtotalPoisha = payment.AmountPoisha - vat,
            VatPoisha = vat,
            TotalPoisha = payment.AmountPoisha,
            PeriodStart = subscription.StartsAt,
            PeriodEnd = subscription.EndsAt,
            IssuedAt = now,
        });
    }
}

/// <summary>Grants the configured all-subject trial to a newly created institution.</summary>
public sealed class TrialService(AppDbContext db, IOptions<BillingOptions> options, TimeProvider clock)
{
    public const string TrialPlanCode = "trial";

    public async Task GrantAsync(Guid institutionId, CancellationToken ct)
    {
        var days = options.Value.TrialDays;
        if (days <= 0)
        {
            return;
        }

        var plan = await db.Plans.FirstOrDefaultAsync(p => p.Code == TrialPlanCode, ct);
        if (plan is null)
        {
            return;
        }

        var now = clock.GetUtcNow();
        db.Subscriptions.Add(new Subscription
        {
            Id = IdGen.New(),
            InstitutionId = institutionId,
            PlanId = plan.Id,
            AllSubjects = true,
            StartsAt = now,
            EndsAt = now.AddDays(days),
            Status = SubscriptionStatus.Active,
            CreatedAt = now,
            UpdatedAt = now,
        });
    }
}

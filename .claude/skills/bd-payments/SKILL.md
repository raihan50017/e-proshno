---
name: bd-payments
description: Subscription and payment rules for e-proshno on ASP.NET Core — plans, per-subject entitlements, limits, SSLCommerz and bKash checkout, IPN validation with row locking, idempotency, Hangfire reconciliation, renewals, invoices and affiliate commission hooks. Use for anything touching plans, checkout, subscriptions, entitlements or billing pages.
---

# Payments and subscriptions (Bangladesh)

## Money
- `long` poisha everywhere (`PricePoisha`, `AmountPoisha`). The front end displays `formatBn(amount / 100)` + `৳`.
- Keep `VatRateBasisPoints` on `Plan` from day one, even if it is 0.

## Entitlements
- `Plan.Limits` (jsonb): `{ subjects (null = all), levelSlugs, savedSets, teachers, students, omrTokensIncluded, onlineExamsPerMonth }`.
- `Subscription (InstitutionId, PlanId, StartsAt, EndsAt, Status)` + `SubscriptionSubject (SubscriptionId, SubjectId)`.
- One service used everywhere — `IEntitlements` (Infrastructure):
  - `HasSubjectAccessAsync(institutionId, subjectId, ct)` and `EnsureSubjectAccessAsync(...)`, which throws
    `AppException("subscription.subject_required", Messages.SubjectSubscriptionRequired, 402)`
  - `AssertWithinLimitAsync(institutionId, LimitKey, ct)`
  - cached in FusionCache for 5 minutes per institution; evicted on any subscription change.
- Expired subscription: saved sets stay readable and printable; creating new sets for that subject returns 402, which the
  UI shows as the "no subscription for selected subject" notice with a Subscribe button.

## Checkout flow
1. `POST /api/v1/checkout` creates `Payment { Status = Pending, AmountPoisha, TranId (unique, ours), Gateway, PlanId, SubjectIds }`,
   calls the gateway's init API and returns `{ redirectUrl }`; the SPA calls `window.location.assign(redirectUrl)`.
2. The browser return page (`/billing/return`) only shows "verifying…" and polls `GET /api/v1/payments/{tranId}`.
   **Never** activate anything from a browser redirect.
3. IPN: `[AllowAnonymous] POST /api/v1/payments/{gateway}/ipn`, exempt from antiforgery, rate-limited, logs raw payloads (minus secrets).
4. Reconciliation: Hangfire recurring job every 15 minutes queries the gateway for `Pending` payments older than 10 minutes
   and runs the same apply logic.
5. Typed `HttpClient`s (`SslCommerzClient`, `BkashClient`) with timeouts; **no automatic retries on non-idempotent calls**
   (session init, create, execute). Query/validation calls may retry.

### Apply logic (shared by IPN and reconciliation)
```csharp
public async Task ApplyAsync(GatewayValidation validation, CancellationToken ct)
{
    // Server-to-server validation already happened (outside the transaction; never hold a row lock during HTTP calls).
    await using var tx = await db.Database.BeginTransactionAsync(ct);

    // IPN is anonymous, so there is no tenant in context: bypass the tenant filter deliberately.
    var payment = await db.Payments
        .FromSql($"SELECT * FROM payments WHERE tran_id = {validation.TranId} FOR UPDATE")
        .IgnoreQueryFilters()
        .SingleOrDefaultAsync(ct);

    if (payment is null || payment.Status != PaymentStatus.Pending) return;       // unknown or already applied → idempotent

    var now = clock.GetUtcNow();
    if (!validation.IsSuccess || validation.AmountPoisha != payment.AmountPoisha || validation.Currency != "BDT")
    {
        payment.MarkFailed(validation.RawJson, now);
    }
    else
    {
        payment.MarkPaid(validation.RawJson, now);
        await subscriptions.ActivateOrExtendAsync(payment, ct);                   // adds included OMR tokens too
        await affiliates.RecordCommissionAsync(payment, ct);
        await invoices.IssueAsync(payment, ct);                                   // numbered now, PDF rendered later
    }

    await db.SaveChangesAsync(ct);
    await tx.CommitAsync(ct);

    if (payment.Status == PaymentStatus.Paid)
    {
        jobs.Enqueue<RenderInvoicePdfJob>(j => j.RunAsync(payment.Id, CancellationToken.None));
        await cache.RemoveAsync(EntitlementCache.Key(payment.InstitutionId), token: ct);
    }
}
```

### SSLCommerz
Session init API → `GatewayPageURL` redirect → IPN POST with `val_id` → call the validation API with store id/password →
trust only the validation response (status, amount, currency, `tran_id`, store id). Use sandbox until go-live.

### bKash Tokenized Checkout
Grant token (cache until expiry) → create payment → redirect to `bkashURL` → callback → execute payment → if execute
times out, call query payment before deciding. Store `paymentID` and `trxID`.

Always confirm current endpoint paths and field names against the gateway's official developer docs at implementation
time; do not rely on remembered payloads.

## Renewals and notices
- Daily Hangfire recurring job at 10:00 Asia/Dhaka sends reminder SMS/email at 7, 3 and 1 days before `EndsAt`:
  `RecurringJob.AddOrUpdate<RenewalReminderJob>("renewal-reminders", j => j.RunAsync(CancellationToken.None), "0 10 * * *",
  new RecurringJobOptions { TimeZone = TimeZoneInfo.FindSystemTimeZoneById("Asia/Dhaka") })`.
- The dashboard shows a banner during the last 7 days.
- Renewal extends from `max(now, EndsAt)`.

## Invoices
- Number per Bangladesh financial year (July–June): `EP-2026-27-000123`, from an `InvoiceCounter` row locked in the same transaction.
- PDF via the Worker's Chromium renderer (`/print/invoices/:id`), downloadable from the subscription page's payment history.
- Invoices are immutable; corrections are credit notes.

## Tests (integration, Testcontainers + stub `HttpMessageHandler` for gateways)
- IPN replay → exactly one activation; concurrent IPN + reconciliation → exactly one activation.
- Amount or currency mismatch → `Failed`, no subscription.
- Entitlement boundary exactly at `EndsAt`.
- Cross-tenant payment history and invoice download → 404.

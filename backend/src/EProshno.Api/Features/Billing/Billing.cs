using System.Globalization;
using System.Security.Cryptography;
using EProshno.Api.Common;
using EProshno.Api.Features.QuestionSets;
using EProshno.Core.Billing;
using EProshno.Core.Common;
using EProshno.Core.Platform;
using EProshno.Infrastructure.Billing;
using EProshno.Infrastructure.Identity;
using EProshno.Infrastructure.Papers;
using EProshno.Infrastructure.Persistence;
using EProshno.Infrastructure.Storage;
using EProshno.Infrastructure.Tenancy;
using FluentValidation;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ZiggyCreatures.Caching.Fusion;

namespace EProshno.Api.Features.Billing;

public sealed record PlanDto(
    Guid Id,
    string Code,
    string NameBn,
    string? DescriptionBn,
    PlanPricing Pricing,
    long PricePoisha,
    int DurationDays,
    int VatRateBasisPoints,
    PlanLimits Limits,
    IReadOnlyList<string> LevelNames);

public sealed record UsageDto(LimitKey Key, int Used, int? Limit);

public sealed record SubscriptionDto(
    Guid Id,
    string PlanName,
    PlanPricing Pricing,
    bool AllSubjects,
    IReadOnlyList<string> SubjectLabels,
    DateTimeOffset StartsAt,
    DateTimeOffset EndsAt,
    bool IsActive,
    bool IsTrial);

public sealed record SubscriptionSummaryDto(
    bool HasActivePlan,
    bool AllSubjects,
    IReadOnlyList<Guid> SubjectIds,
    IReadOnlyList<string> LevelSlugs,
    DateTimeOffset? EndsAt,
    int? DaysLeft,
    bool RenewalDue,
    PlanLimits Limits,
    IReadOnlyList<UsageDto> Usage,
    IReadOnlyList<SubscriptionDto> Subscriptions);

public sealed record PaymentDto(
    Guid Id,
    string TranId,
    string PlanName,
    int SubjectCount,
    long AmountPoisha,
    string Currency,
    PaymentGateway Gateway,
    PaymentStatus Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset? PaidAt,
    Guid? InvoiceId,
    string? InvoiceNumber);

public sealed record InvoiceDto(
    Guid Id,
    string Number,
    string SellerName,
    string? SellerAddress,
    string BilledToName,
    string? BilledToAddress,
    IReadOnlyList<InvoiceLine> Lines,
    long SubtotalPoisha,
    long VatPoisha,
    long TotalPoisha,
    DateTimeOffset PeriodStart,
    DateTimeOffset PeriodEnd,
    DateTimeOffset IssuedAt,
    string TranId,
    PaymentGateway Gateway);

public sealed class BillingReader(AppDbContext db, IOptions<BillingOptions> options)
{
    public const int RenewalWindowDays = 7;

    public IQueryable<PaymentDto> Payments(IQueryable<Payment> payments) =>
        from p in payments
        join i in db.Invoices on p.Id equals i.PaymentId into invoices
        from i in invoices.DefaultIfEmpty()
        select new PaymentDto(
            p.Id,
            p.TranId,
            p.Plan!.NameBn,
            p.SubjectIds.Length,
            p.AmountPoisha,
            p.Currency,
            p.Gateway,
            p.Status,
            p.CreatedAt,
            p.PaidAt,
            i != null ? (Guid?)i.Id : null,
            i != null ? i.Number : null);

    public async Task<InvoiceDto> InvoiceAsync(Guid id, CancellationToken ct)
    {
        var row = await (
                from i in db.Invoices.AsNoTracking()
                where i.Id == id
                join p in db.Payments on i.PaymentId equals p.Id
                select new
                {
                    Invoice = i,
                    p.TranId,
                    p.Gateway,
                    Address = db.Institutions.Where(x => x.Id == i.InstitutionId).Select(x => x.Address).FirstOrDefault(),
                })
            .FirstOr404Async(ct);
        var inv = row.Invoice;
        return new InvoiceDto(
            inv.Id,
            inv.Number,
            options.Value.SellerName,
            options.Value.SellerAddress,
            inv.BilledToName,
            row.Address,
            inv.Lines,
            inv.SubtotalPoisha,
            inv.VatPoisha,
            inv.TotalPoisha,
            inv.PeriodStart,
            inv.PeriodEnd,
            inv.IssuedAt,
            row.TranId,
            row.Gateway);
    }
}

public static class ListPlans
{
    public sealed record Query : IQuery<IReadOnlyList<PlanDto>>;

    internal sealed class Handler(AppDbContext db) : IQueryHandler<Query, IReadOnlyList<PlanDto>>
    {
        public async Task<IReadOnlyList<PlanDto>> Handle(Query query, CancellationToken ct)
        {
            var plans = await db.Plans.AsNoTracking()
                .Where(p => p.IsActive && p.Code != TrialService.TrialPlanCode)
                .OrderBy(p => p.Sort)
                .ToListAsync(ct);
            var levels = await db.Levels.AsNoTracking().ToDictionaryAsync(l => l.Slug, l => l.NameBn, ct);
            return plans.Select(p => ToDto(p, levels)).ToList();
        }
    }

    public static PlanDto ToDto(Plan p, IReadOnlyDictionary<string, string> levelNames) => new(
        p.Id,
        p.Code,
        p.NameBn,
        p.DescriptionBn,
        p.Pricing,
        p.PricePoisha,
        p.DurationDays,
        p.VatRateBasisPoints,
        p.Limits,
        p.Limits.LevelSlugs.Select(s => levelNames.GetValueOrDefault(s, s)).ToList());
}

public static class GetSubscription
{
    public sealed record Query : IQuery<SubscriptionSummaryDto>;

    /// <summary>What the institution may use now, how much of each limit is used, and its subscription history.</summary>
    internal sealed class Handler(AppDbContext db, ITenantContext tenant, IEntitlements entitlements, TimeProvider clock)
        : IQueryHandler<Query, SubscriptionSummaryDto>
    {
        public async Task<SubscriptionSummaryDto> Handle(Query query, CancellationToken ct)
        {
            var institutionId = tenant.InstitutionId;
            var now = clock.GetUtcNow();
            var snapshot = await entitlements.GetAsync(institutionId, ct);

            var usage = new List<UsageDto>();
            foreach (var key in Enum.GetValues<LimitKey>())
            {
                usage.Add(new UsageDto(key, await entitlements.CountUsageAsync(institutionId, key, ct), LimitOf(snapshot.Limits, key)));
            }

            var subscriptions = await db.Subscriptions.AsNoTracking()
                .OrderByDescending(s => s.EndsAt)
                .Take(50)
                .Select(s => new
                {
                    s.Id,
                    PlanName = s.Plan!.NameBn,
                    s.Plan.Pricing,
                    s.Plan.Code,
                    s.AllSubjects,
                    s.StartsAt,
                    s.EndsAt,
                    s.Status,
                    Subjects = db.Subjects
                        .Where(x => s.Subjects.Select(ss => ss.SubjectId).Contains(x.Id))
                        .Select(x => new { x.NameBn, x.Paper })
                        .ToList(),
                })
                .ToListAsync(ct);

            int? daysLeft = snapshot.EndsAt is { } endsAt ? (int)Math.Ceiling((endsAt - now).TotalDays) : null;
            return new SubscriptionSummaryDto(
                snapshot.HasActivePlan,
                snapshot.AllSubjects,
                snapshot.SubjectIds,
                snapshot.LevelSlugs,
                snapshot.EndsAt,
                daysLeft,
                daysLeft is not null && daysLeft <= BillingReader.RenewalWindowDays,
                snapshot.Limits,
                usage,
                subscriptions.Select(s => new SubscriptionDto(
                    s.Id,
                    s.PlanName,
                    s.Pricing,
                    s.AllSubjects,
                    s.Subjects.Select(x => PaperLoader.SubjectLabel(x.NameBn, x.Paper)).ToList(),
                    s.StartsAt,
                    s.EndsAt,
                    s.Status == SubscriptionStatus.Active && s.StartsAt <= now && now < s.EndsAt,
                    s.Code == TrialService.TrialPlanCode)).ToList());
        }

        private static int? LimitOf(PlanLimits limits, LimitKey key) => key switch
        {
            LimitKey.SavedSets => limits.SavedSets,
            LimitKey.Teachers => limits.Teachers,
            LimitKey.Students => limits.Students,
            LimitKey.CustomBanks => limits.CustomBanks,
            LimitKey.CustomQuestions => limits.CustomQuestions,
            _ => limits.ImportsPerMonth,
        };
    }
}

public static class Checkout
{
    public sealed record Command(Guid PlanId, IReadOnlyList<Guid> SubjectIds) : ICommand<Response>;

    /// <param name="RedirectUrl">Open with <c>window.location.assign</c>.</param>
    public sealed record Response(string RedirectUrl, string TranId);

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator()
        {
            RuleFor(x => x.PlanId).NotEmpty().WithMessage(Messages.PlanNotFound);
            RuleFor(x => x.SubjectIds).NotNull().WithMessage(Messages.Required)
                .Must(s => s is null || (s.Count <= 100 && s.Distinct().Count() == s.Count)).WithMessage(Messages.InvalidValue);
        }
    }

    /// <summary>
    /// Creates a pending payment and starts the gateway session. Nothing is activated here or on the browser
    /// return: only a verified IPN or reconciliation applies a payment.
    /// </summary>
    internal sealed class Handler(
        AppDbContext db,
        ITenantContext tenant,
        UserManager<AppUser> users,
        PaymentGatewayResolver gateways,
        IOptions<AppOptions> app,
        TimeProvider clock,
        ILogger<Handler> logger) : ICommandHandler<Command, Response>
    {
        public async Task<Response> Handle(Command command, CancellationToken ct)
        {
            var institutionId = tenant.InstitutionId;
            var plan = await db.Plans.AsNoTracking()
                           .FirstOrDefaultAsync(p => p.Id == command.PlanId && p.IsActive && p.Code != TrialService.TrialPlanCode, ct)
                       ?? throw AppException.NotFound(Messages.PlanNotFound);
            if (plan.Pricing == PlanPricing.Free)
            {
                throw new AppException("billing.free_plan", Messages.FreePlanNoCheckout);
            }

            var subjectIds = plan.Pricing == PlanPricing.PerSubject ? command.SubjectIds.Distinct().ToArray() : [];
            if (plan.Pricing == PlanPricing.PerSubject)
            {
                if (subjectIds.Length == 0)
                {
                    throw Guard.Invalid("subjectIds", Messages.SubjectsRequiredForPlan);
                }

                if (plan.Limits.MaxSubjects is { } max && subjectIds.Length > max)
                {
                    throw Guard.Invalid("subjectIds", Messages.TooManySubjectsForPlan);
                }

                var slugs = plan.Limits.LevelSlugs;
                var valid = await db.Subjects.CountAsync(
                    s => subjectIds.Contains(s.Id) && s.InstitutionId == null && (slugs.Length == 0 || slugs.Contains(s.Level!.Slug)), ct);
                if (valid != subjectIds.Length)
                {
                    throw Guard.Invalid("subjectIds", Messages.SubjectNotFound);
                }
            }

            var gateway = gateways.Default;
            var now = clock.GetUtcNow();
            var payment = new Payment
            {
                Id = IdGen.New(),
                InstitutionId = institutionId,
                CreatedById = tenant.UserId,
                PlanId = plan.Id,
                SubjectIds = subjectIds,
                AmountPoisha = plan.AmountFor(subjectIds.Length),
                Currency = Payment.Bdt,
                Gateway = gateway.Kind,
                TranId = NewTranId(now),
                Status = PaymentStatus.Pending,
                CreatedAt = now,
                UpdatedAt = now,
            };
            db.Payments.Add(payment);
            await db.SaveChangesAsync(ct);

            var user = await users.FindByIdAsync(tenant.UserId.ToString()) ?? throw AppException.NotFound();
            var institutionName = await db.Institutions.Where(i => i.Id == institutionId).Select(i => i.Name).FirstAsync(ct);
            var api = app.Value.ApiBaseUrl.TrimEnd('/');
            var callbacks = $"{api}/api/v1/billing/payments/{gateway.Kind}";
            var urls = new CheckoutUrls(
                $"{callbacks}/return/success",
                $"{callbacks}/return/fail",
                $"{callbacks}/return/cancel",
                $"{callbacks}/ipn");

            try
            {
                var redirect = await gateway.InitAsync(
                    payment,
                    plan.NameBn,
                    new CheckoutCustomer(user.FullName, user.Email, user.PhoneNumber, institutionName),
                    urls,
                    ct);
                return new Response(redirect, payment.TranId);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Payment session init failed for {TranId}", payment.TranId);
                payment.MarkFailed(null, clock.GetUtcNow(), PaymentStatus.Cancelled);
                await db.SaveChangesAsync(CancellationToken.None);
                throw new AppException("billing.gateway_unavailable", Messages.PaymentGatewayUnavailable, 503);
            }
        }

        /// <summary>EP + date + 12 random hex characters: unique, and safe in URLs and gateway fields.</summary>
        private static string NewTranId(DateTimeOffset now) =>
            string.Create(CultureInfo.InvariantCulture, $"EP{now:yyyyMMdd}{Convert.ToHexString(RandomNumberGenerator.GetBytes(6))}");
    }
}

public static class HandleGatewayCallback
{
    public sealed record Command(PaymentGateway Gateway, IReadOnlyDictionary<string, string> Form) : ICommand<PaymentStatus?>;

    /// <summary>
    /// IPN: anonymous, but nothing is trusted until the gateway's own validation API confirms the transaction
    /// (see <see cref="IPaymentGateway.ValidateCallbackAsync"/>). Replays are idempotent.
    /// </summary>
    internal sealed class Handler(PaymentGatewayResolver gateways, PaymentApplier applier) : ICommandHandler<Command, PaymentStatus?>
    {
        public async Task<PaymentStatus?> Handle(Command command, CancellationToken ct)
        {
            IPaymentGateway gateway;
            try
            {
                gateway = gateways.Get(command.Gateway);
            }
            catch (InvalidOperationException)
            {
                throw AppException.NotFound();
            }

            var validation = await gateway.ValidateCallbackAsync(command.Form, ct)
                ?? throw new AppException("billing.callback_invalid", Messages.PaymentNotFound);
            return await applier.ApplyAsync(validation, ct);
        }
    }
}

public static class GetPayment
{
    public sealed record Query(string TranId) : IQuery<PaymentDto>;

    public static readonly TimeSpan QueryAfter = TimeSpan.FromSeconds(30);
    public static readonly TimeSpan QueryEvery = TimeSpan.FromSeconds(15);

    /// <summary>
    /// The return page polls this. While a payment is pending it also asks the gateway (server to server, throttled),
    /// so a missed IPN does not leave the teacher waiting for reconciliation.
    /// </summary>
    internal sealed class Handler(
        AppDbContext db,
        BillingReader reader,
        PaymentGatewayResolver gateways,
        PaymentApplier applier,
        IFusionCache cache,
        TimeProvider clock,
        ILogger<Handler> logger) : IQueryHandler<Query, PaymentDto>
    {
        public async Task<PaymentDto> Handle(Query query, CancellationToken ct)
        {
            var payment = await db.Payments.AsNoTracking()
                              .Where(p => p.TranId == query.TranId)
                              .Select(p => new { p.TranId, p.Status, p.Gateway, p.CreatedAt })
                              .FirstOrDefaultAsync(ct)
                          ?? throw AppException.NotFound(Messages.PaymentNotFound);

            if (payment.Status == PaymentStatus.Pending && clock.GetUtcNow() - payment.CreatedAt > QueryAfter)
            {
                var throttle = $"payment-query:{payment.TranId}";
                if (!await cache.GetOrDefaultAsync(throttle, false, token: ct))
                {
                    await cache.SetAsync(throttle, true, QueryEvery, token: ct);
                    try
                    {
                        var validation = await gateways.Get(payment.Gateway).QueryAsync(payment.TranId, ct);
                        if (validation is not null && validation.TranId == payment.TranId)
                        {
                            await applier.ApplyAsync(validation, ct);
                        }
                    }
                    catch (Exception ex) when (ex is not OperationCanceledException)
                    {
                        logger.LogWarning(ex, "Payment status query failed for {TranId}", payment.TranId);
                    }
                }
            }

            return await reader.Payments(db.Payments.AsNoTracking().Where(p => p.TranId == query.TranId)).FirstAsync(ct);
        }
    }
}

public static class ListPayments
{
    public sealed record Query(string? Cursor, int? Limit) : IQuery<CursorPage<PaymentDto>>;

    internal sealed class Handler(AppDbContext db, BillingReader reader) : IQueryHandler<Query, CursorPage<PaymentDto>>
    {
        public async Task<CursorPage<PaymentDto>> Handle(Query query, CancellationToken ct)
        {
            var payments = db.Payments.AsNoTracking();
            if (Paging.GuidCursor(query.Cursor) is { } cursor)
            {
                payments = payments.Where(p => p.Id.CompareTo(cursor) < 0);
            }

            var paged = await payments
                .OrderByDescending(p => p.Id)
                .ToPageAsync(p => Paging.Cursor(p.Id), query.Limit, ct);

            var ids = paged.Items.Select(p => p.Id).ToList();
            var dtos = await reader.Payments(db.Payments.Where(p => ids.Contains(p.Id))).ToDictionaryAsync(p => p.Id, ct);
            return new CursorPage<PaymentDto>(
                paged.Items.Select(p => dtos[p.Id]).ToList(),
                paged.NextCursor);
        }
    }
}

public static class GetInvoice
{
    public sealed record Query(Guid Id) : IQuery<InvoiceDto>;

    internal sealed class Handler(BillingReader reader) : IQueryHandler<Query, InvoiceDto>
    {
        public Task<InvoiceDto> Handle(Query query, CancellationToken ct) => reader.InvoiceAsync(query.Id, ct);
    }
}

public static class RequestInvoicePdf
{
    public sealed record Command(Guid Id) : ICommand<JobDto>;

    /// <summary>Invoices never change, so the PDF key only depends on the invoice and the renderer version.</summary>
    internal sealed class Handler(AppDbContext db, ITenantContext tenant, PdfJobs pdfs, IOptions<RenderOptions> options)
        : ICommandHandler<Command, JobDto>
    {
        public async Task<JobDto> Handle(Command command, CancellationToken ct)
        {
            var invoice = await db.Invoices.AsNoTracking()
                .Where(i => i.Id == command.Id)
                .Select(i => new { i.Id, i.InstitutionId, i.Number })
                .FirstOr404Async(ct);
            var key = string.Create(CultureInfo.InvariantCulture, $"invoice-{invoice.Id:N}-r{options.Value.RendererVersion}");
            return await pdfs.RequestAsync(
                invoice.InstitutionId,
                tenant.UserId,
                JobKind.InvoicePdf,
                invoice.Id,
                0,
                StorageKeys.Pdf(invoice.InstitutionId, key),
                invoice.Number + ".pdf",
                ct);
        }
    }
}

public static class RenderInvoice
{
    public sealed record Query(Guid Id, string? Token) : IQuery<InvoiceDto>;

    /// <summary>For the Worker's Chromium, authorised by a render token (see <c>RenderSetPaper</c>).</summary>
    internal sealed class Handler(RenderTokenService tokens, TenantContext tenant, BillingReader reader) : IQueryHandler<Query, InvoiceDto>
    {
        public Task<InvoiceDto> Handle(Query query, CancellationToken ct)
        {
            var institutionId = tokens.Validate(RenderResources.Invoice, query.Id, 0, query.Token)
                ?? throw new AppException("render.token", Messages.InvalidRenderToken, 401);
            tenant.Set(null, institutionId);
            return reader.InvoiceAsync(query.Id, ct);
        }
    }
}

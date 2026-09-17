using System.Globalization;
using EProshno.Core.Common;

namespace EProshno.Core.Billing;

public enum PlanPricing
{
    /// <summary>Price covers every subject in the allowed levels.</summary>
    AllSubjects,

    /// <summary>Price is per selected subject.</summary>
    PerSubject,

    /// <summary>No platform-bank access; custom banks only.</summary>
    Free,
}

/// <summary>Null limit = unlimited.</summary>
public sealed record PlanLimits
{
    public int? MaxSubjects { get; init; }
    public string[] LevelSlugs { get; init; } = [];
    public int? SavedSets { get; init; }
    public int? Teachers { get; init; }
    public int? Students { get; init; }
    public int? CustomBanks { get; init; }
    public int? CustomQuestions { get; init; }
    public int? ImportsPerMonth { get; init; }
    public int OmrTokensIncluded { get; init; }
    public int? OnlineExamsPerMonth { get; init; }

    /// <summary>The most generous value of each limit across active subscriptions.</summary>
    public static PlanLimits Max(PlanLimits a, PlanLimits b) => new()
    {
        MaxSubjects = MaxOf(a.MaxSubjects, b.MaxSubjects),
        LevelSlugs = [.. a.LevelSlugs.Union(b.LevelSlugs)],
        SavedSets = MaxOf(a.SavedSets, b.SavedSets),
        Teachers = MaxOf(a.Teachers, b.Teachers),
        Students = MaxOf(a.Students, b.Students),
        CustomBanks = MaxOf(a.CustomBanks, b.CustomBanks),
        CustomQuestions = MaxOf(a.CustomQuestions, b.CustomQuestions),
        ImportsPerMonth = MaxOf(a.ImportsPerMonth, b.ImportsPerMonth),
        OmrTokensIncluded = Math.Max(a.OmrTokensIncluded, b.OmrTokensIncluded),
        OnlineExamsPerMonth = MaxOf(a.OnlineExamsPerMonth, b.OnlineExamsPerMonth),
    };

    private static int? MaxOf(int? x, int? y) => x is null || y is null ? null : Math.Max(x.Value, y.Value);
}

public enum LimitKey
{
    SavedSets,
    Teachers,
    Students,
    CustomBanks,
    CustomQuestions,
    ImportsPerMonth,
}

public sealed class Plan
{
    public Guid Id { get; set; }
    public string Code { get; set; } = "";
    public string NameBn { get; set; } = "";
    public string? DescriptionBn { get; set; }
    public PlanPricing Pricing { get; set; }

    /// <summary>BDT × 100. For PerSubject plans this is the price of one subject.</summary>
    public long PricePoisha { get; set; }

    public int DurationDays { get; set; }
    public int VatRateBasisPoints { get; set; }
    public PlanLimits Limits { get; set; } = new();
    public bool IsActive { get; set; }
    public int Sort { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public long AmountFor(int subjectCount) => Pricing switch
    {
        PlanPricing.PerSubject => PricePoisha * Math.Max(subjectCount, 1),
        PlanPricing.Free => 0,
        _ => PricePoisha,
    };

    public long VatFor(long amountPoisha) => amountPoisha * VatRateBasisPoints / 10_000;
}

public enum SubscriptionStatus
{
    Active,
    Cancelled,
}

public sealed class Subscription : ITenantOwned
{
    public Guid Id { get; set; }
    public Guid InstitutionId { get; set; }
    public Guid PlanId { get; set; }
    public bool AllSubjects { get; set; }
    public DateTimeOffset StartsAt { get; set; }
    public DateTimeOffset EndsAt { get; set; }
    public SubscriptionStatus Status { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public Plan? Plan { get; set; }
    public List<SubscriptionSubject> Subjects { get; set; } = [];

    /// <summary>Active in the half-open interval [StartsAt, EndsAt).</summary>
    public bool IsActiveAt(DateTimeOffset now) => Status == SubscriptionStatus.Active && StartsAt <= now && now < EndsAt;
}

public sealed class SubscriptionSubject
{
    public Guid SubscriptionId { get; set; }
    public Guid SubjectId { get; set; }
}

public enum PaymentGateway
{
    SslCommerz,
    Bkash,
    Fake,
}

public enum PaymentStatus
{
    Pending,
    Paid,
    Failed,
    Cancelled,
}

public sealed class Payment : ITenantOwned
{
    public const string Bdt = "BDT";

    public Guid Id { get; set; }
    public Guid InstitutionId { get; set; }
    public Guid CreatedById { get; set; }
    public Guid PlanId { get; set; }
    public Guid[] SubjectIds { get; set; } = [];
    public long AmountPoisha { get; set; }
    public string Currency { get; set; } = Bdt;
    public PaymentGateway Gateway { get; set; }

    /// <summary>Our unique transaction id, sent to the gateway.</summary>
    public string TranId { get; set; } = "";

    public string? GatewayRef { get; set; }
    public PaymentStatus Status { get; set; }

    /// <summary>Last gateway validation payload (secrets removed), jsonb.</summary>
    public string? Raw { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? PaidAt { get; set; }

    public Plan? Plan { get; set; }

    public void MarkPaid(string? gatewayRef, string? raw, DateTimeOffset now)
    {
        Status = PaymentStatus.Paid;
        GatewayRef = gatewayRef;
        Raw = raw;
        PaidAt = now;
        UpdatedAt = now;
    }

    public void MarkFailed(string? raw, DateTimeOffset now, PaymentStatus status = PaymentStatus.Failed)
    {
        Status = status;
        Raw = raw;
        UpdatedAt = now;
    }
}

public sealed record InvoiceLine(string DescriptionBn, int Quantity, long UnitPoisha, long TotalPoisha);

/// <summary>Immutable once issued; corrections are credit notes.</summary>
public sealed class Invoice : ITenantOwned
{
    public Guid Id { get; set; }
    public Guid InstitutionId { get; set; }
    public Guid PaymentId { get; set; }
    public string Number { get; set; } = "";
    public string BilledToName { get; set; } = "";
    public List<InvoiceLine> Lines { get; set; } = [];
    public long SubtotalPoisha { get; set; }
    public long VatPoisha { get; set; }
    public long TotalPoisha { get; set; }
    public DateTimeOffset PeriodStart { get; set; }
    public DateTimeOffset PeriodEnd { get; set; }
    public DateTimeOffset IssuedAt { get; set; }
}

/// <summary>Per Bangladesh financial year (July–June), locked when issuing an invoice.</summary>
public sealed class InvoiceCounter
{
    public string FiscalYear { get; set; } = "";
    public long LastNumber { get; set; }
}

public static class InvoiceNumbers
{
    /// <summary>"2026-27" for any date from 1 July 2026 to 30 June 2027 (Asia/Dhaka).</summary>
    public static string FiscalYear(DateTimeOffset at)
    {
        var local = BdTime.ToLocal(at);
        var startYear = local.Month >= 7 ? local.Year : local.Year - 1;
        return string.Create(CultureInfo.InvariantCulture, $"{startYear}-{(startYear + 1) % 100:00}");
    }

    public static string Format(string fiscalYear, long number) =>
        string.Create(CultureInfo.InvariantCulture, $"EP-{fiscalYear}-{number:000000}");
}
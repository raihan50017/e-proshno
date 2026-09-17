using EProshno.Core.Common;

namespace EProshno.Core.Platform;

public sealed class Announcement
{
    public Guid Id { get; set; }
    public string TitleBn { get; set; } = "";
    public string BodyBn { get; set; } = "";
    public string? LinkUrl { get; set; }
    public DateTimeOffset StartsAt { get; set; }
    public DateTimeOffset? EndsAt { get; set; }
    public bool IsActive { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class AuditLog
{
    public Guid Id { get; set; }
    public Guid? ActorId { get; set; }
    public Guid? InstitutionId { get; set; }
    public string Action { get; set; } = "";
    public string EntityType { get; set; } = "";
    public string? EntityId { get; set; }

    /// <summary>jsonb: changed property names (never values of personal data).</summary>
    public string? Meta { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}

public enum JobKind
{
    PaperPdf,
    InvoicePdf,
}

public enum JobState
{
    Queued,
    Running,
    Succeeded,
    Failed,
}

/// <summary>Status of a background job the SPA polls (GET /api/v1/jobs/{id}).</summary>
public sealed class JobRecord : ITenantOwned
{
    public Guid Id { get; set; }
    public Guid InstitutionId { get; set; }
    public Guid UserId { get; set; }
    public JobKind Kind { get; set; }

    /// <summary>The set or invoice being rendered.</summary>
    public Guid TargetId { get; set; }

    /// <summary>Paper variant (0 = ক); 0 for invoices.</summary>
    public int Variant { get; set; }

    /// <summary>Storage key the PDF is written to (content-addressed for papers).</summary>
    public string ObjectKey { get; set; } = "";

    public string? DownloadName { get; set; }

    public JobState State { get; set; }

    /// <summary>Storage key of the produced file, set on success.</summary>
    public string? ResultKey { get; set; }

    public string? Error { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
}

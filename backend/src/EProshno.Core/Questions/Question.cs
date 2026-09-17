using EProshno.Core.Common;
using EProshno.Core.Taxonomy;

namespace EProshno.Core.Questions;

public enum QuestionType
{
    Mcq,
    Cq,
    Short,
}

public enum McqKind
{
    Simple,
    MultiCompletion,
    CommonInfo,
}

public enum ContentStatus
{
    Draft,
    InReview,
    PendingApproval,
    Published,
    Archived,
}

public enum ExamSource
{
    Board,
    School,
    Admission,
    Other,
}

public enum BankSharing
{
    Private,
    Institution,
}

/// <summary>
/// A question in the platform bank (BankId null) or in a custom bank. Not ITenantOwned: teacher queries must go
/// through <c>VisibleTo(institutionId, userId)</c>.
/// </summary>
public sealed class Question
{
    public Guid Id { get; set; }
    public QuestionType Type { get; set; }
    public McqKind? McqKind { get; set; }
    public Guid SubjectId { get; set; }
    public Guid ChapterId { get; set; }
    public Guid? TopicId { get; set; }
    public Guid? StimulusId { get; set; }

    /// <summary>TipTap JSON (jsonb).</summary>
    public string Stem { get; set; } = "{}";

    /// <summary>BanglaText.Normalize(plain text of stimulus + stem + options/parts) for search and dedupe.</summary>
    public string StemText { get; set; } = "";

    /// <summary>TipTap JSON (jsonb); for Short questions this holds the model answer.</summary>
    public string? Explanation { get; set; }

    public byte Difficulty { get; set; } = 2;
    public byte Importance { get; set; }
    public bool IsMath { get; set; }
    public bool HasImage { get; set; }
    public bool IsCommon { get; set; }
    public string ContentHash { get; set; } = "";
    public Guid? BankId { get; set; }
    public Guid? SourceQuestionId { get; set; }
    public Guid? ImportJobId { get; set; }
    public ContentStatus Status { get; set; }
    public string? ReviewNote { get; set; }
    public Guid CreatedById { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? PublishedAt { get; set; }

    public QuestionBank? Bank { get; set; }
    public Stimulus? Stimulus { get; set; }
    public Subject? Subject { get; set; }
    public Chapter? Chapter { get; set; }
    public Topic? Topic { get; set; }
    public List<McqOption> Options { get; set; } = [];
    public List<CqPart> CqParts { get; set; } = [];
    public List<QuestionAppearance> Appearances { get; set; } = [];
    public List<QuestionTagLink> Tags { get; set; } = [];
}

/// <summary>উদ্দীপক for a CQ, or the shared information of a CommonInfo MCQ group.</summary>
public sealed class Stimulus
{
    public Guid Id { get; set; }
    public string Content { get; set; } = "{}";
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class McqOption
{
    public Guid Id { get; set; }
    public Guid QuestionId { get; set; }

    /// <summary>0–3 = ক–ঘ.</summary>
    public int Index { get; set; }

    public string Content { get; set; } = "{}";
    public bool IsCorrect { get; set; }
}

public sealed class CqPart
{
    public Guid Id { get; set; }
    public Guid QuestionId { get; set; }

    /// <summary>0–3 = ক–ঘ.</summary>
    public int Part { get; set; }

    public string Prompt { get; set; } = "{}";
    public decimal Marks { get; set; }
    public string? Answer { get; set; }
}

public sealed class QuestionAppearance
{
    public Guid Id { get; set; }
    public Guid QuestionId { get; set; }
    public ExamSource Source { get; set; }
    public Guid? BoardId { get; set; }
    public string? SchoolName { get; set; }
    public int Year { get; set; }

    public Board? Board { get; set; }
}

public sealed class QuestionBank : ITenantOwned
{
    public Guid Id { get; set; }
    public Guid InstitutionId { get; set; }
    public Guid OwnerId { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public Guid? LevelId { get; set; }
    public Guid? SubjectId { get; set; }
    public BankSharing Sharing { get; set; }
    public bool RequireApproval { get; set; }
    public bool IsDefault { get; set; }
    public int QuestionCount { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? ArchivedAt { get; set; }
}

public sealed class QuestionTag : ITenantOwned
{
    public Guid Id { get; set; }
    public Guid InstitutionId { get; set; }
    public string Name { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class QuestionTagLink
{
    public Guid QuestionId { get; set; }
    public Guid TagId { get; set; }

    public QuestionTag? Tag { get; set; }
}

/// <summary>Snapshot taken before each edit of a published platform question.</summary>
public sealed class QuestionRevision
{
    public Guid Id { get; set; }
    public Guid QuestionId { get; set; }

    /// <summary>jsonb: the QuestionContent as it was before the edit.</summary>
    public string Snapshot { get; set; } = "{}";

    public Guid EditedById { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public enum ReportStatus
{
    Open,
    Resolved,
    Rejected,
}

public sealed class QuestionReport : ITenantOwned
{
    public Guid Id { get; set; }
    public Guid InstitutionId { get; set; }
    public Guid QuestionId { get; set; }
    public Guid ReporterId { get; set; }
    public string Reason { get; set; } = "";
    public ReportStatus Status { get; set; }
    public string? Resolution { get; set; }
    public Guid? ResolvedById { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ResolvedAt { get; set; }

    public Question? Question { get; set; }
}

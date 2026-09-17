using EProshno.Core.Common;
using EProshno.Core.Questions;

namespace EProshno.Core.Imports;

public enum ImportSourceType
{
    Paste,
    Excel,
    Csv,
    Word,
    Json,
    Pdf,
}

public enum ImportStatus
{
    Uploaded,
    Parsing,
    NeedsMapping,
    Preview,
    Committing,
    Completed,
    Failed,
    RolledBack,
}

public enum ImportRowStatus
{
    Ok,
    Warning,
    Error,
    Duplicate,
    Excluded,
    Imported,
}

public enum MessageSeverity
{
    Warning,
    Error,
}

public sealed record ImportMessage(string Field, string Code, string MessageBn, MessageSeverity Severity);

public sealed record ImportDefaults
{
    public Guid LevelId { get; init; }
    public Guid SubjectId { get; init; }
    public Guid? ChapterId { get; init; }
    public QuestionType Type { get; init; } = QuestionType.Mcq;
    public byte Difficulty { get; init; } = 2;
}

public sealed record DraftCqPart
{
    public string Prompt { get; init; } = "";
    public decimal? Marks { get; init; }
    public string? Answer { get; init; }
}

public sealed record DraftBoardTag(string Raw, Guid? BoardId, int? Year);

/// <summary>
/// One parsed question, the same shape for every source. Text fields are plain text with <c>$…$</c> math;
/// they become TipTap JSON at commit time.
/// </summary>
public sealed record QuestionDraft
{
    public QuestionType Type { get; init; }
    public McqKind? McqKind { get; init; }
    public string? GroupKey { get; init; }
    public string? Stimulus { get; init; }
    public string Stem { get; init; } = "";
    public List<string> Statements { get; init; } = [];
    public string? StemTail { get; init; }
    public List<string> Options { get; init; } = [];
    public string? CorrectRaw { get; init; }
    public int? CorrectIndex { get; init; }
    public List<DraftCqPart> CqParts { get; init; } = [];
    public string? Explanation { get; init; }
    public string? ChapterRef { get; init; }
    public Guid? ChapterId { get; init; }
    public string? TopicRef { get; init; }
    public Guid? TopicId { get; init; }
    public byte? Difficulty { get; init; }
    public byte? Importance { get; init; }
    public List<DraftBoardTag> BoardTags { get; init; } = [];
    public string SourceLocation { get; init; } = "";
}

public sealed class ImportJob : ITenantOwned
{
    /// <summary>InstitutionId of platform-bank imports made by the content team (they belong to no institution).</summary>
    public static readonly Guid PlatformScope = Guid.Empty;

    public Guid Id { get; set; }
    public Guid InstitutionId { get; set; }

    /// <summary>Target custom bank; null = the platform bank (content team, questions land as Draft).</summary>
    public Guid? BankId { get; set; }

    public Guid CreatedById { get; set; }
    public ImportSourceType SourceType { get; set; }
    public string? FileKey { get; set; }
    public string? FileName { get; set; }
    public string? PastedText { get; set; }
    public ImportDefaults Defaults { get; set; } = new();

    /// <summary>Column key → header text, set by the teacher when the spreadsheet headers were not recognised.</summary>
    public Dictionary<string, string> ColumnMap { get; set; } = [];

    /// <summary>Headers found in the spreadsheet, shown on the mapping step.</summary>
    public List<string> DetectedHeaders { get; set; } = [];

    /// <summary>Required column keys that could not be matched (NeedsMapping).</summary>
    public List<string> MissingColumns { get; set; } = [];

    public ImportStatus Status { get; set; }

    public bool IsPlatform => BankId is null;
    public int TotalRows { get; set; }
    public int OkRows { get; set; }
    public int WarningRows { get; set; }
    public int ErrorRows { get; set; }
    public int DuplicateRows { get; set; }
    public int ExcludedRows { get; set; }
    public int ImportedRows { get; set; }
    public string? Error { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public DateTimeOffset? RollbackUntil { get; set; }
    public DateTimeOffset? RolledBackAt { get; set; }

    public QuestionBank? Bank { get; set; }

    public void RecountFrom(IEnumerable<ImportRowStatus> statuses)
    {
        var list = statuses.ToList();
        TotalRows = list.Count;
        OkRows = list.Count(s => s == ImportRowStatus.Ok);
        WarningRows = list.Count(s => s == ImportRowStatus.Warning);
        ErrorRows = list.Count(s => s == ImportRowStatus.Error);
        DuplicateRows = list.Count(s => s == ImportRowStatus.Duplicate);
        ExcludedRows = list.Count(s => s == ImportRowStatus.Excluded);
        ImportedRows = list.Count(s => s == ImportRowStatus.Imported);
    }
}

public sealed class ImportRow : ITenantOwned
{
    public Guid Id { get; set; }
    public Guid ImportJobId { get; set; }
    public Guid InstitutionId { get; set; }
    public int RowNo { get; set; }
    public QuestionDraft Draft { get; set; } = new();
    public ImportRowStatus Status { get; set; }
    public List<ImportMessage> Messages { get; set; } = [];

    /// <summary>The status the validator produced, kept so "include" can restore it after "exclude".</summary>
    public ImportRowStatus ValidatedStatus { get; set; }

    public Guid? DuplicateOfQuestionId { get; set; }
    public Guid? CreatedQuestionId { get; set; }

    public static ImportRowStatus StatusFor(IReadOnlyCollection<ImportMessage> messages, bool duplicate) =>
        messages.Any(m => m.Severity == MessageSeverity.Error) ? ImportRowStatus.Error
        : duplicate ? ImportRowStatus.Duplicate
        : messages.Count > 0 ? ImportRowStatus.Warning
        : ImportRowStatus.Ok;
}

public static class ImportLimits
{
    public const int MaxQuestions = 5_000;
    public const long MaxFileBytes = 20L * 1024 * 1024;
    public const int MaxPasteChars = 2_000_000;
    public const int CommitBatchSize = 200;
    public static readonly TimeSpan RollbackWindow = TimeSpan.FromDays(7);
}

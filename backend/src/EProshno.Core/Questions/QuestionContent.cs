using EProshno.Core.Content;

namespace EProshno.Core.Questions;

/// <summary>
/// The editable content of a question, shared by the admin editor, custom-bank editor and import commit, so all
/// three follow identical validation. Rich text fields are TipTap JSON strings.
/// </summary>
public sealed record QuestionContent
{
    public QuestionType Type { get; init; }
    public McqKind? McqKind { get; init; }
    public Guid SubjectId { get; init; }
    public Guid ChapterId { get; init; }
    public Guid? TopicId { get; init; }
    public string Stem { get; init; } = RichContent.EmptyDoc;

    /// <summary>উদ্দীপক for CQ, or the shared information when starting a new CommonInfo group.</summary>
    public string? Stimulus { get; init; }

    /// <summary>Joins an existing CommonInfo group instead of creating a new stimulus.</summary>
    public Guid? StimulusId { get; init; }

    public List<OptionContent> Options { get; init; } = [];
    public List<CqPartContent> CqParts { get; init; } = [];
    public string? Explanation { get; init; }
    public byte Difficulty { get; init; } = 2;
    public byte Importance { get; init; }
    public bool IsMath { get; init; }
    public bool IsCommon { get; init; }
    public List<AppearanceContent> Appearances { get; init; } = [];
    public List<Guid> TagIds { get; init; } = [];
}

public sealed record OptionContent(string Content, bool IsCorrect);

public sealed record CqPartContent(string Prompt, decimal Marks, string? Answer);

public sealed record AppearanceContent(ExamSource Source, Guid? BoardId, string? SchoolName, int Year);

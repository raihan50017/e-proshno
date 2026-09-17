using EProshno.Core.Common;
using EProshno.Core.Papers;
using EProshno.Core.Questions;

namespace EProshno.Core.Sets;

public enum SetMode
{
    Manual,
    Unique,
    Common,
}

/// <summary>Where the picker takes questions from.</summary>
public enum QuestionSource
{
    Platform,
    MyBanks,
    Both,
}

public sealed class QuestionSet : ITenantOwned
{
    public Guid Id { get; set; }
    public Guid InstitutionId { get; set; }
    public Guid CreatedById { get; set; }
    public string Title { get; set; } = "";
    public Guid LevelId { get; set; }
    public Guid SubjectId { get; set; }
    public Guid[] ChapterIds { get; set; } = [];
    public QuestionType Type { get; set; }
    public SetMode Mode { get; set; }
    public QuestionSource Source { get; set; }
    public Guid[] BankIds { get; set; } = [];
    public int TargetCount { get; set; }
    public int DurationMin { get; set; }
    public decimal FullMarks { get; set; }
    public PaperSettings Settings { get; set; } = new();

    /// <summary>Incremented whenever items change; part of the PDF cache key.</summary>
    public int ItemsVersion { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public List<QuestionSetItem> Items { get; set; } = [];
}

public sealed class QuestionSetItem
{
    public Guid SetId { get; set; }
    public Guid QuestionId { get; set; }
    public int Position { get; set; }
    public decimal Marks { get; set; }

    public Question? Question { get; set; }
}

/// <summary>Which questions an institution has already used; drives unique mode.</summary>
public sealed class QuestionUsage : ITenantOwned
{
    public Guid InstitutionId { get; set; }
    public Guid QuestionId { get; set; }
    public Guid SetId { get; set; }
    public DateTimeOffset UsedAt { get; set; }
}

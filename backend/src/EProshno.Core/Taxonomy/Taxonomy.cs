namespace EProshno.Core.Taxonomy;

public sealed class Level
{
    public Guid Id { get; set; }
    public string Slug { get; set; } = "";
    public string NameBn { get; set; } = "";
    public int Sort { get; set; }
}

/// <summary>InstitutionId null = official syllabus; set = that institution's custom syllabus.</summary>
public sealed class Subject
{
    public Guid Id { get; set; }
    public Guid LevelId { get; set; }
    public Guid? InstitutionId { get; set; }
    public string NameBn { get; set; } = "";
    public string? Code { get; set; }

    /// <summary>1 or 2 for "১ম/২য় পত্র"; null when the subject has a single paper.</summary>
    public int? Paper { get; set; }

    public int Sort { get; set; }

    public Level? Level { get; set; }
    public List<Chapter> Chapters { get; set; } = [];
}

public sealed class Chapter
{
    public Guid Id { get; set; }
    public Guid SubjectId { get; set; }
    public Guid? InstitutionId { get; set; }
    public int Number { get; set; }
    public string NameBn { get; set; } = "";

    public Subject? Subject { get; set; }
    public List<Topic> Topics { get; set; } = [];
}

public sealed class Topic
{
    public Guid Id { get; set; }
    public Guid ChapterId { get; set; }
    public Guid? InstitutionId { get; set; }
    public string NameBn { get; set; } = "";
    public int Sort { get; set; }
}

public sealed class Board
{
    public Guid Id { get; set; }
    public string Code { get; set; } = "";
    public string NameBn { get; set; } = "";
    public string NameEn { get; set; } = "";

    /// <summary>Short Bangla label used in tags, e.g. ঢা, রা, য.</summary>
    public string ShortBn { get; set; } = "";

    public int Sort { get; set; }
}

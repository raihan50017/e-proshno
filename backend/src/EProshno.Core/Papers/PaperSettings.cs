using EProshno.Core.Common;

namespace EProshno.Core.Papers;

public enum PaperSize
{
    A4,
    Letter,
    Legal,
    A5,
}

public enum TextAlignMode
{
    Left,
    Justify,
    Center,
}

public enum PaperFont
{
    NotoSerifBengali,
    HindSiliguri,
    TiroBangla,
}

public enum OptionLayout
{
    Auto,
    Inline,
    Grid2,
    Stack,
}

public enum OptionLabel
{
    Paren,
    Circled,
    Dot,
}

public enum AnswerKeyMode
{
    None,
    Appendix,
    Separate,
}

/// <summary>
/// Layout options stored as jsonb on QuestionSet.Settings (and as institution defaults). Missing JSON properties fall
/// back to these defaults, so adding a setting never needs a data migration.
/// </summary>
public sealed record PaperSettings
{
    public PaperSize PaperSize { get; init; } = PaperSize.A4;
    public PaperMargins MarginsMm { get; init; } = new(12, 12, 12, 12);
    public int Columns { get; init; } = 2;
    public TextAlignMode TextAlign { get; init; } = TextAlignMode.Left;
    public PaperFont FontFamily { get; init; } = PaperFont.NotoSerifBengali;
    public decimal FontSizePt { get; init; } = 11m;
    public decimal LineHeight { get; init; } = 1.35m;
    public OptionLayout OptionLayout { get; init; } = OptionLayout.Auto;
    public OptionLabel OptionLabel { get; init; } = OptionLabel.Paren;
    public bool PageNumbers { get; init; } = true;
    public string? Watermark { get; init; }
    public PaperHeader Header { get; init; } = new();
    public bool ShowBoardTags { get; init; }
    public bool MarkImportant { get; init; }
    public AnswerKeyMode AnswerKey { get; init; } = AnswerKeyMode.None;
    public bool TeacherCopy { get; init; }
    public bool AttachOmr { get; init; }
    public int Variants { get; init; } = 1;
    public bool ShuffleQuestions { get; init; }
    public bool ShuffleOptions { get; init; }
    public uint Seed { get; init; }
}

public sealed record PaperMargins(decimal Top, decimal Right, decimal Bottom, decimal Left);

public sealed record PaperHeader
{
    public bool Institution { get; init; } = true;
    public bool Level { get; init; } = true;
    public bool Subject { get; init; } = true;
    public bool Chapter { get; init; } = true;
    public bool SetCodeBox { get; init; }
    public bool StudentInfoBox { get; init; }
    public string Instructions { get; init; } = Messages.DefaultInstructions;
}

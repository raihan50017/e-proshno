using EProshno.Core.Content;
using EProshno.Core.Text;

namespace EProshno.Core.Questions;

public static class QuestionRules
{
    public const int OptionCount = 4;
    public const int CqPartCount = 4;
    public const int MaxBoardTagsShown = 3;
    public static readonly decimal[] DefaultCqMarks = [1m, 2m, 3m, 4m];
    public static readonly string[] OptionLabels = ["ক", "খ", "গ", "ঘ"];

    /// <summary>Normalised searchable text: stimulus + stem + options + CQ prompts.</summary>
    public static string SearchText(string? stimulus, string stem, IEnumerable<string> optionOrPartContents)
    {
        var parts = new List<string> { RichContent.ToPlainText(stimulus), RichContent.ToPlainText(stem) };
        parts.AddRange(optionOrPartContents.Select(RichContent.ToPlainText));
        return BanglaText.Normalize(string.Join(' ', parts.Where(p => p.Length > 0)));
    }

    /// <summary>Recomputes derived fields (StemText, ContentHash, HasImage) after content changes.</summary>
    public static void Derive(Question q, string? stimulusContent)
    {
        IEnumerable<string> children = q.Type == QuestionType.Cq
            ? q.CqParts.OrderBy(p => p.Part).Select(p => p.Prompt)
            : q.Options.OrderBy(o => o.Index).Select(o => o.Content);
        var childList = children.ToList();

        q.StemText = SearchText(stimulusContent, q.Stem, childList);
        q.ContentHash = HashFor(q.Type, q.StemText);
        q.HasImage = RichContent.HasImage(q.Stem)
            || RichContent.HasImage(stimulusContent)
            || childList.Any(RichContent.HasImage);
    }

    /// <summary>The ContentHash a question with this content would get (same inputs as <see cref="Derive"/>).</summary>
    public static string Fingerprint(QuestionContent c)
    {
        IEnumerable<string> children = c.Type == QuestionType.Cq
            ? c.CqParts.Select(p => p.Prompt)
            : c.Options.Select(o => o.Content);
        return HashFor(c.Type, SearchText(c.Stimulus, c.Stem, children));
    }

    private static string HashFor(QuestionType type, string stemText) => BanglaText.Hash(type + "|" + stemText);

    /// <summary>"ঢা বো '২১" — board short name + বো + two-digit year in Bangla digits.</summary>
    public static string BoardTag(string boardShortBn, int year) =>
        $"{boardShortBn} বো '{BanglaText.ToBanglaDigits((year % 100).ToString("00", System.Globalization.CultureInfo.InvariantCulture))}";

    /// <summary>"Repeated board question" = two or more board appearances.</summary>
    public static bool IsRepeatedBoard(IEnumerable<QuestionAppearance> appearances) =>
        appearances.Count(a => a.Source == ExamSource.Board) >= 2;

    public static bool CanTransition(ContentStatus from, ContentStatus to) => (from, to) switch
    {
        (ContentStatus.Draft, ContentStatus.InReview) => true,
        (ContentStatus.InReview, ContentStatus.Published) => true,
        (ContentStatus.InReview, ContentStatus.Draft) => true,        // rejected with a note
        (ContentStatus.PendingApproval, ContentStatus.Published) => true,
        (ContentStatus.PendingApproval, ContentStatus.Draft) => true,
        (ContentStatus.Published, ContentStatus.Archived) => true,
        (ContentStatus.Archived, ContentStatus.Published) => true,
        (ContentStatus.Draft, ContentStatus.Archived) => true,
        _ => false,
    };
}

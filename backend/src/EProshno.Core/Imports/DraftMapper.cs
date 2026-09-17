using EProshno.Core.Content;
using EProshno.Core.Questions;

namespace EProshno.Core.Imports;

/// <summary>Turns a parsed draft (plain text with $…$ math) into editor content, and back for exports.</summary>
public static class DraftMapper
{
    public static QuestionContent ToContent(QuestionDraft d, ImportDefaults defaults)
    {
        var stem = d.Type == QuestionType.Mcq && d.Statements.Count > 0
            ? RichContent.FromStatements(d.Stem, d.Statements, d.StemTail)
            : RichContent.FromText(JoinLines(d.Stem, d.StemTail));

        var texts = new List<string?> { d.Stem, d.StemTail, d.Stimulus, d.Explanation };
        texts.AddRange(d.Statements);
        texts.AddRange(d.Options);
        texts.AddRange(d.CqParts.Select(p => p.Prompt));

        return new QuestionContent
        {
            Type = d.Type,
            McqKind = d.Type == QuestionType.Mcq ? d.McqKind ?? McqKind.Simple : null,
            SubjectId = defaults.SubjectId,
            ChapterId = d.ChapterId ?? defaults.ChapterId ?? Guid.Empty,
            TopicId = d.TopicId,
            Stem = stem,
            Stimulus = string.IsNullOrWhiteSpace(d.Stimulus) ? null : RichContent.FromText(d.Stimulus),
            Options = d.Type == QuestionType.Mcq
                ? d.Options.Select((o, i) => new OptionContent(RichContent.FromText(o), i == d.CorrectIndex)).ToList()
                : [],
            CqParts = d.Type == QuestionType.Cq
                ? d.CqParts.Select((p, i) => new CqPartContent(
                    RichContent.FromText(p.Prompt),
                    p.Marks ?? QuestionRules.DefaultCqMarks[Math.Min(i, QuestionRules.CqPartCount - 1)],
                    string.IsNullOrWhiteSpace(p.Answer) ? null : RichContent.FromText(p.Answer))).ToList()
                : [],
            Explanation = string.IsNullOrWhiteSpace(d.Explanation) ? null : RichContent.FromText(d.Explanation),
            Difficulty = d.Difficulty ?? defaults.Difficulty,
            Importance = d.Importance ?? 0,
            IsMath = texts.Any(t => t is not null && t.Contains('$', StringComparison.Ordinal)),
            Appearances = d.BoardTags
                .Where(t => t.BoardId is not null && t.Year is not null)
                .Select(t => new AppearanceContent(ExamSource.Board, t.BoardId, null, t.Year!.Value))
                .ToList(),
        };
    }

    /// <summary>Export: a stored question back to a draft in the import text format.</summary>
    public static QuestionDraft ToDraft(QuestionContent c, string? chapterRef, string? topicRef, IReadOnlyList<string> boardTags, string? groupKey)
    {
        var stemText = RichContent.ToMarkupText(c.Stem);
        var (lead, statements, tail) = QuestionTextParser.SplitStatements(stemText);
        var isMulti = c.McqKind == McqKind.MultiCompletion && statements.Count > 0;
        var correct = c.Options.FindIndex(o => o.IsCorrect);

        return new QuestionDraft
        {
            Type = c.Type,
            McqKind = c.McqKind,
            GroupKey = groupKey,
            Stimulus = c.Stimulus is null ? null : RichContent.ToMarkupText(c.Stimulus),
            Stem = isMulti ? lead : stemText,
            Statements = isMulti ? statements : [],
            StemTail = isMulti ? tail : null,
            Options = c.Options.Select(o => RichContent.ToMarkupText(o.Content)).ToList(),
            CorrectRaw = correct >= 0 ? QuestionRules.OptionLabels[correct] : null,
            CorrectIndex = correct >= 0 ? correct : null,
            CqParts = c.CqParts.Select(p => new DraftCqPart
            {
                Prompt = RichContent.ToMarkupText(p.Prompt),
                Marks = p.Marks,
                Answer = p.Answer is null ? null : RichContent.ToMarkupText(p.Answer),
            }).ToList(),
            Explanation = c.Explanation is null ? null : RichContent.ToMarkupText(c.Explanation),
            ChapterRef = chapterRef,
            TopicRef = topicRef,
            Difficulty = c.Difficulty,
            Importance = c.Importance,
            BoardTags = boardTags.Select(t => new DraftBoardTag(t, null, null)).ToList(),
        };
    }

    private static string JoinLines(string? a, string? b) =>
        string.Join('\n', new[] { a, b }.Where(s => !string.IsNullOrWhiteSpace(s)));
}

using System.Text.RegularExpressions;
using EProshno.Core.Common;
using EProshno.Core.Questions;
using EProshno.Core.Text;

namespace EProshno.Core.Imports;

public sealed record CheckedDraft(QuestionDraft Draft, List<ImportMessage> Messages);

/// <summary>
/// Source-independent checks for parsed drafts (text, Excel, CSV): answer resolution, kind detection, default
/// marks and structural errors. Chapter matching and dedupe need the database and happen in Infrastructure.
/// </summary>
public static partial class DraftValidator
{
    public const int MinGroupSize = 2;
    public const int MaxGroupSize = 3;

    public static CheckedDraft Check(QuestionDraft draft)
    {
        var messages = new List<ImportMessage>();
        var d = draft.Type == QuestionType.Cq ? CheckCq(draft, messages) : CheckMcq(draft, messages);

        if (d.Difficulty is { } diff && diff is < 1 or > 3)
        {
            messages.Add(Warn("difficulty", "difficulty.range", Messages.DifficultyRange));
            d = d with { Difficulty = null };
        }

        if (d.Importance is { } imp && imp > 3)
        {
            messages.Add(Warn("importance", "importance.range", Messages.ImportanceRange));
            d = d with { Importance = null };
        }

        return new CheckedDraft(d, messages);
    }

    /// <summary>CommonInfo groups must have 2–3 questions; adds an error to every member of a bad group.</summary>
    public static void CheckGroups(IReadOnlyList<CheckedDraft> drafts)
    {
        foreach (var group in drafts.Where(d => d.Draft.GroupKey is not null).GroupBy(d => d.Draft.GroupKey))
        {
            var count = group.Count();
            if (count is < MinGroupSize or > MaxGroupSize)
            {
                foreach (var member in group)
                {
                    member.Messages.Add(Error("group", "group.size", Messages.CommonInfoGroupSize));
                }
            }
        }
    }

    private static QuestionDraft CheckMcq(QuestionDraft d, List<ImportMessage> messages)
    {
        var kind = d.GroupKey is not null ? McqKind.CommonInfo
            : d.Statements.Count > 0 ? McqKind.MultiCompletion
            : d.McqKind ?? McqKind.Simple;

        if (string.IsNullOrWhiteSpace(d.Stem) && d.Statements.Count == 0)
        {
            messages.Add(Error("stem", "stem.required", Messages.ParseEmptyStem));
        }

        if (kind == McqKind.CommonInfo && string.IsNullOrWhiteSpace(d.Stimulus))
        {
            messages.Add(Error("stimulus", "stimulus.required", Messages.StimulusRequired));
        }

        if (d.Options.Count != QuestionRules.OptionCount || d.Options.Any(string.IsNullOrWhiteSpace))
        {
            messages.Add(Error("options", "options.count", Messages.ParseNoOptions));
        }

        int? correct = null;
        if (string.IsNullOrWhiteSpace(d.CorrectRaw))
        {
            messages.Add(Error("correct", "answer.missing", Messages.ParseNoAnswer));
        }
        else
        {
            correct = ParseAnswerLetter(d.CorrectRaw);
            if (correct is null)
            {
                var wanted = BanglaText.Normalize(d.CorrectRaw);
                var match = d.Options.FindIndex(o => BanglaText.Normalize(o) == wanted);
                if (match >= 0)
                {
                    correct = match;
                    messages.Add(Warn("correct", "answer.text_match", Messages.ParseAnswerMatchedText));
                }
                else
                {
                    messages.Add(Error("correct", "answer.invalid", Messages.ParseBadAnswer));
                }
            }
        }

        return d with { Type = QuestionType.Mcq, McqKind = kind, CorrectIndex = correct, CqParts = [] };
    }

    private static QuestionDraft CheckCq(QuestionDraft d, List<ImportMessage> messages)
    {
        if (string.IsNullOrWhiteSpace(d.Stimulus))
        {
            messages.Add(Error("stimulus", "stimulus.required", Messages.ParseNoStimulus));
        }

        var parts = d.CqParts;
        if (parts.Count != QuestionRules.CqPartCount || parts.Any(p => string.IsNullOrWhiteSpace(p.Prompt)))
        {
            messages.Add(Error("cqParts", "parts.missing", Messages.ParseMissingParts));
        }

        if (parts.Any(p => p.Marks is null))
        {
            messages.Add(Warn("cqParts", "marks.defaulted", Messages.ParseMarksDefaulted));
            parts = parts.Select((p, i) => p.Marks is null
                ? p with { Marks = QuestionRules.DefaultCqMarks[Math.Min(i, QuestionRules.CqPartCount - 1)] }
                : p).ToList();
        }

        if (parts.Any(p => p.Marks is <= 0 or > 10))
        {
            messages.Add(Error("cqParts", "marks.range", Messages.CqPartMarks));
        }

        return d with { Type = QuestionType.Cq, McqKind = null, Options = [], CorrectIndex = null, CqParts = parts };
    }

    /// <summary>Accepts ক–ঘ, a–d, 1–4 (Bangla or English digits), optionally as "(ক)" or "ক." or "ক. text".</summary>
    public static int? ParseAnswerLetter(string raw)
    {
        var s = BanglaText.ToAsciiDigits(BanglaText.FoldForParsing(raw)).Trim();
        var m = AnswerLetter().Match(s);
        return m.Success ? LetterIndex(m.Groups["l"].Value[0]) : null;
    }

    public static int? LetterIndex(char c) => c switch
    {
        'ক' or 'a' or 'A' or '1' => 0,
        'খ' or 'b' or 'B' or '2' => 1,
        'গ' or 'c' or 'C' or '3' => 2,
        'ঘ' or 'd' or 'D' or '4' => 3,
        _ => null,
    };

    internal static ImportMessage Error(string field, string code, string message) =>
        new(field, code, message, MessageSeverity.Error);

    internal static ImportMessage Warn(string field, string code, string message) =>
        new(field, code, message, MessageSeverity.Warning);

    [GeneratedRegex(@"^\(?(?<l>[কখগঘa-dA-D1-4])\)?(?:[.)।]\s*.*)?$", RegexOptions.None, matchTimeoutMilliseconds: 200)]
    private static partial Regex AnswerLetter();
}

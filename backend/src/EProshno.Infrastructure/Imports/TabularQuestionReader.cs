using System.Globalization;
using System.Text.RegularExpressions;
using EProshno.Core.Common;
using EProshno.Core.Imports;
using EProshno.Core.Questions;
using EProshno.Core.Text;

namespace EProshno.Infrastructure.Imports;

public sealed record TabularRow(int RowNumber, IReadOnlyList<string> Cells, bool HasMergedCells);

/// <summary>A sheet (or CSV file) as plain strings. Row numbers are 1-based as the user sees them.</summary>
public sealed record TabularSheet(string Name, IReadOnlyList<TabularRow> Rows);

public sealed record TabularResult(
    List<CheckedDraft> Drafts,
    List<string> DetectedHeaders,
    List<string> MissingColumns)
{
    public bool NeedsMapping => MissingColumns.Count > 0;
}

/// <summary>Column keys and their accepted headers (Bangla template headers and English synonyms).</summary>
public static partial class ImportColumns
{
    public const string McqSheet = "বহুনির্বাচনি";
    public const string CqSheet = "সৃজনশীল";
    public const string HelpSheet = "নির্দেশনা";
    public const string ListSheet = "তালিকা";

    public static readonly IReadOnlyList<ColumnDef> Mcq =
    [
        new("mcq_kind", "ধরন", false, "kind", "type", "mcq kind"),
        new("group", "গ্রুপ", false, "group id"),
        new("stimulus", "উদ্দীপক", false, "অভিন্ন তথ্য", "common info", "passage"),
        new("stem", "প্রশ্ন", true, "question", "প্রশ্নের লেখা", "question text"),
        new("option_a", "ক", true, "a", "option a", "optiona", "অপশন ক"),
        new("option_b", "খ", true, "b", "option b", "optionb", "অপশন খ"),
        new("option_c", "গ", true, "c", "option c", "optionc", "অপশন গ"),
        new("option_d", "ঘ", true, "d", "option d", "optiond", "অপশন ঘ"),
        new("correct", "উত্তর", true, "answer", "correct", "ans", "সঠিক উত্তর", "correct answer"),
        new("explanation", "ব্যাখ্যা", false, "explanation", "solution"),
        new("chapter", BanglaWords.Chapter, false, "chapter", BanglaWords.Chapter + " নং"),
        new("topic", "টপিক", false, "topic"),
        new("difficulty", "কঠিনতা", false, "difficulty", "level"),
        new("importance", "গুরুত্ব", false, "importance", "stars"),
        new("board_tags", "বোর্ড ও সাল", false, "বোর্ড", "board", "boards", "board tags"),
        new("image", "ছবি", false, "image", "picture"),
    ];

    public static readonly IReadOnlyList<ColumnDef> Cq =
    [
        new("stimulus", "উদ্দীপক", true, "stimulus", "passage"),
        new("part_a", "ক", true, "a", "part a", "question a", "প্রশ্ন ক"),
        new("part_b", "খ", true, "b", "part b", "question b", "প্রশ্ন খ"),
        new("part_c", "গ", true, "c", "part c", "question c", "প্রশ্ন গ"),
        new("part_d", "ঘ", true, "d", "part d", "question d", "প্রশ্ন ঘ"),
        new("answer_a", "উত্তর ক", false, "answer a"),
        new("answer_b", "উত্তর খ", false, "answer b"),
        new("answer_c", "উত্তর গ", false, "answer c"),
        new("answer_d", "উত্তর ঘ", false, "answer d"),
        new("marks_a", "নম্বর ক", false, "marks a"),
        new("marks_b", "নম্বর খ", false, "marks b"),
        new("marks_c", "নম্বর গ", false, "marks c"),
        new("marks_d", "নম্বর ঘ", false, "marks d"),
        new("chapter", BanglaWords.Chapter, false, "chapter", BanglaWords.Chapter + " নং"),
        new("topic", "টপিক", false, "topic"),
        new("difficulty", "কঠিনতা", false, "difficulty", "level"),
        new("importance", "গুরুত্ব", false, "importance", "stars"),
        new("board_tags", "বোর্ড ও সাল", false, "বোর্ড", "board", "boards", "board tags"),
        new("image", "ছবি", false, "image", "picture"),
    ];

    public static IReadOnlyList<ColumnDef> For(QuestionType type) => type == QuestionType.Cq ? Cq : Mcq;

    /// <summary>fold + trim + lowercase; underscores, dashes and repeated spaces become one space.</summary>
    public static string NormalizeHeader(string header) =>
        Spaces().Replace(BanglaText.FoldForParsing(header).Replace('_', ' ').Replace('-', ' '), " ").Trim().ToLowerInvariant();

    [GeneratedRegex(@"\s+", RegexOptions.None, matchTimeoutMilliseconds: 200)]
    private static partial Regex Spaces();
}

public sealed record ColumnDef(string Key, string Header, bool Required, params string[] Synonyms)
{
    public IEnumerable<string> AllNames => Synonyms.Prepend(Header).Prepend(Key);
}

/// <summary>Maps spreadsheet rows (template or teacher's own layout + column map) to question drafts.</summary>
public static partial class TabularQuestionReader
{
    private const int HeaderSearchRows = 10;

    public static TabularResult Read(IReadOnlyList<TabularSheet> sheets, QuestionType defaultType, IReadOnlyDictionary<string, string> columnMap)
    {
        var targets = new List<(TabularSheet Sheet, QuestionType Type)>();
        foreach (var sheet in sheets)
        {
            var name = ImportColumns.NormalizeHeader(sheet.Name);
            if (name == ImportColumns.NormalizeHeader(ImportColumns.McqSheet))
            {
                targets.Add((sheet, QuestionType.Mcq));
            }
            else if (name == ImportColumns.NormalizeHeader(ImportColumns.CqSheet))
            {
                targets.Add((sheet, QuestionType.Cq));
            }
        }

        if (targets.Count == 0)
        {
            var first = sheets.FirstOrDefault(s => s.Rows.Any(r => r.Cells.Any(c => c.Length > 0)));
            if (first is not null)
            {
                targets.Add((first, defaultType == QuestionType.Cq ? QuestionType.Cq : QuestionType.Mcq));
            }
        }

        var drafts = new List<CheckedDraft>();
        foreach (var (sheet, type) in targets)
        {
            var headerRow = sheet.Rows.Take(HeaderSearchRows).FirstOrDefault(r => r.Cells.Count(c => c.Length > 0) >= 2);
            if (headerRow is null)
            {
                continue;
            }

            var headers = headerRow.Cells.ToList();
            var columns = ImportColumns.For(type);
            var map = MapColumns(headers, columns, columnMap);
            var missing = columns.Where(c => c.Required && !map.ContainsKey(c.Key)).Select(c => c.Key).ToList();
            if (missing.Count > 0)
            {
                return new TabularResult([], headers.Where(h => h.Length > 0).ToList(), missing);
            }

            var dataRows = sheet.Rows.Where(r => r.RowNumber > headerRow.RowNumber);
            drafts.AddRange(type == QuestionType.Cq
                ? ReadCq(sheet.Name, dataRows, map)
                : ReadMcq(sheet.Name, dataRows, map));
        }

        DraftValidator.CheckGroups(drafts);
        return new TabularResult(drafts, [], []);
    }

    private static Dictionary<string, int> MapColumns(
        List<string> headers, IReadOnlyList<ColumnDef> columns, IReadOnlyDictionary<string, string> columnMap)
    {
        var normalized = headers.Select(ImportColumns.NormalizeHeader).ToList();
        var map = new Dictionary<string, int>(StringComparer.Ordinal);

        // The teacher's explicit mapping wins.
        foreach (var (key, header) in columnMap)
        {
            var index = normalized.IndexOf(ImportColumns.NormalizeHeader(header));
            if (index >= 0 && columns.Any(c => c.Key == key))
            {
                map[key] = index;
            }
        }

        foreach (var column in columns.Where(c => !map.ContainsKey(c.Key)))
        {
            var names = column.AllNames.Select(ImportColumns.NormalizeHeader).ToHashSet(StringComparer.Ordinal);
            for (var i = 0; i < normalized.Count; i++)
            {
                if (normalized[i].Length > 0 && names.Contains(normalized[i]) && !map.ContainsValue(i))
                {
                    map[column.Key] = i;
                    break;
                }
            }
        }

        return map;
    }

    private static IEnumerable<CheckedDraft> ReadMcq(string sheetName, IEnumerable<TabularRow> rows, Dictionary<string, int> map)
    {
        var groupStimulus = new Dictionary<string, string>(StringComparer.Ordinal);
        var result = new List<CheckedDraft>();
        foreach (var row in rows)
        {
            string Get(string key) => Cell(row, map, key);
            if (IsEmpty(row, map))
            {
                continue;
            }

            var kind = ParseKind(Get("mcq_kind"));
            var group = Get("group");
            var groupKey = group.Length > 0 ? "x:" + BanglaText.Normalize(group)
                : kind == McqKind.CommonInfo ? $"row:{row.RowNumber}"
                : null;

            var stimulus = Get("stimulus");
            if (groupKey is not null)
            {
                if (stimulus.Length > 0)
                {
                    groupStimulus.TryAdd(groupKey, stimulus);
                }
                else if (groupStimulus.TryGetValue(groupKey, out var shared))
                {
                    stimulus = shared;
                }
            }

            var (lead, statements, tail) = QuestionTextParser.SplitStatements(Get("stem"));
            var draft = new QuestionDraft
            {
                Type = QuestionType.Mcq,
                McqKind = kind,
                GroupKey = groupKey,
                Stimulus = stimulus.Length > 0 ? stimulus : null,
                Stem = statements.Count > 0 ? lead : Get("stem"),
                Statements = statements,
                StemTail = statements.Count > 0 ? tail : null,
                Options = [Get("option_a"), Get("option_b"), Get("option_c"), Get("option_d")],
                CorrectRaw = NullIfEmpty(Get("correct")),
                Explanation = NullIfEmpty(Get("explanation")),
                ChapterRef = NullIfEmpty(Get("chapter")),
                TopicRef = NullIfEmpty(Get("topic")),
                Difficulty = ParseLevel(Get("difficulty")),
                Importance = ParseLevel(Get("importance")),
                BoardTags = QuestionTextParser.ParseBoardTags(Get("board_tags")),
                SourceLocation = Location(sheetName, row.RowNumber),
            };

            result.Add(Finish(draft, row, Get("image")));
        }

        // A stimulus written only on a later row of the group still applies to the earlier rows.
        return result.Select(cd => cd.Draft is { GroupKey: { } key, Stimulus: null } && groupStimulus.TryGetValue(key, out var s)
            ? Recheck(cd, cd.Draft with { Stimulus = s })
            : cd);
    }

    private static IEnumerable<CheckedDraft> ReadCq(string sheetName, IEnumerable<TabularRow> rows, Dictionary<string, int> map)
    {
        foreach (var row in rows)
        {
            string Get(string key) => Cell(row, map, key);
            if (IsEmpty(row, map))
            {
                continue;
            }

            var parts = new List<DraftCqPart>();
            foreach (var letter in new[] { "a", "b", "c", "d" })
            {
                parts.Add(new DraftCqPart
                {
                    Prompt = Get($"part_{letter}"),
                    Answer = NullIfEmpty(Get($"answer_{letter}")),
                    Marks = ParseMarks(Get($"marks_{letter}")),
                });
            }

            var draft = new QuestionDraft
            {
                Type = QuestionType.Cq,
                Stimulus = NullIfEmpty(Get("stimulus")),
                CqParts = parts,
                ChapterRef = NullIfEmpty(Get("chapter")),
                TopicRef = NullIfEmpty(Get("topic")),
                Difficulty = ParseLevel(Get("difficulty")),
                Importance = ParseLevel(Get("importance")),
                BoardTags = QuestionTextParser.ParseBoardTags(Get("board_tags")),
                SourceLocation = Location(sheetName, row.RowNumber),
            };

            yield return Finish(draft, row, Get("image"));
        }
    }

    private static CheckedDraft Finish(QuestionDraft draft, TabularRow row, string image)
    {
        var checkedDraft = DraftValidator.Check(draft);
        if (row.HasMergedCells)
        {
            checkedDraft.Messages.Add(new ImportMessage("row", "row.merged", Messages.ImportMergedCells, MessageSeverity.Error));
        }

        if (image.Length > 0 && !image.StartsWith("[", StringComparison.Ordinal))
        {
            checkedDraft.Messages.Add(new ImportMessage("image", "image.ignored", Messages.ImportImageIgnored, MessageSeverity.Warning));
        }

        return checkedDraft;
    }

    private static CheckedDraft Recheck(CheckedDraft original, QuestionDraft updated)
    {
        var rechecked = DraftValidator.Check(updated);
        rechecked.Messages.AddRange(original.Messages.Where(m => m.Code is "row.merged" or "image.ignored" or "group.size"));
        return rechecked;
    }

    private static string Cell(TabularRow row, Dictionary<string, int> map, string key) =>
        map.TryGetValue(key, out var index) && index < row.Cells.Count ? row.Cells[index].Trim() : "";

    private static bool IsEmpty(TabularRow row, Dictionary<string, int> map) =>
        map.Values.All(i => i >= row.Cells.Count || string.IsNullOrWhiteSpace(row.Cells[i]));

    private static string Location(string sheet, int row) =>
        $"শিট {sheet}, সারি {BanglaText.ToBanglaDigits(row)}";

    private static string? NullIfEmpty(string value) => value.Length == 0 ? null : value;

    private static McqKind? ParseKind(string value)
    {
        var v = ImportColumns.NormalizeHeader(value);
        if (v.Length == 0)
        {
            return null;
        }

        if (v.StartsWith("বহুপদী", StringComparison.Ordinal) || v.StartsWith("multi", StringComparison.Ordinal))
        {
            return McqKind.MultiCompletion;
        }

        if (v.StartsWith("অভিন্ন", StringComparison.Ordinal) || v.StartsWith("common", StringComparison.Ordinal))
        {
            return McqKind.CommonInfo;
        }

        return McqKind.Simple;
    }

    private static byte? ParseLevel(string value)
    {
        var v = BanglaText.ToAsciiDigits(value).Trim();
        if (v.Length == 0)
        {
            return null;
        }

        if (decimal.TryParse(v, NumberStyles.Number, CultureInfo.InvariantCulture, out var d) && d is >= 0 and <= 255)
        {
            return (byte)d;
        }

        switch (ImportColumns.NormalizeHeader(v))
        {
            case "সহজ" or "easy":
                return 1;
            case "মধ্যম" or "medium":
                return 2;
            case "কঠিন" or "hard":
                return 3;
        }

        var stars = v.Count(c => c is '★' or '*');
        return stars > 0 ? (byte)Math.Min(stars, 3) : null;
    }

    private static decimal? ParseMarks(string value)
    {
        var v = BanglaText.ToAsciiDigits(value).Trim();
        return decimal.TryParse(v, NumberStyles.Number, CultureInfo.InvariantCulture, out var d) ? d : null;
    }
}

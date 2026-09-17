using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using EProshno.Core.Questions;
using EProshno.Core.Text;

namespace EProshno.Core.Imports;

/// <summary>
/// Parses the teacher text format (paste box and Word text) into question drafts. See the question-import skill
/// for the line rules. Input and keyword patterns both go through <see cref="BanglaText.FoldForParsing"/> so that
/// decomposed and precomposed letters match.
/// </summary>
public sealed class QuestionTextParser
{
    private static readonly TimeSpan RegexTimeout = TimeSpan.FromMilliseconds(200);

    // অধ্যায় contains YYA; build it from code points (never type nukta letters literally).
    private static readonly string ChapterWord = BanglaText.S(0x0985, 0x09A7, 0x09CD, 0x09AF, 0x09BE, 0x09DF);

    // Meta keys compared against the folded input, so fold them the same way.
    private static readonly string KeyExplanation = BanglaText.FoldForParsing("ব্যাখ্যা");
    private static readonly string KeyBoard = BanglaText.FoldForParsing("বোর্ড");
    private static readonly string KeyDifficulty = BanglaText.FoldForParsing("কঠিনতা");
    private static readonly string KeyImportance = BanglaText.FoldForParsing("গুরুত্ব");
    private static readonly string KeyTopic = BanglaText.FoldForParsing("টপিক");

    private static readonly Regex GroupEnd = R(@"^-{3,}$");
    private static readonly Regex GroupStart = R(@"^অভিন্ন\s*তথ্য(?:ভিত্তিক)?(?:\s*প্রশ্ন)?\s*[:：]?\s*(?<rest>.*)$");
    private static readonly Regex CqStart = R(@"^সৃজনশীল(?:\s*প্রশ্ন)?\s*(?:নং)?\s*(?<n>[0-9০-৯]{1,4})?\s*[.।:)]?\s*(?<rest>.*)$");
    private static readonly Regex StimulusLine = R(@"^উদ্দীপক\s*[:：]\s*(?<rest>.*)$");
    private static readonly Regex McqStart = R(@"^(?:প্রশ্ন\s*(?:নং)?\s*)?(?<n>[0-9০-৯]{1,4})\s*[.।)]\s*(?<rest>.*)$");
    private static readonly Regex AnswerLine = R(@"^(?:উত্তর\s*(?<part>[কখগঘ])?\s*[:：]|উঃ\s*[:：]?|ans(?:wer)?\s*[:：.])\s*(?<rest>.*)$");
    private static readonly Regex MetaLine = R(@"^(?<key>ব্যাখ্যা|বোর্ড|কঠিনতা|গুরুত্ব|টপিক|" + ChapterWord + @")\s*[:：]\s*(?<rest>.*)$");
    private static readonly Regex OptionStart = R(@"^(?:\((?<l>[কখগঘa-dA-D])\)|(?<l>[কখগঘa-dA-D])[.)])\s*");
    private static readonly Regex OptionAnywhere = R(@"(?<=^|\s)(?:\((?<l>[কখগঘa-dA-D])\)|(?<l>[কখগঘa-dA-D])[.)])\s*");
    private static readonly Regex StatementLine = R(@"^\(?(?<r>iii|ii|iv|i)[.)]\s*(?<rest>.*)$");
    private static readonly Regex TrailingMarks = R(@"\[\s*(?<m>[0-9০-৯]+(?:\.[0-9০-৯]+)?)\s*\]\s*$");
    private static readonly Regex BoardTag = R(@"^(?<name>.+?)\s*(?:বো(?:র্ড)?)?\s*'?\s*(?<y>[0-9০-৯]{2,4})$");

    private readonly List<Builder> _done = [];
    private Builder? _current;
    private Field _field;
    private int _fieldIndex;
    private GroupState? _group;
    private int _groupCount;
    private string? _chapterRef;
    private int _lastMcqNumber;

    public static List<CheckedDraft> Parse(string text)
    {
        var parser = new QuestionTextParser();
        var lines = BanglaText.FoldForParsing(text).Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n');
        for (var i = 0; i < lines.Length; i++)
        {
            parser.Line(lines[i].Trim(), i + 1);
        }

        parser.Finish();

        var result = parser._done.Select(b => b.Build()).ToList();
        DraftValidator.CheckGroups(result);
        return result;
    }

    private void Line(string line, int lineNo)
    {
        if (line.Length == 0)
        {
            return;
        }

        Match m;
        if (GroupEnd.IsMatch(line))
        {
            Flush();
            _group = null;
            return;
        }

        if ((m = GroupStart.Match(line)).Success)
        {
            Flush();
            _groupCount++;
            _group = new GroupState($"g{_groupCount}");
            _field = Field.GroupStimulus;
            Append(m.Groups["rest"].Value);
            return;
        }

        if ((m = CqStart.Match(line)).Success)
        {
            Start(QuestionType.Cq, lineNo);
            _group = null;
            _field = Field.Stimulus;
            Append(m.Groups["rest"].Value);
            return;
        }

        if ((m = StimulusLine.Match(line)).Success && _current is { Type: QuestionType.Cq })
        {
            _field = Field.Stimulus;
            Append(m.Groups["rest"].Value);
            return;
        }

        if ((m = McqStart.Match(line)).Success)
        {
            var number = int.Parse(BanglaText.ToAsciiDigits(m.Groups["n"].Value), CultureInfo.InvariantCulture);
            Start(QuestionType.Mcq, lineNo);
            if (_lastMcqNumber > 0 && number != _lastMcqNumber + 1)
            {
                _current!.Messages.Add(DraftValidator.Warn("stem", "numbering.gap", Common.Messages.ParseNumberGap));
            }

            _lastMcqNumber = number;
            _field = Field.Stem;
            Append(m.Groups["rest"].Value);
            return;
        }

        if (_current is null)
        {
            if (_group is not null && _field == Field.GroupStimulus)
            {
                Append(line);
            }

            return;   // headings or notes before the first question are ignored
        }

        if ((m = AnswerLine.Match(line)).Success)
        {
            var rest = m.Groups["rest"].Value.Trim();
            if (_current.Type == QuestionType.Cq)
            {
                var part = m.Groups["part"].Success ? DraftValidator.LetterIndex(m.Groups["part"].Value[0]) : null;
                if (part is { } p)
                {
                    _field = Field.PartAnswer;
                    _fieldIndex = p;
                    Append(rest);
                }
            }
            else
            {
                _current.CorrectRaw = rest;
                _field = Field.None;
            }

            return;
        }

        if ((m = MetaLine.Match(line)).Success)
        {
            Meta(m.Groups["key"].Value, m.Groups["rest"].Value.Trim());
            return;
        }

        if (OptionStart.IsMatch(line))
        {
            Options(line);
            return;
        }

        if (_current.Type == QuestionType.Mcq && _current.Options.Count == 0 && (m = StatementLine.Match(line)).Success)
        {
            _current.Statements.Add(new StringBuilder(m.Groups["rest"].Value.Trim()));
            _field = Field.Statement;
            return;
        }

        if (_field == Field.Statement)
        {
            // Statements are single-line; the next plain line is the lead ("নিচের কোনটি সঠিক?").
            _field = Field.StemTail;
        }

        Append(line);
    }

    private void Start(QuestionType type, int lineNo)
    {
        Flush();
        _current = new Builder(type, $"লাইন {BanglaText.ToBanglaDigits(lineNo)}")
        {
            ChapterRef = _chapterRef,
            GroupKey = type == QuestionType.Mcq ? _group?.Key : null,
            GroupStimulus = type == QuestionType.Mcq ? _group?.Stimulus : null,
        };
    }

    private void Flush()
    {
        if (_current is not null)
        {
            _done.Add(_current);
        }

        _current = null;
        _field = _group is not null ? Field.GroupStimulus : Field.None;
    }

    private void Finish() => Flush();

    private void Options(string line)
    {
        var markers = OptionAnywhere.Matches(line);
        var accepted = new List<(int Letter, int Start, int TextStart)>();
        int? expected = null;
        foreach (Match marker in markers)
        {
            var letter = DraftValidator.LetterIndex(marker.Groups["l"].Value[0])!.Value;
            if (expected is null || letter == expected)
            {
                accepted.Add((letter, marker.Index, marker.Index + marker.Length));
                expected = letter + 1;
            }
        }

        for (var i = 0; i < accepted.Count; i++)
        {
            var end = i + 1 < accepted.Count ? accepted[i + 1].Start : line.Length;
            var text = line[accepted[i].TextStart..end].Trim();
            SetChild(accepted[i].Letter, text);
        }
    }

    private void SetChild(int index, string text)
    {
        _fieldIndex = index;
        if (_current!.Type == QuestionType.Cq)
        {
            _field = Field.Part;
            var part = _current.Part(index);
            var marks = TrailingMarks.Match(text);
            if (marks.Success)
            {
                part.Marks = decimal.Parse(BanglaText.ToAsciiDigits(marks.Groups["m"].Value), CultureInfo.InvariantCulture);
                text = text[..marks.Index].Trim();
            }

            part.Prompt.Clear().Append(text);
        }
        else
        {
            _field = Field.Option;
            while (_current.Options.Count <= index)
            {
                _current.Options.Add(new StringBuilder());
            }

            _current.Options[index].Clear().Append(text);
        }
    }

    private void Meta(string key, string value)
    {
        if (key == ChapterWord)
        {
            _chapterRef = value.Length > 0 ? value : null;
            return;
        }

        var current = _current!;
        _field = Field.None;
        if (key == KeyExplanation)
        {
            _field = Field.Explanation;
            Append(value);
        }
        else if (key == KeyBoard)
        {
            current.BoardTags.AddRange(ParseBoardTags(value));
        }
        else if (key == KeyDifficulty)
        {
            current.Difficulty = ParseLevel(value);
        }
        else if (key == KeyImportance)
        {
            current.Importance = ParseLevel(value);
        }
        else if (key == KeyTopic)
        {
            current.TopicRef = value;
        }
    }

    private void Append(string text)
    {
        text = text.Trim();
        if (text.Length == 0)
        {
            return;
        }

        switch (_field)
        {
            case Field.GroupStimulus when _group is not null:
                AppendLine(_group.Stimulus, text);
                break;
            case Field.Stem:
                AppendLine(_current!.Stem, text);
                break;
            case Field.StemTail:
                AppendLine(_current!.StemTail, text);
                break;
            case Field.Stimulus:
                AppendLine(_current!.Stimulus, text);
                break;
            case Field.Explanation:
                AppendLine(_current!.Explanation, text);
                break;
            case Field.Option:
                AppendSpace(_current!.Options[_fieldIndex], text);
                break;
            case Field.Statement:
                AppendSpace(_current!.Statements[^1], text);
                break;
            case Field.Part:
                AppendSpace(_current!.Part(_fieldIndex).Prompt, text);
                break;
            case Field.PartAnswer:
                AppendLine(_current!.Part(_fieldIndex).Answer, text);
                break;
            default:
                _current?.Messages.Add(DraftValidator.Warn("stem", "line.orphan", Common.Messages.ParseOrphanLine));
                break;
        }
    }

    private static void AppendLine(StringBuilder sb, string text)
    {
        if (sb.Length > 0)
        {
            sb.Append('\n');
        }

        sb.Append(text);
    }

    private static void AppendSpace(StringBuilder sb, string text)
    {
        if (sb.Length > 0)
        {
            sb.Append(' ');
        }

        sb.Append(text);
    }

    /// <summary>
    /// Splits a multi-line stem into lead lines, <c>i.</c>/<c>ii.</c> statements and the tail after them
    /// (spreadsheet cells keep বহুপদী statements inside the stem).
    /// </summary>
    public static (string Lead, List<string> Statements, string? Tail) SplitStatements(string stem)
    {
        var lead = new List<string>();
        var statements = new List<string>();
        var tail = new List<string>();
        foreach (var raw in BanglaText.FoldForParsing(stem).Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n'))
        {
            var line = raw.Trim();
            if (line.Length == 0)
            {
                continue;
            }

            var m = StatementLine.Match(line);
            if (m.Success && tail.Count == 0)
            {
                statements.Add(m.Groups["rest"].Value.Trim());
            }
            else if (statements.Count == 0)
            {
                lead.Add(line);
            }
            else
            {
                tail.Add(line);
            }
        }

        return (string.Join('\n', lead), statements, tail.Count > 0 ? string.Join('\n', tail) : null);
    }

    /// <summary>"ঢা ২০২৩; রা ২০২২" or "ঢা বো '২৩, Dhaka 2023".</summary>
    public static List<DraftBoardTag> ParseBoardTags(string value)
    {
        var tags = new List<DraftBoardTag>();
        foreach (var raw in value.Split([';', ',', '،'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var m = BoardTag.Match(raw);
            int? year = null;
            if (m.Success)
            {
                var y = int.Parse(BanglaText.ToAsciiDigits(m.Groups["y"].Value), CultureInfo.InvariantCulture);
                year = y < 100 ? 2000 + y : y;
            }

            tags.Add(new DraftBoardTag(raw, null, year));
        }

        return tags;
    }

    /// <summary>Board name part of a raw tag ("ঢা বো '২৩" → "ঢা").</summary>
    public static string BoardName(string raw)
    {
        var m = BoardTag.Match(raw);
        return (m.Success ? m.Groups["name"].Value : raw).Trim().TrimEnd('\'').Trim();
    }

    private static byte? ParseLevel(string value)
    {
        var v = BanglaText.ToAsciiDigits(value).Trim();
        if (byte.TryParse(v, NumberStyles.None, CultureInfo.InvariantCulture, out var b))
        {
            return b;
        }

        var stars = v.Count(c => c is '★' or '*');
        if (stars > 0)
        {
            return (byte)Math.Min(stars, 3);
        }

        return v switch
        {
            "সহজ" or "easy" => 1,
            "মধ্যম" or "medium" => 2,
            "কঠিন" or "hard" => 3,
            _ => null,
        };
    }

    private static Regex R(string pattern) =>
        new(BanglaText.FoldForParsing(pattern), RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, RegexTimeout);

    private enum Field
    {
        None,
        GroupStimulus,
        Stem,
        StemTail,
        Statement,
        Stimulus,
        Option,
        Part,
        PartAnswer,
        Explanation,
    }

    private sealed class GroupState(string key)
    {
        public string Key { get; } = key;
        public StringBuilder Stimulus { get; } = new();
    }

    private sealed class PartBuilder
    {
        public StringBuilder Prompt { get; } = new();
        public StringBuilder Answer { get; } = new();
        public decimal? Marks { get; set; }
    }

    private sealed class Builder(QuestionType type, string location)
    {
        private readonly SortedDictionary<int, PartBuilder> _parts = [];

        public QuestionType Type { get; } = type;
        public string? GroupKey { get; init; }
        public StringBuilder? GroupStimulus { get; init; }
        public StringBuilder Stem { get; } = new();
        public StringBuilder StemTail { get; } = new();
        public StringBuilder Stimulus { get; } = new();
        public StringBuilder Explanation { get; } = new();
        public List<StringBuilder> Statements { get; } = [];
        public List<StringBuilder> Options { get; } = [];
        public string? CorrectRaw { get; set; }
        public string? ChapterRef { get; init; }
        public string? TopicRef { get; set; }
        public byte? Difficulty { get; set; }
        public byte? Importance { get; set; }
        public List<DraftBoardTag> BoardTags { get; } = [];
        public List<ImportMessage> Messages { get; } = [];

        public PartBuilder Part(int index)
        {
            if (!_parts.TryGetValue(index, out var part))
            {
                part = new PartBuilder();
                _parts[index] = part;
            }

            return part;
        }

        public CheckedDraft Build()
        {
            var parts = new List<DraftCqPart>();
            if (_parts.Count > 0)
            {
                for (var i = 0; i <= _parts.Keys.Max(); i++)
                {
                    parts.Add(_parts.TryGetValue(i, out var p)
                        ? new DraftCqPart { Prompt = p.Prompt.ToString(), Marks = p.Marks, Answer = NullIfEmpty(p.Answer) }
                        : new DraftCqPart());
                }
            }

            var draft = new QuestionDraft
            {
                Type = Type,
                GroupKey = GroupKey,
                Stimulus = Type == QuestionType.Cq ? NullIfEmpty(Stimulus) : NullIfEmpty(GroupStimulus),
                Stem = Stem.ToString(),
                Statements = Statements.Select(s => s.ToString()).ToList(),
                StemTail = NullIfEmpty(StemTail),
                Options = Options.Select(o => o.ToString()).ToList(),
                CorrectRaw = CorrectRaw,
                CqParts = parts,
                Explanation = NullIfEmpty(Explanation),
                ChapterRef = ChapterRef,
                TopicRef = TopicRef,
                Difficulty = Difficulty,
                Importance = Importance,
                BoardTags = BoardTags,
                SourceLocation = location,
            };

            var checkedDraft = DraftValidator.Check(draft);
            checkedDraft.Messages.InsertRange(0, Messages);
            return checkedDraft;
        }

        private static string? NullIfEmpty(StringBuilder? sb) => sb is null || sb.Length == 0 ? null : sb.ToString();
    }
}

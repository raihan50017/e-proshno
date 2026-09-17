using ClosedXML.Excel;
using EProshno.Core.Imports;
using EProshno.Core.Questions;
using EProshno.Core.Text;

namespace EProshno.Infrastructure.Imports;

public sealed record TemplateChapter(int Number, string Name, IReadOnlyList<string> Topics)
{
    /// <summary>"১. ভৌতজগৎ ও পরিমাপ" — the reader matches the leading number.</summary>
    public string Label => $"{BanglaText.ToBanglaDigits(Number)}. {Name}";
}

/// <summary>Builds the downloadable Excel templates, the error report and spreadsheet exports.</summary>
public static class ImportWorkbooks
{
    private const int DataRows = 5_001;
    private static readonly XLColor HeaderFill = XLColor.FromHtml("#E8F0FE");

    public static byte[] BuildTemplate(QuestionType type, string subjectName, IReadOnlyList<TemplateChapter> chapters)
    {
        using var wb = new XLWorkbook();
        var isCq = type == QuestionType.Cq;
        var columns = ImportColumns.For(type);
        var data = wb.AddWorksheet(isCq ? ImportColumns.CqSheet : ImportColumns.McqSheet);
        WriteHeaders(data, columns);

        var lists = wb.AddWorksheet(ImportColumns.ListSheet);
        lists.Visibility = XLWorksheetVisibility.Hidden;
        var kinds = new[] { "সাধারণ", "বহুপদী", "অভিন্ন" };
        var answers = QuestionRules.OptionLabels;
        var difficulty = new[] { "১", "২", "৩" };
        var importance = new[] { "০", "১", "২", "৩" };
        var listColumns = new[]
        {
            ("ধরন", (IReadOnlyList<string>)kinds),
            ("উত্তর", answers),
            ("কঠিনতা", difficulty),
            ("গুরুত্ব", importance),
            (BanglaWords.Chapter, chapters.Select(c => c.Label).ToList()),
        };
        for (var i = 0; i < listColumns.Length; i++)
        {
            lists.Cell(1, i + 1).Value = listColumns[i].Item1;
            for (var r = 0; r < listColumns[i].Item2.Count; r++)
            {
                lists.Cell(r + 2, i + 1).Value = listColumns[i].Item2[r];
            }
        }

        void Dropdown(string key, int listColumn)
        {
            var index = columns.ToList().FindIndex(c => c.Key == key);
            var count = listColumns[listColumn - 1].Item2.Count;
            if (index < 0 || count == 0)
            {
                return;
            }

            var range = data.Range(2, index + 1, DataRows, index + 1);
            var validation = range.CreateDataValidation();
            validation.List(lists.Range(2, listColumn, count + 1, listColumn), true);
            validation.IgnoreBlanks = true;
            validation.ShowErrorMessage = false;
        }

        if (!isCq)
        {
            Dropdown("mcq_kind", 1);
            Dropdown("correct", 2);
        }

        Dropdown("difficulty", 3);
        Dropdown("importance", 4);
        Dropdown("chapter", 5);

        for (var c = 1; c <= columns.Count; c++)
        {
            data.Column(c).Style.NumberFormat.Format = "@";
            data.Column(c).Style.Alignment.WrapText = true;
        }

        WriteHelp(wb.AddWorksheet(ImportColumns.HelpSheet), type, subjectName, chapters);
        return Save(wb);
    }

    /// <summary>Rows that need attention, with their Bangla messages.</summary>
    public static byte[] BuildErrorReport(IEnumerable<(int RowNo, string Location, string Status, string Messages, string Excerpt)> rows)
    {
        using var wb = new XLWorkbook();
        var ws = wb.AddWorksheet("ত্রুটি");
        var headers = new[] { "ক্রম", "অবস্থান", "অবস্থা", "সমস্যা", "প্রশ্ন" };
        for (var i = 0; i < headers.Length; i++)
        {
            ws.Cell(1, i + 1).Value = headers[i];
        }

        StyleHeader(ws.Range(1, 1, 1, headers.Length));
        var r = 2;
        foreach (var row in rows)
        {
            ws.Cell(r, 1).Value = row.RowNo;
            ws.Cell(r, 2).Value = row.Location;
            ws.Cell(r, 3).Value = row.Status;
            ws.Cell(r, 4).Value = row.Messages;
            ws.Cell(r, 5).Value = row.Excerpt;
            r++;
        }

        ws.Column(4).Width = 60;
        ws.Column(5).Width = 80;
        ws.Columns(1, 3).AdjustToContents();
        ws.SheetView.FreezeRows(1);
        return Save(wb);
    }

    /// <summary>Bank export in the template layout, so the file can be imported again.</summary>
    public static byte[] BuildExport(IReadOnlyList<QuestionDraft> drafts)
    {
        using var wb = new XLWorkbook();
        var mcq = wb.AddWorksheet(ImportColumns.McqSheet);
        var cq = wb.AddWorksheet(ImportColumns.CqSheet);
        WriteHeaders(mcq, ImportColumns.Mcq);
        WriteHeaders(cq, ImportColumns.Cq);

        var mcqRow = 2;
        var cqRow = 2;
        foreach (var d in drafts)
        {
            if (d.Type == QuestionType.Cq)
            {
                var values = new List<string?> { d.Stimulus };
                values.AddRange(Pad(d.CqParts.Select(p => p.Prompt), 4));
                values.AddRange(Pad(d.CqParts.Select(p => p.Answer), 4));
                values.AddRange(Pad(d.CqParts.Select(p => p.Marks is { } m ? BanglaText.ToBanglaDigits(m.ToString(System.Globalization.CultureInfo.InvariantCulture)) : null), 4));
                values.AddRange([d.ChapterRef, d.TopicRef, Level(d.Difficulty), Level(d.Importance), Tags(d), null]);
                WriteRow(cq, cqRow++, values);
            }
            else if (d.Type == QuestionType.Mcq)
            {
                var stem = d.Statements.Count > 0
                    ? string.Join('\n', new[] { d.Stem }
                        .Concat(d.Statements.Select((s, i) => $"{Roman(i + 1)}. {s}"))
                        .Append(d.StemTail ?? "")
                        .Where(s => s.Length > 0))
                    : d.Stem;
                var kind = d.McqKind switch
                {
                    McqKind.MultiCompletion => "বহুপদী",
                    McqKind.CommonInfo => "অভিন্ন",
                    _ => "সাধারণ",
                };
                var values = new List<string?> { kind, d.GroupKey, d.Stimulus, stem };
                values.AddRange(Pad(d.Options, 4));
                values.AddRange([d.CorrectRaw, d.Explanation, d.ChapterRef, d.TopicRef, Level(d.Difficulty), Level(d.Importance), Tags(d), null]);
                WriteRow(mcq, mcqRow++, values);
            }
        }

        return Save(wb);
    }

    private static void WriteHeaders(IXLWorksheet ws, IReadOnlyList<ColumnDef> columns)
    {
        for (var i = 0; i < columns.Count; i++)
        {
            var cell = ws.Cell(1, i + 1);
            cell.Value = columns[i].Header;
            if (columns[i].Required)
            {
                cell.Style.Font.FontColor = XLColor.FromHtml("#B3261E");
            }

            ws.Column(i + 1).Width = columns[i].Key switch
            {
                "stem" or "stimulus" or "explanation" => 50,
                "chapter" or "topic" or "board_tags" => 24,
                _ when columns[i].Key.StartsWith("option", StringComparison.Ordinal)
                       || columns[i].Key.StartsWith("part", StringComparison.Ordinal)
                       || columns[i].Key.StartsWith("answer", StringComparison.Ordinal) => 30,
                _ => 12,
            };
        }

        StyleHeader(ws.Range(1, 1, 1, columns.Count));
        ws.SheetView.FreezeRows(1);
    }

    private static void StyleHeader(IXLRange range)
    {
        range.Style.Font.Bold = true;
        range.Style.Fill.BackgroundColor = HeaderFill;
        range.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
    }

    private static void WriteRow(IXLWorksheet ws, int row, IReadOnlyList<string?> values)
    {
        for (var i = 0; i < values.Count; i++)
        {
            if (!string.IsNullOrEmpty(values[i]))
            {
                // Always text: ClosedXML never turns a string value into a formula.
                ws.Cell(row, i + 1).SetValue(values[i]);
            }
        }
    }

    private static void WriteHelp(IXLWorksheet ws, QuestionType type, string subjectName, IReadOnlyList<TemplateChapter> chapters)
    {
        var lines = new List<string>
        {
            $"বিষয়: {subjectName}",
            "",
            "কীভাবে পূরণ করবেন",
            "• প্রতিটি সারিতে একটি প্রশ্ন লিখুন। লাল রঙের কলামগুলো অবশ্যই পূরণ করতে হবে।",
            "• গণিতের সূত্র $ চিহ্নের মাঝে লিখুন, যেমন: $E = mc^2$",
            $"• {BanglaWords.Chapter} কলামে তালিকা থেকে বেছে নিন, অথবা শুধু {BanglaWords.Chapter}ের নম্বর লিখুন।",
            "• কঠিনতা ১ (সহজ) থেকে ৩ (কঠিন); গুরুত্ব ০ থেকে ৩।",
            "• বোর্ড ও সাল: যেমন \"ঢা ২০২৩; রা ২০২২\"",
            "• সূত্র (formula) বা ম্যাক্রো কাজ করবে না — শুধু লেখা ব্যবহার করুন।",
        };

        if (type == QuestionType.Mcq)
        {
            lines.AddRange(
            [
                "",
                "বহুনির্বাচনি প্রশ্ন",
                "• উত্তর কলামে ক, খ, গ অথবা ঘ লিখুন (a–d বা ১–৪ ও চলবে)।",
                "• বহুপদী সমাপ্তিসূচক: ধরন = বহুপদী; প্রশ্নের ঘরে আলাদা লাইনে i. ii. iii. লিখুন, শেষে \"নিচের কোনটি সঠিক?\"",
                "• অভিন্ন তথ্যভিত্তিক: ধরন = অভিন্ন; একই গ্রুপ নাম দিয়ে ২–৩টি সারি লিখুন, উদ্দীপক প্রথম সারিতে দিলেই হবে।",
                "",
                "উদাহরণ (এই শিটের উদাহরণ ইমপোর্ট হবে না)",
                "প্রশ্ন: তাপমাত্রার SI একক কোনটি? | ক: সেলসিয়াস | খ: কেলভিন | গ: ফারেনহাইট | ঘ: জুল | উত্তর: খ",
            ]);
        }
        else
        {
            lines.AddRange(
            [
                "",
                "সৃজনশীল প্রশ্ন",
                "• উদ্দীপক এবং ক, খ, গ, ঘ — চারটি অংশ লিখুন।",
                "• নম্বর ফাঁকা রাখলে ১, ২, ৩, ৪ ধরা হবে।",
                "",
                "উদাহরণ (এই শিটের উদাহরণ ইমপোর্ট হবে না)",
                "উদ্দীপক: ২ কেজি ভরের একটি বল ১০ মি/সে বেগে গড়িয়ে যাচ্ছে। | ক: গতিশক্তি কাকে বলে? | গ: বলটির গতিশক্তি নির্ণয় করো।",
            ]);
        }

        lines.Add("");
        lines.Add($"{BanglaWords.Chapter}সমূহ");
        lines.AddRange(chapters.Select(c => c.Topics.Count > 0 ? $"{c.Label} — টপিক: {string.Join(", ", c.Topics)}" : c.Label));

        for (var i = 0; i < lines.Count; i++)
        {
            ws.Cell(i + 1, 1).SetValue(lines[i]);
        }

        ws.Column(1).Width = 120;
        ws.Cell(1, 1).Style.Font.Bold = true;
    }

    private static IEnumerable<string?> Pad(IEnumerable<string?> values, int count) =>
        values.Concat(Enumerable.Repeat<string?>(null, count)).Take(count);

    private static string? Level(byte? value) => value is { } v ? BanglaText.ToBanglaDigits(v) : null;

    private static string? Tags(QuestionDraft d) =>
        d.BoardTags.Count > 0 ? string.Join("; ", d.BoardTags.Select(t => t.Raw)) : null;

    private static string Roman(int n) => n switch { 1 => "i", 2 => "ii", 3 => "iii", 4 => "iv", _ => n.ToString(System.Globalization.CultureInfo.InvariantCulture) };

    private static byte[] Save(XLWorkbook wb)
    {
        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }
}

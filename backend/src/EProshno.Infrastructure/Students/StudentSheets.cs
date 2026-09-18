using ClosedXML.Excel;
using EProshno.Core.Common;
using EProshno.Core.Text;
using EProshno.Infrastructure.Imports;
using EProshno.Infrastructure.Storage;

namespace EProshno.Infrastructure.Students;

public sealed record StudentSheetRow(int RowNumber, string Roll, string Name, string? Phone, string? GuardianPhone, string? Email);

public sealed record StudentSheetResult(IReadOnlyList<StudentSheetRow> Rows, IReadOnlyList<string> MissingColumns);

/// <summary>The student list template and its reader (Excel or CSV). Formulas are never evaluated.</summary>
public static class StudentSheets
{
    public const string SheetName = "শিক্ষার্থী";
    public const int MaxRows = 5_000;

    private static readonly (string Key, string Header, bool Required, string[] Synonyms)[] Columns =
    [
        ("roll", "রোল", true, ["roll", "roll no", "রোল নম্বর", "রোল নং"]),
        ("name", "নাম", true, ["name", "student name", "শিক্ষার্থীর নাম"]),
        ("phone", "মোবাইল", false, ["phone", "mobile", "মোবাইল নম্বর"]),
        ("guardian_phone", "অভিভাবকের মোবাইল", false, ["guardian phone", "guardian_phone", "guardian mobile", "অভিভাবকের মোবাইল নম্বর"]),
        ("email", "ইমেইল", false, ["email", "e-mail"]),
    ];

    public static byte[] BuildTemplate()
    {
        using var wb = new XLWorkbook();
        var ws = wb.AddWorksheet(SheetName);
        for (var i = 0; i < Columns.Length; i++)
        {
            ws.Cell(1, i + 1).Value = Columns[i].Header;
            ws.Column(i + 1).Width = i == 1 ? 32 : 20;
            ws.Column(i + 1).Style.NumberFormat.Format = "@";
        }

        var header = ws.Range(1, 1, 1, Columns.Length);
        header.Style.Font.Bold = true;
        header.Style.Fill.BackgroundColor = XLColor.FromHtml("#E8F0FE");
        ws.SheetView.FreezeRows(1);

        ws.Cell(2, 1).SetValue("১");
        ws.Cell(2, 2).SetValue("উদাহরণ শিক্ষার্থী");
        ws.Cell(2, 3).SetValue("01700000000");

        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    public static StudentSheetResult Read(byte[] bytes, SniffedType type)
    {
        var sheet = type switch
        {
            SniffedType.Xlsx => ExcelTableReader.Read(bytes).FirstOrDefault(),
            SniffedType.Text => CsvTableReader.Read(bytes),
            SniffedType.MacroEnabledOffice or SniffedType.LegacyOffice => throw new AppException("import.legacy_office", Messages.LegacyOfficeFile, 415),
            _ => throw new AppException("file.type", Messages.InvalidFileType, 415),
        };
        if (sheet is null || sheet.Rows.Count == 0)
        {
            return new StudentSheetResult([], [.. Columns.Where(c => c.Required).Select(c => c.Header)]);
        }

        var headerRow = sheet.Rows[0];
        var index = new Dictionary<string, int>(StringComparer.Ordinal);
        for (var i = 0; i < headerRow.Cells.Count; i++)
        {
            var header = ImportColumns.NormalizeHeader(headerRow.Cells[i]);
            foreach (var column in Columns)
            {
                var names = column.Synonyms.Append(column.Header).Append(column.Key).Select(ImportColumns.NormalizeHeader);
                if (!index.ContainsKey(column.Key) && names.Contains(header))
                {
                    index[column.Key] = i;
                }
            }
        }

        var missing = Columns.Where(c => c.Required && !index.ContainsKey(c.Key)).Select(c => c.Header).ToList();
        if (missing.Count > 0)
        {
            return new StudentSheetResult([], missing);
        }

        var dataRows = sheet.Rows.Skip(1).Where(r => r.Cells.Any(c => !string.IsNullOrWhiteSpace(c))).ToList();
        if (dataRows.Count > MaxRows)
        {
            throw new AppException("import.too_many_rows", Messages.ImportTooManyRows);
        }

        string? Cell(TabularRow row, string key) =>
            index.TryGetValue(key, out var i) && i < row.Cells.Count && !string.IsNullOrWhiteSpace(row.Cells[i])
                ? row.Cells[i].Trim()
                : null;

        var rows = dataRows.Select(r => new StudentSheetRow(
            r.RowNumber,
            NormalizeRoll(Cell(r, "roll")),
            Cell(r, "name") ?? "",
            Cell(r, "phone"),
            Cell(r, "guardian_phone"),
            Cell(r, "email"))).ToList();
        return new StudentSheetResult(rows, []);
    }

    /// <summary>Rolls compare with ASCII digits and no surrounding spaces; Excel's "12.0" becomes "12".</summary>
    public static string NormalizeRoll(string? roll)
    {
        var value = BanglaText.ToAsciiDigits(roll ?? "").Trim();
        return value.EndsWith(".0", StringComparison.Ordinal) && value[..^2].All(char.IsAsciiDigit) ? value[..^2] : value;
    }
}

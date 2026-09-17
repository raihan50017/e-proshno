using System.Globalization;
using System.Text;
using ClosedXML.Excel;
using EProshno.Core.Common;

namespace EProshno.Infrastructure.Imports;

/// <summary>RFC 4180 CSV (UTF-8, optional BOM). Detects comma, semicolon or tab from the header line.</summary>
public static class CsvTableReader
{
    public const int MaxRows = ImportLimitsExt.MaxSheetRows;

    public static TabularSheet Read(byte[] bytes)
    {
        var text = new UTF8Encoding(false, throwOnInvalidBytes: false).GetString(bytes).TrimStart((char)0xFEFF);
        var delimiter = DetectDelimiter(text);
        var rows = new List<TabularRow>();
        var cells = new List<string>();
        var field = new StringBuilder();
        var inQuotes = false;
        var rowNumber = 1;

        for (var i = 0; i < text.Length; i++)
        {
            var ch = text[i];
            if (inQuotes)
            {
                if (ch == '"')
                {
                    if (i + 1 < text.Length && text[i + 1] == '"')
                    {
                        field.Append('"');
                        i++;
                    }
                    else
                    {
                        inQuotes = false;
                    }
                }
                else
                {
                    field.Append(ch);
                }

                continue;
            }

            if (ch == '"' && field.Length == 0)
            {
                inQuotes = true;
            }
            else if (ch == delimiter)
            {
                cells.Add(field.ToString());
                field.Clear();
            }
            else if (ch is '\n' or '\r')
            {
                if (ch == '\r' && i + 1 < text.Length && text[i + 1] == '\n')
                {
                    i++;
                }

                cells.Add(field.ToString());
                field.Clear();
                rows.Add(new TabularRow(rowNumber++, cells, false));
                cells = [];
                if (rows.Count > MaxRows)
                {
                    throw new AppException("import.too_many_rows", Messages.ImportTooManyRows);
                }
            }
            else
            {
                field.Append(ch);
            }
        }

        if (field.Length > 0 || cells.Count > 0)
        {
            cells.Add(field.ToString());
            rows.Add(new TabularRow(rowNumber, cells, false));
        }

        return new TabularSheet("csv", rows);
    }

    private static char DetectDelimiter(string text)
    {
        var end = text.IndexOfAny(['\r', '\n']);
        var header = end < 0 ? text : text[..end];
        var candidates = new[] { ',', ';', '\t' };
        return candidates.OrderByDescending(c => header.Count(h => h == c)).First();
    }
}

/// <summary>
/// Reads visible worksheets with ClosedXML as plain strings. Formulas are never evaluated: formula cells yield
/// the cached value stored in the file.
/// </summary>
public static class ExcelTableReader
{
    public static List<TabularSheet> Read(byte[] bytes)
    {
        using var stream = new MemoryStream(bytes, writable: false);
        using var workbook = new XLWorkbook(stream, new LoadOptions { RecalculateAllFormulas = false });
        var sheets = new List<TabularSheet>();
        foreach (var ws in workbook.Worksheets)
        {
            if (ws.Visibility != XLWorksheetVisibility.Visible)
            {
                continue;
            }

            var used = ws.RangeUsed();
            if (used is null)
            {
                continue;
            }

            var lastRow = used.LastRow().RowNumber();
            var lastColumn = Math.Min(used.LastColumn().ColumnNumber(), 60);
            if (lastRow > ImportLimitsExt.MaxSheetRows)
            {
                throw new AppException("import.too_many_rows", Messages.ImportTooManyRows);
            }

            var mergedRows = new HashSet<int>();
            foreach (var merged in ws.MergedRanges)
            {
                for (var r = merged.FirstRow().RowNumber(); r <= merged.LastRow().RowNumber(); r++)
                {
                    mergedRows.Add(r);
                }
            }

            var rows = new List<TabularRow>(lastRow);
            for (var r = 1; r <= lastRow; r++)
            {
                var cells = new string[lastColumn];
                for (var c = 1; c <= lastColumn; c++)
                {
                    cells[c - 1] = CellText(ws.Cell(r, c));
                }

                rows.Add(new TabularRow(r, cells, mergedRows.Contains(r)));
            }

            sheets.Add(new TabularSheet(ws.Name, rows));
        }

        return sheets;
    }

    private static string CellText(IXLCell cell)
    {
        var value = cell.HasFormula ? cell.CachedValue : cell.Value;
        return value.Type switch
        {
            XLDataType.Text => value.GetText(),
            XLDataType.Number => value.GetNumber().ToString(CultureInfo.InvariantCulture),
            XLDataType.Boolean => value.GetBoolean() ? "true" : "false",
            XLDataType.DateTime => value.GetDateTime().ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            XLDataType.TimeSpan => value.GetTimeSpan().ToString(),
            _ => "",
        };
    }
}

public static class ImportLimitsExt
{
    /// <summary>Header + 5,000 questions + generous room for blank and example rows.</summary>
    public const int MaxSheetRows = 20_000;

    public const long MaxPackageUncompressed = 300L * 1024 * 1024;
    public const int MaxPackageEntries = 2_000;
    public const long MaxImageBytes = 5L * 1024 * 1024;
}

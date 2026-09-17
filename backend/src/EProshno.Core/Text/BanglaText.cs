using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace EProshno.Core.Text;

/// <summary>
/// Authoritative Bangla normaliser for search and dedupe. Used when saving StemText/ContentHash and when querying.
/// Never type nukta letters, ZWJ or ZWNJ literally here: build them from code points.
/// If Normalize changes, recompute StemText and ContentHash for all questions.
/// </summary>
public static partial class BanglaText
{
    private const char BnZero = (char)0x09E6;
    private const char BnNine = (char)0x09EF;

    // NFC decomposes RRA, RHA and YYA (Unicode composition exclusions); fold them to single code points consistently.
    private static readonly (string From, string To)[] NuktaFolds =
    [
        (S(0x09AF, 0x09BC), S(0x09DF)),   // YA + NUKTA   -> YYA
        (S(0x09A1, 0x09BC), S(0x09DC)),   // DDA + NUKTA  -> RRA
        (S(0x09A2, 0x09BC), S(0x09DD)),   // DDHA + NUKTA -> RHA
    ];

    private static readonly string Zwnj = S(0x200C);
    private static readonly string Zwj = S(0x200D);

    public static string Normalize(string? input)
    {
        if (string.IsNullOrEmpty(input))
        {
            return "";
        }

        var s = FoldForParsing(input);

        var sb = new StringBuilder(s.Length);
        foreach (var ch in s)
        {
            sb.Append(ch is >= BnZero and <= BnNine ? (char)('0' + (ch - BnZero)) : ch);   // Bangla -> ASCII digits
        }

        s = Punctuation().Replace(sb.ToString(), " ");
        return Whitespace().Replace(s, " ").Trim().ToLowerInvariant();
    }

    /// <summary>For parsers: the same code-point folding as Normalize, but keeps punctuation, case and digits.</summary>
    public static string FoldForParsing(string input)
    {
        var s = input.Normalize(NormalizationForm.FormC);
        foreach (var (from, to) in NuktaFolds)
        {
            s = s.Replace(from, to, StringComparison.Ordinal);
        }

        return s.Replace(Zwnj, "", StringComparison.Ordinal).Replace(Zwj, "", StringComparison.Ordinal);
    }

    public static string Hash(string normalized) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(normalized)));

    /// <summary>Converts Bangla digits to ASCII digits and leaves everything else unchanged.</summary>
    public static string ToAsciiDigits(string input)
    {
        var sb = new StringBuilder(input.Length);
        foreach (var ch in input)
        {
            sb.Append(ch is >= BnZero and <= BnNine ? (char)('0' + (ch - BnZero)) : ch);
        }

        return sb.ToString();
    }

    /// <summary>Converts ASCII digits to Bangla digits (for server-generated display text).</summary>
    public static string ToBanglaDigits(string input)
    {
        var sb = new StringBuilder(input.Length);
        foreach (var ch in input)
        {
            sb.Append(ch is >= '0' and <= '9' ? (char)(BnZero + (ch - '0')) : ch);
        }

        return sb.ToString();
    }

    public static string ToBanglaDigits(long value) => ToBanglaDigits(value.ToString(System.Globalization.CultureInfo.InvariantCulture));

    internal static string S(params int[] codePoints) => string.Concat(codePoints.Select(char.ConvertFromUtf32));

    // danda, double danda, ASCII punctuation, en dash, em dash
    [GeneratedRegex(@"[।॥,;:!?'""()\[\]{}.\-–—]")]
    private static partial Regex Punctuation();

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();
}

public static class LikePattern
{
    /// <summary>Escapes % _ and \ for ILIKE with '\' as the escape character.</summary>
    public static string Escape(string value) =>
        value.Replace(@"\", @"\\", StringComparison.Ordinal)
            .Replace("%", @"\%", StringComparison.Ordinal)
            .Replace("_", @"\_", StringComparison.Ordinal);
}

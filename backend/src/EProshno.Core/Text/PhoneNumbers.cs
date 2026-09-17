using System.Text.RegularExpressions;

namespace EProshno.Core.Text;

public static partial class PhoneNumbers
{
    /// <summary>
    /// Normalises a Bangladesh mobile number to E.164 (+8801XXXXXXXXX). Accepts Bangla digits, spaces, dashes and
    /// the 01…, 8801… or +8801… forms. Returns null when the number is not a valid BD mobile number.
    /// </summary>
    public static string? Normalize(string? input)
    {
        if (string.IsNullOrWhiteSpace(input))
        {
            return null;
        }

        var digits = NonDigits().Replace(BanglaText.ToAsciiDigits(input), "");
        if (digits.StartsWith("880", StringComparison.Ordinal))
        {
            digits = digits[2..];
        }

        return LocalMobile().IsMatch(digits) ? "+88" + digits : null;
    }

    [GeneratedRegex(@"[^0-9]")]
    private static partial Regex NonDigits();

    [GeneratedRegex(@"^01[3-9][0-9]{8}$")]
    private static partial Regex LocalMobile();
}

public static class Trigram
{
    /// <summary>pg_trgm-style similarity (shared trigrams / union of trigrams) on normalised text.</summary>
    public static double Similarity(string a, string b)
    {
        var ta = Grams(BanglaText.Normalize(a));
        var tb = Grams(BanglaText.Normalize(b));
        if (ta.Count == 0 || tb.Count == 0)
        {
            return 0;
        }

        var shared = ta.Count(tb.Contains);
        return (double)shared / (ta.Count + tb.Count - shared);
    }

    private static HashSet<string> Grams(string text)
    {
        var grams = new HashSet<string>(StringComparer.Ordinal);
        foreach (var word in text.Split(' ', StringSplitOptions.RemoveEmptyEntries))
        {
            var padded = $"  {word} ";
            var elements = System.Globalization.StringInfo.GetTextElementEnumerator(padded);
            var chars = new List<string>();
            while (elements.MoveNext())
            {
                chars.Add(elements.GetTextElement());
            }

            for (var i = 0; i + 3 <= chars.Count; i++)
            {
                grams.Add(string.Concat(chars[i], chars[i + 1], chars[i + 2]));
            }
        }

        return grams;
    }
}

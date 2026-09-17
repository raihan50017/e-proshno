---
name: bangla-ui
description: Rules and utilities for Bangla (bn-BD) text in e-proshno — copy glossary, Bangla digits, lakh/crore formatting, dates and fonts in React, the authoritative C# text normaliser for search and dedupe, Bangla API error messages, and Bijoy-to-Unicode import. Use for any user-visible text, number, date, font, or Bangla string processing on either side.
---

# Bangla UI and text handling

## Copy
- All user-facing strings are Bangla. Front end: typed object in `frontend/src/i18n/bn.ts`, not scattered literals.
  Back end: `AppException` and validator messages are Bangla, kept as constants in `EProshno.Api/Resources/Messages.cs`.
- Use the danda `।` as sentence end. Keep tone polite and short (আপনি form).
- Glossary — use these spellings consistently:

| Concept | Use |
|---|---|
| create | তৈরি |
| question paper / question set | প্রশ্নপত্র / প্রশ্নসেট |
| MCQ | বহুনির্বাচনি |
| creative question / stimulus | সৃজনশীল প্রশ্ন / উদ্দীপক |
| multiple-completion / common-information MCQ | বহুপদী সমাপ্তিসূচক / অভিন্ন তথ্যভিত্তিক |
| subject / chapter / topic | বিষয় / অধ্যায় / টপিক |
| time / full marks | সময় / পূর্ণমান |
| student / teacher / institution | শিক্ষার্থী / শিক্ষক / প্রতিষ্ঠান |
| save / preview / download / search | সংরক্ষণ / প্রিভিউ / ডাউনলোড / খুঁজুন |
| select all / selected | সব নির্বাচন / নির্বাচিত |
| subscription | সাবস্ক্রিপশন |
| board short names | ঢা, রা, য, কু, চ, ব, সি, দি, ম + বো + 'YY → `ঢা বো '২১` |

## Numbers and dates in React (`frontend/src/lib/bn.ts`)
```ts
const BN_ZERO = 0x09e6; // Bengali digit zero
const BN_NINE = 0x09ef; // Bengali digit nine

export const toBnDigits = (v: string | number) =>
  String(v).replace(/[0-9]/g, (d) => String.fromCharCode(BN_ZERO + Number(d)));

export const toEnDigits = (s: string) =>
  Array.from(s, (ch) => {
    const code = ch.charCodeAt(0);
    return code >= BN_ZERO && code <= BN_NINE ? String(code - BN_ZERO) : ch;
  }).join('');

// Indian grouping + Bangla digits: 1234567 → ১২,৩৪,৫৬৭
export const formatBn = (n: number) => new Intl.NumberFormat('bn-BD').format(n);

// 3022000 → "৩০.২২ লাখ", 869100000 → "৮৬.৯১ কোটি"
export function compactBn(n: number) {
  if (n >= 1e7) return `${toBnDigits((n / 1e7).toFixed(2))} কোটি`;
  if (n >= 1e5) return `${toBnDigits((n / 1e5).toFixed(2))} লাখ`;
  return formatBn(n);
}

export const OPTION_LABELS = ['ক', 'খ', 'গ', 'ঘ'] as const;
export const formatDateBn = (d: Date | string) =>
  new Intl.DateTimeFormat('bn-BD', { dateStyle: 'long', timeZone: 'Asia/Dhaka' }).format(new Date(d));
export const relativeBn = new Intl.RelativeTimeFormat('bn', { numeric: 'auto' });
```
- The API sends plain numbers and ISO-8601 UTC timestamps; convert only at render time, in `Asia/Dhaka`.
- Inputs accept Bangla or English digits: `toEnDigits` before sending. The API also accepts both (normalise in validators).
- Sort Bangla strings with `new Intl.Collator('bn').compare` in the UI, and by a `Sort` column in the database.

## Fonts (all OFL, self-hosted)
- UI: Hind Siliguri via `@fontsource/hind-siliguri` (or Noto Sans Bengali), set as the Tailwind `font-sans` stack.
- Print/PDF: Noto Serif Bengali (`@fontsource/noto-serif-bengali`) or Tiro Bangla. The Worker's Chromium loads the same
  bundled font files through the print route, so preview and PDF match.
- `<html lang="bn">`. Use `line-height` ≥ 1.5 in UI — Bangla vowel signs clip at tight line heights (check shadcn inputs and badges).
- Mixed Bangla/English/math: allow `overflow-wrap: anywhere` inside option cells.

## Normalisation for search and dedupe (server-side, authoritative)
`backend/src/EProshno.Core/Text/BanglaText.cs` — used when saving `StemText`/`ContentHash` **and** when querying.

**Never type nukta letters, ZWJ or ZWNJ as literal characters in source code** — composed and decomposed forms look
identical in editors and diffs. Build them from numeric code points, as below.
```csharp
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

    public static string Normalize(string input)
    {
        var s = input.Normalize(NormalizationForm.FormC);
        foreach (var (from, to) in NuktaFolds)
            s = s.Replace(from, to, StringComparison.Ordinal);
        s = s.Replace(Zwnj, "", StringComparison.Ordinal).Replace(Zwj, "", StringComparison.Ordinal);

        var sb = new StringBuilder(s.Length);
        foreach (var ch in s)
            sb.Append(ch is >= BnZero and <= BnNine ? (char)('0' + (ch - BnZero)) : ch);   // Bangla -> ASCII digits

        s = Punctuation().Replace(sb.ToString(), " ");
        return Whitespace().Replace(s, " ").Trim().ToLowerInvariant();
    }

    // For parsers (question import): the same code-point folding as Normalize, but keeps punctuation, case and digits.
    public static string FoldForParsing(string input)
    {
        var s = input.Normalize(NormalizationForm.FormC);
        foreach (var (from, to) in NuktaFolds)
            s = s.Replace(from, to, StringComparison.Ordinal);
        return s.Replace(Zwnj, "", StringComparison.Ordinal).Replace(Zwj, "", StringComparison.Ordinal);
    }

    public static string Hash(string normalized) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(normalized)));

    private static string S(params int[] codePoints) => string.Concat(codePoints.Select(char.ConvertFromUtf32));

    // danda, double danda, ASCII punctuation, en dash, em dash
    [GeneratedRegex(@"[।॥,;:!?'""()\[\]{}.\-–—]")] private static partial Regex Punctuation();
    [GeneratedRegex(@"\s+")] private static partial Regex Whitespace();
}
```
Cover it with xUnit tests using real question strings: decomposed vs precomposed YYA/RRA/RHA, the O vowel sign written as
one vs two code points, Bangla vs English digits, danda, ZWJ/ZWNJ. Build those test inputs from code points too
(`BanglaTextTests.S(0x09AF, 0x09BC)`), never pasted characters.
If this function changes, add a job that recomputes `StemText` and `ContentHash`.

## Legacy Bijoy (SutonnyMJ) text
Many teachers have Word files typed in Bijoy ANSI fonts. On import (`EProshno.Core/Text/BijoyConverter.cs`):
- Detect: OpenXml runs using fonts like `SutonnyMJ`, or text dominated by Latin characters where Bangla is expected.
- Convert with a Bijoy→Unicode mapping (evaluate an existing open-source mapping table; check its licence) and
  show a before/after preview in the import screen for the user to confirm. Never silently convert.

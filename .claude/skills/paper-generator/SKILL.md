---
name: paper-generator
description: How e-proshno turns a question set into a print-ready paper — the PaperSettings record, PaperComposer (variants, stable seeded shuffle, answer keys) in C#, the shared React PaperDocument, print CSS for Bangla multi-column layouts, KaTeX, and the Playwright for .NET PDF job with caching and SignalR notification. Use for the print editor, preview, PDF download, or anything affecting paper output.
---

# Paper generator

## Responsibilities
| Piece | Location | Does |
|---|---|---|
| `PaperSettings` record + validator | `EProshno.Core/Papers/PaperSettings.cs`, `EProshno.Api/Features/Papers/` | Layout options stored as jsonb on `QuestionSet.Settings` |
| `PaperComposer` | `EProshno.Core/Papers/PaperComposer.cs` | Variant order, option order, numbering, answer key → `RenderedPaper` DTO |
| Preview endpoint | `GET /api/v1/question-sets/{id}/paper?variant=` (cookie auth) | Returns `RenderedPaper` for the editor |
| Render endpoint | `GET /api/v1/render/sets/{id}?variant=&token=` (HMAC token) | Same DTO, for Chromium |
| `<PaperDocument>` | `frontend/src/paper/paper-document.tsx` + `print.css` | Pure rendering of `RenderedPaper` + settings; no shuffling or business logic |
| Print editor | `frontend/src/features/generate/print-editor-page.tsx` | Settings sidebar + live preview |
| Print route | `/print/sets/:id` under `PrintLayout` | Same component, no app shell, sets `data-paper-ready` |
| PDF job | `EProshno.Worker/Jobs/RenderPaperPdfJob.cs` | Playwright Chromium → PDF → storage → job event |

Never render question papers with iText, QuestPDF, jsPDF, pdfmake or react-pdf: preview and PDF must come from the same
HTML/CSS in Chromium, which shapes Bangla conjuncts (যুক্তাক্ষর) and vowel signs correctly.

## PaperSettings
```csharp
public sealed record PaperSettings
{
    public PaperSize PaperSize { get; init; } = PaperSize.A4;            // A4, Letter, Legal, A5
    public PaperMargins MarginsMm { get; init; } = new(12, 12, 12, 12);
    public int Columns { get; init; } = 2;                               // 1..3
    public TextAlignMode TextAlign { get; init; } = TextAlignMode.Left;
    public PaperFont FontFamily { get; init; } = PaperFont.NotoSerifBengali;
    public decimal FontSizePt { get; init; } = 11m;                      // 8..18
    public decimal LineHeight { get; init; } = 1.35m;                    // 1..2
    public OptionLayout OptionLayout { get; init; } = OptionLayout.Auto; // Auto, Inline, Grid2, Stack
    public OptionLabel OptionLabel { get; init; } = OptionLabel.Paren;   // (ক), circled, ক.
    public bool PageNumbers { get; init; } = true;
    public string? Watermark { get; init; }                              // ≤ 40 chars
    public PaperHeader Header { get; init; } = new();
    public bool ShowBoardTags { get; init; }
    public bool MarkImportant { get; init; }
    public AnswerKeyMode AnswerKey { get; init; } = AnswerKeyMode.None;  // None, Appendix, Separate
    public bool TeacherCopy { get; init; }                               // correct options highlighted + explanations
    public bool AttachOmr { get; init; }
    public int Variants { get; init; } = 1;                              // 1..4 → sets ক খ গ ঘ
    public bool ShuffleQuestions { get; init; }
    public bool ShuffleOptions { get; init; }
    public uint Seed { get; init; }
}

public sealed record PaperMargins(decimal Top, decimal Right, decimal Bottom, decimal Left);

public sealed record PaperHeader
{
    public bool Institution { get; init; } = true;
    public bool Level { get; init; } = true;
    public bool Subject { get; init; } = true;
    public bool Chapter { get; init; } = true;
    public bool SetCodeBox { get; init; }
    public bool StudentInfoBox { get; init; }
    public string Instructions { get; init; } = "প্রশ্নপত্রে কোনো প্রকার দাগ/চিহ্ন দেয়া যাবে না।";
}
```
- Validator: `Columns` 1–3, `FontSizePt` 8–18, `LineHeight` 1–2, `Variants` 1–4, `Watermark` ≤ 40, `Header.Instructions` ≤ 300.
- EF Core 8 mapping: a value converter to a `jsonb` string using the app's `JsonSerializerOptions` (string enums) plus a
  `ValueComparer` based on record equality. Missing JSON properties fall back to the defaults above, so adding a
  setting never needs a data migration.
- Front end: types come from `pnpm api:gen`. The editor keeps a local copy in a Zustand store for instant preview and saves
  with a debounced `PUT /api/v1/question-sets/{id}/settings`. Institution defaults: `PUT /api/v1/institution/paper-defaults`.

## Variants, shuffling and answer keys (C#)
Use a small fixed PRNG so reprints are identical forever. **Do not use `System.Random` with a seed** (its algorithm isn't
guaranteed across .NET versions, and this project moves from .NET 8 to 10), and **never derive seeds from `HashCode.Combine`
or `string.GetHashCode()`** (randomised per process).
```csharp
public sealed class Mulberry32(uint seed)
{
    private uint _state = seed;

    public uint NextUInt()
    {
        unchecked
        {
            var z = _state += 0x6D2B79F5;
            z = (z ^ (z >> 15)) * (z | 1);
            z ^= z + (z ^ (z >> 7)) * (z | 61);
            return z ^ (z >> 14);
        }
    }

    public int Next(int maxExclusive) => (int)(NextUInt() % (uint)maxExclusive);

    public void Shuffle<T>(IList<T> items)
    {
        for (var i = items.Count - 1; i > 0; i--)
        {
            var j = Next(i + 1);
            (items[i], items[j]) = (items[j], items[i]);
        }
    }

    public static uint VariantSeed(uint setSeed, int variantIndex) =>
        unchecked(setSeed ^ ((uint)variantIndex * 0x9E3779B9));
}
```
- Variant ক with shuffling off keeps the teacher's order.
- CommonInfo siblings move as one block; MultiCompletion options are never shuffled (their order is conventional).
- The answer key is computed from each variant's final option positions.
- Changing items increments `QuestionSet.ItemsVersion` (part of the PDF cache key).
- Unit tests: same seed → identical order (pin expected sequences in the test); answer key matches rendered positions;
  CommonInfo blocks stay contiguous.

## Layout rules (print CSS)
```css
@page { size: A4; margin: 12mm; }            /* generated from settings */
.paper-body { column-count: var(--cols); column-gap: 6mm; column-rule: 0.3pt solid #999; }
.q { break-inside: avoid; margin-bottom: 2.5mm; }
.q-group { break-inside: avoid-column; }      /* stimulus + its siblings / CQ parts */
.opts.grid2 { display: grid; grid-template-columns: 1fr 1fr; column-gap: 3mm; }
.header { column-span: all; text-align: center; }
```
- Question numbers and option labels use Bangla digits/letters: `১.`, `(ক)`.
- `OptionLayout.Auto` (decided in `PaperDocument` by text length): short → inline 4-across, medium → 2×2, long → stacked.
- Math: render KaTeX in the component; set `data-paper-ready` only after KaTeX, `document.fonts.ready` and all images complete.
- Images: explicit width/height, `max-width: 100%`, presigned URLs valid for at least the render timeout.

## PDF job (Worker)
```csharp
public sealed class RenderPaperPdfJob(IBrowserProvider browsers, IRenderTokenService tokens, IObjectStorage storage,
    IJobEvents events, IOptions<RenderOptions> options)
{
    [Queue("pdf"), AutomaticRetry(Attempts = 2)]
    public async Task RunAsync(Guid jobId, Guid setId, int variant, string cacheKey, Guid userId, CancellationToken ct)
    {
        var objectKey = $"pdf/{cacheKey}.pdf";
        if (!await storage.ExistsAsync(objectKey, ct))
        {
            var browser = await browsers.GetAsync();
            var context = await browser.NewContextAsync();
            try
            {
                var page = await context.NewPageAsync();
                var token = tokens.Create("set", setId, variant, TimeSpan.FromMinutes(2));
                await page.GotoAsync($"{options.Value.WebUrl}/print/sets/{setId}?variant={variant}&token={token}");
                await page.WaitForSelectorAsync("[data-paper-ready]", new() { Timeout = 60_000 });
                var pdf = await page.PdfAsync(new() { PreferCSSPageSize = true, PrintBackground = true });
                await storage.PutAsync(objectKey, pdf, "application/pdf", ct);
            }
            finally
            {
                await context.CloseAsync();
            }
        }
        await events.PublishAsync(userId, new PdfReady(jobId, objectKey), ct);
    }
}
```
- Cache key: `Convert.ToHexString(SHA256.HashData(UTF8("{setId}|{itemsVersion}|{settingsJson}|{variant}|{RendererVersion}")))`.
- `POST /api/v1/question-sets/{id}/pdf` returns `200 { url }` on a cache hit, otherwise enqueues the job and returns `202 { jobId }`.
- `IBrowserProvider` is a singleton holding one Chromium; relaunch after ~500 renders or on disconnect.
- Hangfire `pdf` queue worker count ≈ CPU cores / 2.
- Docker: base the worker on the official Playwright .NET image, or `aspnet:8.0` plus
  `pwsh bin/playwright.ps1 install --with-deps chromium`; bake the Bangla fonts into the image.
- Front end: listen for SignalR `PdfReady`; fall back to polling `GET /api/v1/jobs/{id}` every 2 s.

## Spike before building the full editor
Prove with fixtures (100 MCQs with long Bangla options, 20 CQs with images, 30 math-heavy MCQs) that 2-column pagination
has no split questions, no clipped vowel signs, and matching page counts in preview vs PDF. If CSS multi-column
fragmentation misbehaves, evaluate a pagination library before hand-rolling one, and write an ADR.

## Tests
- xUnit: `PaperComposer` ordering and answer keys, settings validator, JSON round-trip with missing properties.
- Integration: render endpoint rejects expired/forged tokens; PDF page count per fixture (UglyToad.PdfPig).
- Playwright (`frontend/e2e`): visual snapshots of `/print/sets/:id` for each fixture × {1, 2 columns} × {A4, Legal}.

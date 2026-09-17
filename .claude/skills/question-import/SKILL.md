---
name: question-import
description: How e-proshno imports custom questions into a teacher's bank or the platform bank — Excel/CSV template, Word (.docx) and pasted-text format, JSON bank files, text-based PDF (beta); the parse → map → preview → commit → rollback job pipeline; parsing rules for MCQ kinds and সৃজনশীল; chapter matching, dedupe, Bijoy conversion, images and math; upload security and limits; bank export. Use for anything touching imports, import templates, the question text parser, or bank export.
---

# Question import

## Where code lives
| Piece | Location |
|---|---|
| Text parser (Word, paste, PDF text → drafts) | `backend/src/EProshno.Core/Import/QuestionTextParser.cs` |
| Draft → TipTap JSON (paragraphs, math, images, statement lists) | `backend/src/EProshno.Core/Import/ContentBuilder.cs` |
| Excel/CSV reader, template builder | `backend/src/EProshno.Infrastructure/Import/ExcelQuestionReader.cs`, `ImportTemplateBuilder.cs` |
| Docx preprocessing (Bijoy runs, images) + pandoc runner | `backend/src/EProshno.Infrastructure/Import/DocxPreprocessor.cs`, `PandocRunner.cs` |
| JSON bank reader/writer (import + export) | `backend/src/EProshno.Infrastructure/Import/BankPackage.cs` |
| Endpoints | `backend/src/EProshno.Api/Features/Imports/` |
| Jobs (`import` queue) | `backend/src/EProshno.Worker/Jobs/ParseImportJob.cs`, `CommitImportJob.cs`, `RollbackImportJob.cs` |
| Wizard + history UI | `frontend/src/features/imports/` |

## Pipeline
```
Uploaded → Parsing → NeedsMapping (Excel only, when headers don't match) → Preview → Committing → Completed
                                                                                   ↘ Failed
Completed → RolledBack (within 7 days)
```
- Every source produces the same `QuestionDraft` per `ImportRow`, so validation, preview, dedupe, commit and rollback are shared.
- `QuestionDraft`: `Type`, `McqKind`, `GroupKey`, `Stimulus`, `Stem`, `Statements[]`, `Options[4]`, `CorrectIndex`,
  `CqParts[4] (Prompt, Marks, Answer)`, `Explanation`, `ChapterRef` (number or name), `TopicRef`, `Difficulty`,
  `Importance`, `BoardTags[]`, `ImageRefs[]`, `SourceLocation` (sheet + row, or paragraph index).
- `ImportRow.Status`: `Ok`, `Warning` (importable), `Error` (fix or exclude), `Duplicate` (excluded by default), `Excluded`, `Imported`.
- `ImportRow.Messages`: list of `(Field, Code, MessageBn)`; the preview highlights the field and shows the Bangla message.

## Endpoints
| Method + route | Purpose |
|---|---|
| `GET /api/v1/imports/templates/{mcq\|cq}.xlsx?subjectId=` | Generated Excel template with chapter dropdowns |
| `POST /api/v1/imports/uploads` | Presigned upload URL for the file / images zip |
| `POST /api/v1/imports` | Create job: `bankId`, `sourceType`, `defaults` (level, subject, chapter, type), `fileKey` or `text` → `202 { id }` |
| `GET /api/v1/imports/{id}` | Status, totals by row status, detected headers |
| `PUT /api/v1/imports/{id}/column-map` | Save mapping and re-parse |
| `GET /api/v1/imports/{id}/rows?status=&cursor=` | Preview rows with drafts and messages |
| `PATCH /api/v1/imports/{id}/rows/{rowId}` | Edit a draft or exclude/include it; re-validated synchronously |
| `POST /api/v1/imports/{id}/commit` | Enqueue commit → `202` |
| `POST /api/v1/imports/{id}/rollback` | Roll back within the window |
| `GET /api/v1/imports/{id}/error-report.xlsx` | Rows with errors and messages |
| `GET /api/v1/imports?bankId=` | Import history |
| `GET /api/v1/question-banks/{id}/export?format=xlsx\|json` | Export the bank's own questions (never platform questions) |

Permissions: `question.import` to import, `bank.manage` on the target bank; platform-bank imports require the `ContentEditor` role.

## Teacher text format (Word and paste)
Shown on the in-app help page with a "try it" paste box. Examples use our own sample content.
```text
১. তাপমাত্রার SI একক কোনটি?
ক. সেলসিয়াস
খ. কেলভিন
গ. ফারেনহাইট
ঘ. জুল
উত্তর: খ
ব্যাখ্যা: SI পদ্ধতিতে তাপমাত্রার একক কেলভিন।
বোর্ড: ঢা ২০২৩; রা ২০২২
কঠিনতা: ১

২. নিচের তথ্যগুলো লক্ষ করো:
i. প্রমাণ চাপে পানি ১০০° সেলসিয়াসে ফোটে
ii. প্রমাণ চাপে বরফ ০° সেলসিয়াসে গলে
iii. পানির ঘনত্ব ৪° সেলসিয়াসে সর্বোচ্চ
নিচের কোনটি সঠিক?
ক. i ও ii   খ. i ও iii   গ. ii ও iii   ঘ. i, ii ও iii
উত্তর: ঘ

অভিন্ন তথ্য:
একটি গাড়ি স্থির অবস্থা থেকে ২ মি/সে² সমত্বরণে চলতে শুরু করল।
৩. ৫ সেকেন্ড পর গাড়িটির বেগ কত?
ক. ২ মি/সে   খ. ৫ মি/সে   গ. ১০ মি/সে   ঘ. ২৫ মি/সে
উত্তর: গ
৪. ৫ সেকেন্ডে গাড়িটি কত দূরত্ব অতিক্রম করবে?
ক. ১০ মি   খ. ২৫ মি   গ. ৫০ মি   ঘ. ১০০ মি
উত্তর: খ
---

সৃজনশীল ১.
উদ্দীপক: ২ কেজি ভরের একটি বল ১০ মি/সে বেগে গড়িয়ে যাচ্ছে।
ক. গতিশক্তি কাকে বলে? [১]
খ. বেগ ও দ্রুতির পার্থক্য লেখো। [২]
গ. বলটির গতিশক্তি নির্ণয় করো। [৩]
ঘ. বলটির বেগ দ্বিগুণ হলে গতিশক্তি কতগুণ হবে? বিশ্লেষণ করো। [৪]
উত্তর গ: $E_k = \frac{1}{2}mv^2 = \frac{1}{2} \times 2 \times 10^2 = 100$ J
```

### Line rules (`QuestionTextParser`)
Before matching, run input through `BanglaText.FoldForParsing` (NFC + nukta fold + ZWJ/ZWNJ removal, **no** lowercasing or
punctuation stripping) and build the keyword table through the same function — otherwise `অধ্যায়` typed with a decomposed
য় never matches.

| Line starts with | Meaning |
|---|---|
| `প্রশ্ন` (optional) + digits (Bangla or English) + `.` `।` `)` | New MCQ; rest of the line starts the stem |
| `সৃজনশীল` + optional digits | New CQ |
| `উদ্দীপক:` | Stimulus of the current CQ |
| `অভিন্ন তথ্য:` | Starts a common-information group; following lines until the first question are the stimulus |
| `---` | Ends the common-information group |
| `ক.` `(ক)` `ক)` … `ঘ`, or `a.` `(a)` … `d` | MCQ option / CQ part; several markers on one line are split into separate options |
| `i.` `ii.` `iii.` `(i)` … | Statement of a বহুপদী সমাপ্তিসূচক MCQ (sets `MultiCompletion`) |
| `উত্তর:` `উঃ` `Ans:` (CQ: `উত্তর গ:`) | Answer: letter, number 1–4, or option text; CQ answer for that part |
| `ব্যাখ্যা:` `বোর্ড:` `কঠিনতা:` `গুরুত্ব:` `টপিক:` | Metadata for the current question |
| `অধ্যায়:` | Chapter for this and following questions until changed |
| `[১]`…`[৪]` at the end of a CQ part | Marks for that part |
| `$…$` / `$$…$$` | Inline / display LaTeX math |
| `[ছবি: name.png]` | Image from the uploaded zip (paste mode) |
| anything else | Continuation of the current field (multi-line stems and options) |

Kind detection: statements present → `MultiCompletion`; inside an `অভিন্ন তথ্য` group → `CommonInfo`; otherwise `Simple`.
Errors: MCQ without exactly 4 options or without an answer; CQ without a stimulus or with missing parts. Warnings: numbering
gaps, answer given as text that matched an option, marks missing (defaults 1-2-3-4 applied).
All regexes use a match timeout (`[GeneratedRegex(..., matchTimeoutMilliseconds: 200)]`).

## Excel / CSV template
- Sheets: `বহুনির্বাচনি`, `সৃজনশীল`, `নির্দেশনা` (instructions), hidden `তালিকা` (chapter/topic lists for dropdowns).
- MCQ headers → keys: ধরন (সাধারণ/বহুপদী/অভিন্ন) → `mcq_kind`, গ্রুপ → `group`, উদ্দীপক → `stimulus`, প্রশ্ন → `stem`,
  ক/খ/গ/ঘ → `options`, উত্তর → `correct`, ব্যাখ্যা → `explanation`, অধ্যায় → `chapter`, টপিক → `topic`,
  কঠিনতা → `difficulty`, গুরুত্ব → `importance`, বোর্ড ও সাল → `board_tags`, ছবি → `image`.
- CQ headers: উদ্দীপক, ক/খ/গ/ঘ (prompts), উত্তর ক/খ/গ/ঘ, নম্বর ক/খ/গ/ঘ (default 1/2/3/4), অধ্যায়, টপিক, বোর্ড ও সাল, ছবি.
- Header matching: fold + trim + lowercase, then compare against a synonym list including English keys (`question`,
  `option_a`, `answer`…). Missing required columns → `NeedsMapping`; the UI shows detected headers with dropdowns.
- Read cached cell values only — **never evaluate formulas**; rich text → plain text; skip fully empty rows; merged cells → row error.
- Rows sharing `group` form one common-information group. Statements of বহুপদী go in the stem as `i.` `ii.` `iii.` lines.
- `correct` accepts ক–ঘ, a–d, 1–4 in Bangla or English digits. Math uses `$…$`.
- CSV: UTF-8 (with or without BOM), same keys as headers.

## Word (.docx)
1. Reject `.doc` and `.docm` with a message asking the teacher to save as `.docx`.
2. `DocxPreprocessor` (OpenXml): detect runs in Bijoy fonts (`SutonnyMJ` and other `*MJ` fonts) → convert with
   `BijoyConverter`, recording before/after for the preview; extract images in document order; drop external relationships.
3. `pandoc --sandbox -f docx -t markdown --wrap=none` with a 60 s timeout. Word equations arrive as `$…$` TeX math,
   images as placeholders mapped to the extracted files, auto-numbered lists keep their numbers (options may appear as `a.`–`d.`).
4. Strip Markdown emphasis/escapes, flatten 2×2 option tables into option lines, then run `QuestionTextParser`.

## JSON bank package (export and import)
Zip containing `bank.json` + `media/`. `bank.json`: `{ "format": "eproshno.bank", "version": 1, "bank": { name, level, subject },
"syllabus": [custom chapters/topics], "questions": [QuestionDraft with media paths] }`. Export writes only questions from the
institution's own banks. Import validates `format`/`version` and goes through the normal preview.

## PDF (beta, M8)
Text-based PDFs only, via UglyToad.PdfPig text extraction in reading order → `QuestionTextParser`. Many Bangla PDFs use
legacy fonts without Unicode maps: if most extracted characters are not Bengali/ASCII, fail with a message suggesting Word
or Excel. Scanned PDFs and photos are out of scope.

## Matching, dedupe, validation
- **Chapter:** number → `Chapter.Number` within the subject (official + institution custom syllabus); name → exact match
  after folding, then trigram similarity ≥ 0.4 (`EF.Functions.TrigramsSimilarity`, Npgsql `UseTrigrams()`) as a Warning
  ("matched to অধ্যায় …"); nothing → Error with a chapter dropdown and a "create custom chapter" option; no chapter in the
  file → wizard default.
- **Topic:** same approach, optional.
- **Board tags:** `ঢা ২০২৩`, `ঢা বো '২৩`, `Dhaka 2023` → board + year; unknown board → Warning, tag dropped.
- **Duplicates:** `ContentHash` earlier in the same file or in the institution's banks → `Duplicate`; in the platform bank → Warning only.
- **Validation:** map each draft to the same request DTOs and FluentValidation validators used by manual create
  (`UpsertMcq`, `UpsertCq`), so imported and hand-typed questions follow identical rules.

## Commit and rollback
- Commit `Ok` + `Warning` rows that aren't excluded, 200 per transaction. Create each group's `Stimulus` once. Set
  `Question.ImportJobId` and `ImportRow.CreatedQuestionId` (re-running a commit skips rows that already have one).
- Images: re-encode with SkiaSharp (max 2000 px, PNG/WebP), store under `tenants/{institutionId}/media/`.
- Status: `Published` in the bank, or `PendingApproval` when the bank requires approval and the importer isn't an approver.
  Platform-bank imports by the content team land as `Draft` for the review workflow.
- Update `QuestionBank.QuestionCount`; publish progress events every batch.
- Rollback (creator or institution admin, until `RollbackUntil` = completion + 7 days): hard-delete created questions not
  referenced by any set, exam or OMR batch; archive referenced ones; mark job `RolledBack`. Idempotent.

## Limits and security
| Rule | Value |
|---|---|
| File size | ≤ 20 MB (xlsx, csv, docx, pdf, json zip) |
| Images zip | ≤ 100 MB, ≤ 2,000 entries, ≤ 300 MB uncompressed, no nested zips, no `..` or absolute paths |
| Questions per import | ≤ 5,000 |
| Imports per institution | ≤ 20 per day (rate limit) |
| Type check | Magic bytes + OOXML content types; reject `.xlsm`, `.docm`, `.xls`, `.doc` |
| Execution | Never evaluate formulas or run macros; pandoc `--sandbox` with timeout; regex timeouts |
| Retention | Original files deleted after 30 days; `ImportRow`s kept until rollback window + 30 days |
| Export safety | CSV cells starting with `=`, `+`, `-`, `@` are prefixed with `'` |

## Front end (`frontend/src/features/imports/`)
- Wizard steps: source & defaults → upload/paste → column mapping (only if needed) → preview & fix → summary.
- Preview: status chips with counts (ready / warning / error / duplicate), virtualised table (TanStack Virtual) for 5,000
  rows, side panel rendering the question with the paper's question component so teachers see the printed look, inline edit
  with the shared question editor, exclude/include, "import N questions" button disabled while errors remain unexcluded.
- History page: source, bank, counts, status, rollback button with the remaining window.
- Progress via SignalR with polling fallback.

## Tests
- Golden files in `backend/tests/EProshno.UnitTests/Import/Fixtures/`: `*.txt`, `*.xlsx`, `*.docx` → `*.expected.json`
  covering inline options, a–d markers, missing answer, বহুপদী, অভিন্ন group, CQ with marks and math, Word auto-numbering,
  Bijoy runs, embedded images, Bangla/English digits, decomposed য় in `অধ্যায়`.
- Integration (Testcontainers PostgreSQL + MinIO): full Excel and docx jobs; commit run twice creates no duplicates;
  rollback with one question used in a set archives it; cross-tenant import access returns 404.
- Playwright: paste-text import happy path; fix an error row inline; rollback from history.

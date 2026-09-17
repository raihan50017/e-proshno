---
name: question-bank
description: Domain rules for e-proshno's question banks — the platform bank and teachers' custom banks (sharing, approval, custom syllabus, tags, copy-to-bank), syllabus taxonomy, MCQ kinds (simple, বহুপদী সমাপ্তিসূচক, অভিন্ন তথ্যভিত্তিক), সৃজনশীল CQ structure, board appearances, FluentValidation rules, dedupe, EF Core picker queries with sources, unique/common modes and the review workflow. Use when touching questions, banks, taxonomy, the picker or filters. For importing files use question-import.
---

# Question bank domain

Entities are in `docs/TECH-SPEC.md` §6. This skill holds the rules the schema can't express.

## Where code lives
| Concern | Location |
|---|---|
| Entities, enums, pure rules (`AutoSelector`, `QuestionRules`) | `backend/src/EProshno.Core/Questions/` |
| EF configurations, `VisibleTo()` query extension | `backend/src/EProshno.Infrastructure/Persistence/` |
| Platform questions: upsert, search, report, review | `backend/src/EProshno.Api/Features/Questions/` |
| Custom banks, bank questions, custom syllabus, tags | `backend/src/EProshno.Api/Features/QuestionBanks/` |
| Imports and export | see the `question-import` skill |
| Teacher browse, picker, my banks | `frontend/src/features/question-bank/`, `frontend/src/features/generate/`, `frontend/src/features/my-banks/` |
| Admin editor + review queue | `frontend/src/features/admin/questions/` |
| Shared question editor (TipTap + KaTeX + images) | `frontend/src/features/question-editor/` |

## Two kinds of bank
| | Platform bank | Custom bank (`QuestionBank`, tenant-owned) |
|---|---|---|
| Identified by | `Question.BankId == null` | `Question.BankId == bank.Id` |
| Who edits | `ContentEditor` / `ContentReviewer` | Bank owner; institution teachers if shared and permitted |
| Who sees | Teachers with a subscription for the subject | Owner (private) or all institution teachers (shared) |
| Status flow | `Draft → InReview → Published → Archived` | `Published` directly, or `PendingApproval → Published` when `RequireApproval` |
| Needs subject subscription to use | Yes | No — governed by plan limits (`customBanks`, `customQuestions`, `importsPerMonth`) |

### Custom bank rules
- Every teacher gets a default private bank "আমার প্রশ্ন" on first use; they can create more
  (name, description, optional level/subject, `Sharing = Private | Institution`, `RequireApproval`).
- Changing `Sharing` needs `bank.share`; approving pending questions needs `bank.approve`.
- Ownership transfer: when a teacher leaves, an institution admin reassigns `OwnerId`; questions are never orphaned.
- Bulk actions on bank questions: move to another bank (same institution), change chapter/topic, set difficulty/importance,
  add/remove tags, delete. Deleting a question used in any set, exam or OMR batch archives it instead.
- **Copy to my bank:** clones a platform question (stem, options, parts, explanation, appearances) into a chosen bank with
  `SourceQuestionId` set; the copy is fully editable. Rate-limited, and only for subjects the institution is subscribed to.
- **Export:** only questions from the institution's own banks, never platform questions.
- Archiving a bank archives its questions; archived bank questions stay printable in existing sets.

### Custom syllabus and tags
- `Subject`, `Chapter`, `Topic` have `InstitutionId?`: `null` = official NCTB syllabus, set = that institution's custom
  syllabus (admission batches, job-exam prep, coaching modules). Custom chapters may also hang under an official subject.
- Queries for syllabus lists return official + the current institution's custom items, ordered by `Sort`.
- `QuestionTag` (institution-scoped labels such as "মডেল টেস্ট ৩") via `QuestionTagLink`; tags are filters, never required.

## Taxonomy
`Level (SSC, HSC, Class 6–10, Admission…) → Subject (+ paper: ১ম/২য় পত্র) → Chapter (number, name) → Topic`.
Seed the official syllabus from the current NCTB curriculum with an idempotent `DataSeeder` (upsert by slug/code).
Chapter labels render as `অধ্যায় ১ - তাপগতিবিদ্যা`.

## Question kinds and validation
| Kind | Structure | Rules |
|---|---|---|
| Mcq · Simple | stem + 4 options | exactly 4 options, exactly 1 correct |
| Mcq · MultiCompletion (বহুপদী সমাপ্তিসূচক) | stem with statements i, ii, iii + lead "নিচের কোনটি সঠিক?" + 4 combination options (i ও ii, i ও iii, ii ও iii, i, ii ও iii) | statements stored as a list node in `Stem`; 1 correct |
| Mcq · CommonInfo (অভিন্ন তথ্যভিত্তিক) | shared `Stimulus` + 2–3 MCQs linked by `StimulusId` | siblings are always selected, shuffled and printed together, directly after the stimulus |
| Cq (সৃজনশীল) | `Stimulus` (উদ্দীপক) + parts ক, খ, গ, ঘ | marks 1, 2, 3, 4 (total 10) by default; each part has a prompt and optional answer |
| Short | stem + optional answer | marks required when added to a set |

```csharp
public sealed class Validator : AbstractValidator<UpsertMcq.Request>
{
    public Validator()
    {
        RuleFor(x => x.Options).Must(o => o.Count == 4).WithMessage(Messages.McqNeedsFourOptions);
        RuleFor(x => x.Options).Must(o => o.Count(opt => opt.IsCorrect) == 1).WithMessage(Messages.McqNeedsOneCorrect);
        RuleFor(x => x.StimulusId).NotNull().When(x => x.McqKind == McqKind.CommonInfo);
        RuleFor(x => x.Difficulty).InclusiveBetween((byte)1, (byte)3);
        RuleFor(x => x.Importance).InclusiveBetween((byte)0, (byte)3);
    }
}
```
The same validators run for platform questions, bank questions and every import row.

Other rules:
- `IsMath` true = গাণিতিক, false = তত্ত্বীয়. `HasImage` is derived from the TipTap JSON on save, never user-set.
- `StemText = BanglaText.Normalize(plain text of stem + options/parts)`; `ContentHash = BanglaText.Hash(StemText)` (see `bangla-ui`).
- Duplicate check on create: same `ContentHash` in the same bank → reject with a link; in another of the institution's banks
  or the platform bank → warn, allow.
- Board tags come from `QuestionAppearance`; display as `ঢা বো '২১`, newest first, max 3 then "+N".
- "Repeated board question" = 2+ appearances with `Source == ExamSource.Board`.
- Teachers may report a platform question (`QuestionReport`) but never edit it; resolving a report notifies the reporter.
  Every edit to a published platform question creates a `QuestionRevision`.

## Visibility
`Question` is not `ITenantOwned` (platform rows have no institution), so every teacher-facing query starts from `VisibleTo`:
```csharp
public static IQueryable<Question> VisibleTo(this IQueryable<Question> q, Guid institutionId, Guid userId) =>
    q.Where(x => x.Status == ContentStatus.Published &&
        (x.BankId == null
         || (x.Bank!.InstitutionId == institutionId &&
             (x.Bank.Sharing == BankSharing.Institution || x.Bank.OwnerId == userId))));
```
Platform-question entitlement is checked separately (below). Bank editors use a stricter `EditableBy(institutionId, userId)`.

## Picker query (EF Core 8)
```csharp
var usesPlatform = req.Source is QuestionSource.Platform or QuestionSource.Both;
if (usesPlatform)
    await entitlements.EnsureSubjectAccessAsync(tenant.InstitutionId, req.SubjectId, ct);   // 402 → UI offers "use my banks only"

var q = db.Questions.AsNoTracking()
    .VisibleTo(tenant.InstitutionId, tenant.UserId)
    .Where(x => x.SubjectId == req.SubjectId && req.ChapterIds.Contains(x.ChapterId) && x.Type == req.Type);

q = req.Source switch
{
    QuestionSource.Platform => q.Where(x => x.BankId == null),
    QuestionSource.MyBanks  => q.Where(x => x.BankId != null && req.BankIds.Contains(x.BankId.Value)),
    _                       => q.Where(x => x.BankId == null || req.BankIds.Contains(x.BankId.Value)),
};

if (req.TopicIds is { Length: > 0 }) q = q.Where(x => x.TopicId != null && req.TopicIds.Contains(x.TopicId.Value));
if (req.TagIds is { Length: > 0 })   q = q.Where(x => x.Tags.Any(t => req.TagIds.Contains(t.TagId)));
if (req.IsMath is not null)          q = q.Where(x => x.IsMath == req.IsMath);
if (req.WithImage)                   q = q.Where(x => x.HasImage);
if (req.McqKind is not null)         q = q.Where(x => x.McqKind == req.McqKind);
if (req.RepeatedBoard)               q = q.Where(x => x.Appearances.Count(a => a.Source == ExamSource.Board) >= 2);
if (req.Mode == SetMode.Unique)      q = q.Where(x => !db.QuestionUsages.Any(u => u.QuestionId == x.Id)); // tenant filter scopes QuestionUsage
if (req.Mode == SetMode.Common)      q = q.Where(x => x.IsCommon);
if (!string.IsNullOrWhiteSpace(req.Keyword))
{
    var pattern = $"%{LikePattern.Escape(BanglaText.Normalize(req.Keyword))}%";
    q = q.Where(x => EF.Functions.ILike(x.StemText, pattern, @"\"));    // served by the gin_trgm_ops index
}
```
Order by chapter number then `Id`, and page with a keyset cursor (20 per page). Cards from custom banks show the bank name
as a badge and an edit action; platform cards show report and "copy to my bank".

## One-click auto-selection
`AutoSelector` in Core, seeded with the same `Mulberry32` PRNG as papers (see `paper-generator`). Given target N, sources and
filters: spread picks across selected chapters proportionally to their available counts, keep CommonInfo groups whole
(every sibling counts toward N), and top up from other chapters if one runs out. Return a Bangla shortfall message if fewer
than N exist. Unit-test the distribution and determinism.

When a set is saved, insert `QuestionUsage` rows for all items in the same transaction (drives unique mode for both sources).

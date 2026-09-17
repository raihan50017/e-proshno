# Product Requirements — e-proshno

## 1. Problem and users
Teachers in Bangladesh spend hours typing question papers (Bangla + math + images) for class tests,
model tests and admission coaching. They need a searchable, syllabus-mapped question bank and a way to
turn a selection into a print-ready paper, an online exam, or an OMR-evaluated test within minutes.

| Persona | Needs |
|---|---|
| Individual teacher / private tutor | Quick papers per chapter, print, answer key |
| Coaching centre owner | Many teachers, batches, OMR evaluation, merit lists, branding |
| School / college | Institution branding, teacher permissions, reports, online exams |
| Student | Take online exams, see results |
| Content team (internal) | Enter, review and fix questions; manage syllabus taxonomy |
| Platform admin (internal) | Plans, payments, users, announcements, affiliates |

## 2. Screen inventory (from reference screenshots)
Teacher app sidebar groups — reference `documents/question-generate/*.png`.

| Group | Menu item (bn) | What it does | Route | Milestone |
|---|---|---|---|---|
| সার্বিক চিত্র | ড্যাশবোর্ড | Stats, quick actions, recent sets, support | `/dashboard` | M5 |
| | ১ ক্লিকে প্রশ্ন তৈরি | Paper generator wizard | `/generate` | M3 |
| | স্মার্টবোর্ড | Classroom projector mode | `/smartboard` | M8 |
| | টিউটোরিয়াল | Video tutorials | `/tutorials` | M8 |
| | প্রশ্নব্যাংক | Browse the bank | `/question-bank` | M2 |
| ব্যবস্থাপনা | আমার তৈরি প্রশ্ন | Saved question sets | `/sets` | M3 |
| | আমার প্রশ্নব্যাংক | Custom question banks: create, add, edit, share, tag, export | `/my-banks` | M2b |
| | প্রশ্ন ইমপোর্ট | Import custom questions (Excel, CSV, Word, paste, JSON, PDF beta), history, rollback | `/imports` | M2b |
| | শিক্ষার্থী | Students & batches | `/students` | M5 |
| প্রতিষ্ঠান | আমার প্রতিষ্ঠান | Profile, logo, teachers | `/institution` | M1 |
| | আমার সাবস্ক্রিপশন | Plans, renewals, invoices | `/subscription` | M4 |
| OMR | OMR টিউটোরিয়াল / তৈরি / টোকেন / মূল্যায়ন | Sheet design, credits, evaluation | `/omr/*` | M7 |
| হেল্প লাইন | যোগাযোগ / মতামত | Support, feedback | `/support`, `/feedback` | M8 |
| — | অ্যাফিলিয়েট প্রোগ্রাম | Refer & earn | `/affiliate` | M8 |
| — | অনলাইন পরীক্ষা | Create/manage exams | `/online-exams` | M6 |

Other surfaces: student portal `/e/:examCode` (M6), admin panel `/admin/*` (M2 onward), public marketing site as a separate static site for SEO (M9).

## 3. Core flow — one-click paper generator (M3)
Reference: `documents/question-generate/` screenshots, in order 093527 → 093643 → 093731 → 094226.

**Step 1 · Setup form**
- Fields: exam name, level/class (e.g. HSC), subject + paper (modal picker), chapter(s) (multi-select modal),
  question type (MCQ / CQ), number of questions, and **question source**: platform bank, my banks (pick one or
  more), or both.
- Entitlement check: if the institution has no subscription for the subject, show an inline notice with a
  Subscribe button and block creation. The check applies only when the platform bank is a source; sets built only from
  the teacher's own banks follow plan limits (see §3b).
- Content-freshness indicator ("updated N hours ago") and app version in the card corner.

**Step 2 · Set created**
- Paper header preview: institution name, class, subject, chapter(s), time (সময়), full marks (পূর্ণমান),
  default instruction line. CTA: add questions.

**Step 3 · Question picker**
- Header: set title, `selected/target` counter, Select all, Preview, Save.
- Notice banner inviting users to report wrong questions.
- Question cards: number, stem, 4 options (ক খ গ ঘ) in a 2×2 grid, correct option highlighted,
  board/year tags (e.g. ঢা বো '২১), importance stars, report button. Questions from the teacher's own banks show the bank name and an
  edit button; platform questions offer "copy to my bank".
- Right filter panel:
  - keyword search
  - mode toggle: **Unique mode** (exclude questions this institution already used) / **Common questions** (curated high-probability)
  - special filters: repeated board questions, mathematical, theoretical, with image, বহুপদী সমাপ্তিসূচক, অভিন্ন তথ্যভিত্তিক
  - topic checklist for the chosen chapter(s)
  - source filter: platform bank and each of the teacher's banks; institution tags
  - affiliate promo card

**Step 4 · Print editor**
- Live A4 preview (default 2 columns) + settings sidebar with a Download button.
- Settings groups: attachments (answer key, OMR sheet, mark important, set code box, student-info box);
  header toggles (institution, class, subject, chapter, set code, instruction; institution font);
  layout (columns, alignment, paper size A4/Letter/Legal/A5, margins, page numbers, option label style,
  font, font size, line spacing, watermark); extras (shuffle, multiple sets ক/খ/গ/ঘ, teacher copy).
- Settings persist per set and as institution defaults.

## 3b. My question banks and custom import (M2b)
Covers the guide's "প্রশ্নব্যাংক তৈরি" chapter: adding questions, chapter-wise storage, editing, bulk import and categories.

**My question banks**
- A teacher can create any number of banks (e.g. "HSC Physics – Batch A model tests") with a name, optional class/subject,
  and sharing: *private* (owner only) or *institution* (all teachers; admins can require approval before questions go live).
  Every teacher starts with a default private bank.
- Questions use the official syllabus (class → subject → chapter → topic) or the institution's **custom syllabus**
  (own subjects, chapters and topics for admission, job-exam or coaching programmes).
- Institution **tags** (e.g. "মডেল টেস্ট ৩") group questions beyond chapters.
- Add questions by hand with the same editor the content team uses (Bangla, equations, images) for all MCQ kinds and CQ.
- Bulk actions: move to another bank, change chapter/topic, set difficulty, tag, delete (used questions are archived).
- "Copy to my bank" on a platform question creates an editable copy.
- Export own questions as Excel or JSON (M5). Platform questions are never exported.
- Custom questions work everywhere platform questions do: paper generator, online exams, smartboard, OMR.

**Import custom questions**
| Source | What the teacher provides | Milestone |
|---|---|---|
| Excel template (.xlsx) | Downloadable template with Bangla headers, dropdowns for chapter, answer and difficulty, and example rows. Other spreadsheets go through column mapping. | M2b |
| CSV | Same columns as the template, UTF-8. | M2b |
| Word (.docx) | Numbered questions, ক/খ/গ/ঘ options (one per line or on one line), an `উত্তর:` line, optional `ব্যাখ্যা:`, `বোর্ড:`, `কঠিনতা:`; CQ with `উদ্দীপক:` and marked parts. Images and Word equations are kept; Bijoy (SutonnyMJ) text is converted after confirmation. | M2b |
| Paste text | Same rules as Word, typed or pasted into a box. | M2b |
| JSON bank file | The export format, for backups and moving banks between accounts. | M5 |
| PDF, text-based (beta) | Best effort, always reviewed in preview. Scanned PDFs and photos are out of scope. | M8 |

Import flow: choose bank and defaults → upload or paste → map columns (only for non-template spreadsheets) →
**preview and fix** (each question marked ready, warning, error or duplicate; edit inline or exclude) → import → summary with
a downloadable error report → import history with **rollback within 7 days** (questions already used in a set are archived
instead of deleted).

Rules: chapters matched by number or closest name within the chosen subject; answers accepted as ক–ঘ, a–d or 1–4; Bangla or
English digits; duplicates checked within the file and the institution's banks (platform matches are warnings only);
per import: up to 5,000 questions, 20 MB file, 100 MB images zip.

**Decisions needed from the business**
- Are custom banks included in every paid plan, or also in a free plan with limits (banks, questions, imports per month)?
- Can an institution share a bank with another institution (e.g. franchise coaching centres)? Default: no.

## 4. Feature modules (from the product guide)
| Module | Requirements | Milestone |
|---|---|---|
| Account | Register (phone OTP / email), login, profile, change password | M1 |
| Institution | Create, edit, logo & branding, invite teachers | M1 |
| Platform question bank | Content-team entry and review, chapter/topic mapping, search, board tags | M2 |
| My question banks + import | Custom banks, custom syllabus, tags, manual add, Excel/CSV/Word/paste import with preview and rollback, copy to my bank; export + JSON (M5); PDF import beta (M8) | M2b |
| Paper generator | 1-click generate, manual select, randomise, print, PDF, teacher copy, multiple sets | M3 |
| Subscription & billing | Plans, per-subject access, renewal, payment history, limits, invoice download | M4 |
| Dashboard | Counters (sets, online exams, OMR evaluated, students), quick actions, recent sets, bank growth chart, support contacts, announcements | M5 |
| Teachers | Add, permissions, activity log, per-teacher report | M5 |
| Students | Add/import, batches, roll numbers, candidate lists | M5 |
| Online exam | Create from set, schedule/duration, add candidates, security settings, result publish, analytics | M6 |
| OMR | Sheet designer, token credits, upload scans, auto-evaluate, negative marking, multiple-touch detection, results | M7 |
| Reports | Exam results, merit list, question analysis, student performance, institution overview | M8 |
| Smartboard | Full-screen one-question-at-a-time presenter with reveal answer | M8 |
| Affiliate | Referral code, tracking, commission, payout requests | M8 |
| Support | Contact info, WhatsApp/Messenger links, feedback form, tutorials | M8 |
| Admin | Taxonomy, question entry/review queue, reports inbox, plans, users, payments, banners | M2–M9 |

## 5. MVP definition (sellable v1 = M0–M5)
A teacher can register, set up an institution, pay for subjects, generate a branded 2-column question
paper with answer key as PDF in under 2 minutes, and save/reprint it — using platform questions, their own imported questions, or both. Online exams and OMR follow.

## 6. Out of scope for v1
Native mobile apps, parent portal, LMS features, OCR of scanned papers or photos.

Possible later module (needs its own decision on provider, cost and accuracy policy): **AI-assisted drafts** — generate draft
questions from a chapter or pasted text straight into the import preview, always saved only after the teacher reviews them.

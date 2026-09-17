# Building e-proshno with an AI coding agent

Stack: ASP.NET Core Web API (.NET 8) + React (Vite) + shadcn/ui + a Python OMR service.

> .NET 8 support ends on **10 November 2026**. This plan includes a runtime upgrade to .NET 10 LTS in week 8, so nothing
> reaches production on an unsupported runtime.
Why: `docs/adr/0001-aspnet-react-stack.md`.

## 0. Ground rules before any code
1. **Build a similar product, not a copy.** Reuse workflows and UX ideas from the reference screenshots.
   Do not copy the competitor's name, logo, banner art, marketing text or questions, and do not scrape their app.
   Pick a brand name that cannot be confused with theirs.
2. **Your question database is your real product.** Code can be built in months; content takes longer. Start the
   content pipeline in parallel with M2 (see §6).
3. **You stay the reviewer.** The agent writes code; you approve plans, read diffs, run the app and own decisions.

## 1. Set up your machine (one time)
| Tool | Version | Notes |
|---|---|---|
| Git | latest | `git init` in this folder, push to a private GitHub repo |
| .NET SDK | 8 (LTS) now, 10 (LTS) in week 8 | pinned in `backend/global.json`; `dotnet tool install --global dotnet-ef --version 8.*` |
| Node.js + pnpm | current LTS | `corepack enable` |
| Docker Desktop | latest | PostgreSQL, Redis, MinIO, Seq run in containers |
| Python | 3.12 | OMR service |
| VS Code + C# Dev Kit + Claude Code extension | latest | Visual Studio or Rider are fine for debugging the API |
| GitHub CLI (`gh`) | latest | lets the agent open PRs |

Optional add-ons:
- **Playwright MCP server**: the agent can open the running app, click through flows and screenshot them to compare with `documents/`.
- **Hooks**: ask the agent to "run `dotnet build` and `pnpm typecheck` after edits"; it configures `settings.json`.
- `/fewer-permission-prompts` after a few sessions to allowlist safe `dotnet`, `pnpm` and `docker` commands.
- **Aspire AppHost** later, if you want one command to start the API, Worker, SPA and containers together.

## 2. How the agent gets its context
| File | Purpose |
|---|---|
| `CLAUDE.md` | Loaded every session: product summary, stack, layout, commands, rules |
| `docs/PRD.md` | What to build, screen by screen, per milestone |
| `docs/TECH-SPEC.md` | How to build it: conventions, entities, pipelines, deployment |
| `docs/adr/` | Why the big decisions were made |
| `.claude/skills/*` | Domain playbooks the agent loads when relevant |
| `documents/` | Reference screenshots — drag them into your prompt when building a screen |

Keep these updated. When a decision changes, ask the agent to update the doc in the same PR.

## 3. The working loop (repeat for every feature)
1. **New branch + fresh session.** `git switch -c m3-picker` and `/clear` so context is focused.
2. **Plan mode** (Shift+Tab until "plan mode"). Paste the milestone prompt from §4. Attach the screenshot.
3. **Review the plan.** Check entities, endpoint shapes, permissions and naming. Approve only what you'd maintain.
4. **Implement: API first, then contract, then UI.** The agent builds the C# side, runs `pnpm api:gen` to refresh the
   typed client, then builds the React screens — all in the same PR.
5. **Verify.** `dotnet test backend/EProshno.sln`, `pnpm lint && pnpm typecheck && pnpm test`, `pnpm test:e2e`,
   then open the app yourself (or ask the agent to use `/run`).
6. **Review.** Run `/code-review` (and `/security-review` for auth, payments, exams). Read the diff.
7. **Commit + PR + merge.** Small PRs. Update docs if anything changed.

Prompting tips:
- Be specific about the outcome and acceptance criteria, not just "make the dashboard".
- One slice at a time: "picker search endpoint + cards" rather than "the whole generator".
- When something breaks, paste the evidence: the ProblemDetails JSON, the browser console error, or the failing test output.
- Ask for tests first on logic-heavy code (shuffle, scoring, entitlements, OMR thresholds).

## 4. Milestones with ready-to-use prompts
Estimates assume one developer working with the agent full-time. Add 1–2 weeks overall for coordinating two languages.

### M0 · Scaffold (week 1)
> Read CLAUDE.md, docs/TECH-SPEC.md and docs/adr/0001. Scaffold the repo exactly as in "Repo layout":
> backend/EProshno.sln with Directory.Build.props (net8.0, nullable, TreatWarningsAsErrors), global.json pinning the .NET 8 SDK,
> Directory.Packages.props; EProshno.Api (.NET 8 Web API,
> controllers, Swashbuckle OpenAPI + Scalar, ProblemDetails + AppException handler, ValidationFilter, Serilog, health checks,
> GET /api/v1/health); EProshno.Core (IdGen wrapping UUIDNext); EProshno.Infrastructure (AppDbContext with Npgsql, snake_case naming, pg_trgm,
> initial migration for Level/Subject/Chapter/Topic/Board); EProshno.Worker (Hangfire on PostgreSQL with a sample job);
> UnitTests and IntegrationTests (WebApplicationFactory + Testcontainers). frontend/ with Vite + React + TS strict,
> Tailwind + shadcn/ui (init; add button, card, input, select, dialog, form, sidebar, sonner), React Router, TanStack Query,
> Orval config generating hooks + zod from http://localhost:5080/swagger/v1/swagger.json via `pnpm api:gen`, Vite proxy for /api and /hubs,
> Vitest and Playwright. services/omr FastAPI with /health and pytest. docker-compose (postgres, redis, minio, seq),
> .editorconfig, .env.example, and GitHub Actions jobs for backend, frontend and omr. Plan first.

Done when: containers, API, Worker and `pnpm dev` all run; the React home page shows the health status through a generated hook; CI is green.

### M1 · Auth, institution, app shell (weeks 2–3)
> Using feature-workflow and ui-from-screenshot: set up ASP.NET Core Identity (Guid keys) with cookie auth for the SPA,
> antiforgery, email + password and phone OTP login (ISmsSender with a console implementation in dev), rate-limited OTP
> endpoints. Add Institution, Membership (roles + permissions) and Invitation; ITenantContext + EF global query filter for
> ITenantOwned; permission policies with [HasPermission]. Front end: login/register/OTP pages, institution onboarding with
> logo upload via presigned URL, invite-teacher flow, and the AppShell using the shadcn Sidebar grouped like
> documents/question-generate/Screenshot 2026-09-15 093527.png with our own brand tokens. Every route in PRD §2 exists as a placeholder page.

Done when: register → create institution → invite teacher works end to end, and an integration test proves a user from institution B gets 404 on institution A's data.

### M2 · Taxonomy + question bank + admin (weeks 3–5)
> Using question-bank and bangla-ui: idempotent DataSeeder for SSC and HSC science levels/subjects/chapters/topics/boards.
> BanglaText.Normalize with unit tests. Question endpoints with FluentValidation for Simple, MultiCompletion and CommonInfo
> MCQs and CQ; review workflow Draft → InReview → Published; appearances; dedupe by ContentHash (bulk import comes in M2b).
> Front end: admin question editor (TipTap + KaTeX + image upload), review queue, and the
> teacher /question-bank browse page with filters.

Done when: an editor can enter 200 questions, a reviewer can publish them, and a teacher can filter them.

### M2b · My question banks + custom import (weeks 6–7)
> Using question-bank and question-import: QuestionBank (tenant-owned, private/institution sharing, optional approval),
> a default bank per teacher, custom syllabus (institution subjects/chapters/topics) and tags; bank CRUD, bank-question CRUD
> with the shared question editor, bulk actions, and copy-to-bank for platform questions. Import pipeline: ImportJob and
> ImportRow, presigned upload, ParseImportJob for the Excel template (with generated template download), CSV, pasted text
> and Word (.docx via OpenXml preprocessing + sandboxed pandoc) using QuestionTextParser with golden-file tests; column
> mapping; chapter matching; dedupe; preview API with inline fix/exclude; CommitImportJob in batches; rollback within 7 days;
> SignalR progress; all upload limits and file checks from the skill. Front end: /my-banks, bank detail table, the /imports
> wizard (source → upload/paste → mapping → preview & fix → summary) and import history. The content team uses the same
> wizard to import into the platform bank as Draft.

Done when: a teacher imports a 300-question Excel file, a Word file with images, equations and Bijoy text, and a pasted
block; fixes errors in preview; finds the questions in their bank; and rolls one import back.

### M3 · One-click paper generator (weeks 7–10) — the core
Split into four PRs, one per step in PRD §3.
> 1) Setup form with question source (platform bank, my banks, or both) + entitlement check when the platform bank is used (CreateQuestionSet). 2) Set header screen. 3) Picker: SearchQuestions endpoint with all
> filters, sources and unique/common modes, AutoSelector in Core, bank badges and copy-to-bank on cards, cards with counter, select-all and save (writes QuestionUsage).
> 4) Print editor: PaperSettings record + validator, PaperComposer (variants, seeded shuffle, answer key) with xUnit tests,
> React PaperDocument shared by the live preview and /print/sets/:id, RenderPaperPdfJob with Playwright .NET in the Worker,
> SignalR "PDF ready" notification with polling fallback.
> Start step 4 with a spike: prove 2-column Bangla + KaTeX + images paginate identically in preview and PDF.

Done when: a 30-MCQ, 2-column, A4 paper with answer key downloads as PDF in < 8 s and reprints identically.

### Runtime upgrade · .NET 8 → .NET 10 LTS (week 8, before 10 November 2026)
> Upgrade the back end to .NET 10 LTS in one PR: change TargetFramework in Directory.Build.props and the SDK in
> global.json; bump Microsoft.*, EF Core, Npgsql, EFCore.NamingConventions, Hangfire and test packages in
> Directory.Packages.props; replace UUIDNext inside IdGen with Guid.CreateVersion7(); update Dockerfiles to the 10.0
> images; fix new analyzer warnings. Keep Swashbuckle unless built-in OpenAPI produces an identical `pnpm api:gen` result.
> Run the full test suite plus a PDF and OMR smoke test.

Done when: CI is green on .NET 10, the regenerated API client has no unexpected diff, and staging runs the new images.

### M4 · Subscriptions and payments (weeks 10–11)
> Using bd-payments: Plan, Subscription, SubscriptionSubject, Payment and Invoice entities; IEntitlements backed by FusionCache;
> plan limits for custom banks, questions and imports; SSLCommerz sandbox checkout; IPN endpoint with server-side validation and a row-locked transaction; Hangfire reconciliation job;
> renewal reminders; invoice PDFs; payment history page; admin plan management.

Done when: a sandbox payment unlocks a subject, and replaying the IPN does not double-activate.

### M5 · Dashboard, students, teachers (weeks 11–12) → **MVP launch**
> Build /dashboard like documents/dashboard/Screenshot 2026-09-15 094511.png (our brand, our copy): one DashboardSummary
> endpoint (counters, recent sets, question-bank growth series), shadcn cards + Recharts chart, announcements, support card.
> Students (batches, roll numbers, Excel import) and teacher permissions + activity log (AuditLog via SaveChangesInterceptor).
> Bank export (Excel + JSON bank package) and JSON bank import through the existing import wizard.

### M6 · Online exam (weeks 12–14)
> Create an exam from a set, schedule it, add candidates by batch, student cookie scheme + portal /e/:examCode,
> server-authoritative deadline, rate-limited autosave endpoint, per-candidate seeded shuffle, proctor events, Hangfire
> scheduled auto-submit, result publishing, basic analytics. Load-test 2,000 candidates with k6.

### M7 · OMR (weeks 14–18)
> Using omr-engine: OmrLayout model + React sheet at /print/omr/:templateId, token ledger, bulk scan upload with presigned
> URLs, EvaluateOmrScanJob calling the Python service, OmrScoring in Core with tests, pytest accuracy harness on real scanned
> fixtures, review UI for flagged sheets, negative marking, results.

Collect 100+ real filled sheets (scanner and phone) before tuning thresholds.

### M8 · Reports, smartboard, affiliate, support (weeks 18–20)
Merit list, question analysis, student performance, institution overview, smartboard presenter, affiliate tracking and
payouts, tutorials page, feedback, WhatsApp/Messenger links, text-based PDF import (beta).

### M9 · Hardening and launch (weeks 20–22)
Security review, cross-tenant test suite for every endpoint, backups + restore drill, Sentry, rate limits, load tests,
EF migration bundle in the deploy pipeline, public marketing site as a separate static site (the SPA isn't SEO-friendly),
terms/privacy/refund pages, onboarding emails/SMS.

## 5. Skills the human team needs
| Role | Skills | Why |
|---|---|---|
| You (product owner / lead dev) | Reading C# and TypeScript, ASP.NET Core + EF Core basics, React, SQL, Git & PRs, Docker | You approve everything the agent ships |
| Subject teachers (content) | NCTB syllabus, Unicode Bangla typing (Avro), equation entry | Question quality is the product |
| Content reviewer | Subject expertise, attention to detail | Wrong answers destroy trust |
| Designer (part-time, optional) | Brand, logo, colour system for the shadcn theme, print typography | Distinct identity, polished papers |
| Ops (can be you) | Linux VPS, Docker, Cloudflare, PostgreSQL backups, monitoring | Keep it up during exam season |
| CV-savvy helper (optional, M7) | Python, OpenCV | Faster OMR tuning |

## 6. Content pipeline (start in M2)
- Sources you may use: your own and hired teachers' writing; past public board exam questions (verify the
  wording against official sources, write your own explanations); licensed content from publishers.
- Do not copy another platform's database or a commercial guide book's text.
- AI can draft explanations, tag topics and detect duplicates, but **every published question needs a human reviewer**.
- Track per-subject coverage in the admin panel; prioritise HSC/SSC science and math first.

## 7. Launch checklist
- [ ] Cross-tenant integration tests pass for every tenant-owned endpoint
- [ ] Payment IPN idempotency test passes; sandbox → live credentials switched
- [ ] PDF visual regression suite green on Bangla + math + image fixtures
- [ ] OMR accuracy harness meets targets
- [ ] Back end runs on a supported LTS runtime (.NET 10) — never ship .NET 8 after 10 November 2026
- [ ] Nightly backup + tested restore; migrations applied via migration bundle
- [ ] Sentry alerts, uptime monitor, status contact
- [ ] Terms, privacy policy, refund policy (required by gateways)
- [ ] 1,000+ reviewed questions in launch subjects
- [ ] Import tested with real teacher files: Excel, Word with images/equations/Bijoy text, pasted text; rollback verified

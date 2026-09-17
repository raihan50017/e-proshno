# e-proshno — guide for AI agents working in this repo

## What we are building
A Bangla-first SaaS for teachers, coaching centres, schools and colleges in Bangladesh:
store a question bank (MCQ and সৃজনশীল/CQ), generate printable question papers in one click,
run online exams, generate and evaluate OMR sheets, manage students/teachers, sell subscriptions.

- Working codename: **e-proshno** (the public brand must be clearly distinct from any competitor).
- Functional reference: screenshots and notes in `documents/` (a competing product).
  We reproduce **workflows and UX patterns only** — never their name, logo, artwork, banners,
  marketing copy, or question data. Do not scrape or automate against any third-party site.

## Source-of-truth docs (read before planning any feature)
- `docs/PRD.md` — feature inventory, screens, scope per milestone
- `docs/TECH-SPEC.md` — stack, architecture, conventions, data model, pipelines, NFRs
- `docs/AI-DEV-GUIDE.md` — build order, milestone prompts and working loop
- `docs/adr/` — architecture decisions (0001: ASP.NET Core .NET 8 + React stack, and the .NET 10 upgrade plan)
- `documents/question-generate/*.png`, `documents/dashboard/*.png` — UI references

## Skills in `.claude/skills/`
| Skill | Use when |
|---|---|
| `feature-workflow` | implementing any feature / screen / milestone item across API and React |
| `ui-from-screenshot` | building a screen from a reference image |
| `bangla-ui` | any user-facing text, numbers, dates, fonts, search normalisation |
| `question-bank` | platform and custom banks, taxonomy and custom syllabus, filters, sources, unique mode |
| `question-import` | importing custom questions (Excel/CSV/Word/paste/JSON/PDF), templates, preview, rollback, bank export |
| `paper-generator` | paper layout, print settings, PDF rendering, sets/shuffle |
| `omr-engine` | OMR sheet templates, scanning, evaluation |
| `bd-payments` | subscriptions, SSLCommerz/bKash, invoices |

## Stack (changing it requires an ADR in `docs/adr/`)
- **Back end:** ASP.NET Core Web API on **.NET 8 (LTS), C# 12** · controllers + feature folders · EF Core 8 + Npgsql (PostgreSQL) ·
  ASP.NET Core Identity (cookie auth, phone OTP) · FluentValidation · Hangfire (PostgreSQL storage) · SignalR ·
  Swashbuckle + Scalar (OpenAPI) · FusionCache (Redis) · UUIDNext · Playwright for .NET (Chromium PDFs) · Serilog ·
  xUnit + Shouldly + Testcontainers.
- **Front end:** React + TypeScript + Vite · shadcn/ui + Tailwind CSS · React Router · TanStack Query ·
  react-hook-form + zod · Orval-generated API client · TipTap + KaTeX · Vitest + Playwright.
- **Services / infra:** Python FastAPI + OpenCV (OMR) · pandoc CLI in the Worker (Word import) · PostgreSQL · Redis · S3-compatible storage (R2 / MinIO) · Docker Compose · Caddy.

> **.NET 8 support ends 10 November 2026.** The back end is upgraded to .NET 10 LTS in week 8 (see ADR 0001 and the
> "Runtime upgrade" step in `docs/AI-DEV-GUIDE.md`). Until then, keep the code upgrade-ready (rules below).

## Repo layout
```
backend/
  EProshno.sln
  global.json                        pins the .NET 8 SDK
  Directory.Build.props              net8.0, nullable, TreatWarningsAsErrors, LangVersion 12
  Directory.Packages.props           central package versions
  src/EProshno.Api/                  host: controllers, Features/<Area>/ (request, validator, handler), auth, ProblemDetails, Swagger, SignalR hubs
  src/EProshno.Core/                 entities, enums, pure domain logic (IdGen, BanglaText, PaperComposer, OmrScoring) — no infrastructure packages
  src/EProshno.Infrastructure/       AppDbContext, EF configurations, migrations, S3, SMS, payment gateways, OMR client, PDF renderer
  src/EProshno.Worker/               Hangfire server: PDF render, imports, OMR orchestration, reminders, reconciliation
  tests/EProshno.UnitTests/
  tests/EProshno.IntegrationTests/   WebApplicationFactory + Testcontainers PostgreSQL
frontend/
  src/app/                           router, providers, layouts (AppShell with shadcn Sidebar, ExamLayout, PrintLayout)
  src/features/<area>/               pages, components, hooks per feature
  src/components/ui/                 shadcn/ui components
  src/lib/api/                       Orval-generated client, hooks, zod schemas — never edit by hand
  src/lib/bn.ts                      Bangla digits, dates, formatting
  src/paper/                         <PaperDocument>, OMR sheet, print CSS
  src/i18n/bn.ts                     UI strings
  src/mocks/                         MSW handlers
  e2e/                               Playwright tests
services/omr/                        Python FastAPI OpenCV service
docs/                                PRD, tech spec, dev guide, ADRs
docker-compose.yml                   postgres, redis, minio, seq
```

## Commands (available after milestone M0)
```
docker compose up -d                                   # postgres, redis, minio, seq
dotnet build backend/EProshno.sln
dotnet run --project backend/src/EProshno.Api          # http://localhost:5080, API docs at /scalar
dotnet run --project backend/src/EProshno.Worker
dotnet ef migrations add <Name> -p backend/src/EProshno.Infrastructure -s backend/src/EProshno.Api
dotnet ef database update -p backend/src/EProshno.Infrastructure -s backend/src/EProshno.Api
dotnet test backend/EProshno.sln
dotnet format backend/EProshno.sln --verify-no-changes

cd frontend
pnpm dev                                               # http://localhost:5173, proxies /api and /hubs to the API
pnpm api:gen                                           # regenerate src/lib/api from /swagger/v1/swagger.json (API must be running)
pnpm lint && pnpm typecheck && pnpm test
pnpm test:e2e

cd services/omr && pytest
```

## Non-negotiable rules
- User-facing text is Bangla (bn-BD), including API error messages; user-visible numbers use Bangla digits
  (`toBnDigits`, `formatBn`). Code, identifiers, commits and logs are English.
- **Multi-tenancy:** tenant data implements `ITenantOwned`; `AppDbContext` applies a global query filter from
  `ITenantContext.InstitutionId`. Never accept an institutionId from the request body. `IgnoreQueryFilters()` is
  allowed only in admin features and verified webhooks, with a comment saying why.
- Validate every request with FluentValidation. zod on the front end is for UX only; the server is authoritative.
- **API contract:** after changing any endpoint or DTO, run `pnpm api:gen` and commit the generated client in the same PR.
  Never hand-write `fetch` calls or duplicate DTO types in TypeScript.
- Business errors throw `AppException(code, messageBn, status)`; responses are ProblemDetails with a `code` extension.
- Reads use `AsNoTracking()` + `Select` projections to DTOs; controllers never return entities.
- DB changes only through EF Core migrations; never edit an applied migration. Tables/columns are snake_case.
- Ids come from `IdGen.New()` (UUIDv7). Time is `DateTimeOffset` UTC from an injected `TimeProvider`.
- Async all the way with `CancellationToken`; never `.Result` or `.Wait()`.
- **Upgrade-ready code:** target framework only in `Directory.Build.props`, package versions only in
  `Directory.Packages.props`, no `#if NET8_0` branches, no preview/experimental APIs, and never persist output of
  `System.Random`, `HashCode` or `string.GetHashCode()` (they differ across runtimes/processes).
- PDFs are rendered only by the Worker's Playwright Chromium renderer.
- Uploaded and imported files are untrusted: enforce the size, type and zip limits from the `question-import` skill;
  never evaluate spreadsheet formulas or run macros.
- Money is `long` poisha (BDT × 100).
- Licences: don't add MediatR, AutoMapper, FluentAssertions or EPPlus (commercial licensing). Use plain handler
  classes, manual mapping, Shouldly, ClosedXML. Every new NuGet/npm package needs a one-line justification incl. licence
  and confirmation that it supports both net8.0 and net10.0.
- Definition of done: `dotnet build` with zero warnings, `dotnet test` green, frontend lint + typecheck + tests green,
  Playwright test for each new user flow, screen checked at 1440px and 390px, empty/loading/error states present.
- Keep changes small: one milestone slice per branch/PR.

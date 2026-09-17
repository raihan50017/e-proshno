---
name: feature-workflow
description: Standard end-to-end workflow for implementing any feature, screen, module or milestone item in e-proshno across the ASP.NET Core Web API and the React + shadcn/ui front end (plan → entity/migration → validator → handler → controller → generated client → React UI → tests → verify). Use whenever asked to build, add or implement something from docs/PRD.md.
---

# Feature workflow

## 1. Understand
- Read the relevant rows of `docs/PRD.md` and sections of `docs/TECH-SPEC.md` (§3 back-end and §4 front-end conventions).
- If a reference screenshot exists, also follow the `ui-from-screenshot` skill.
- Load domain skills that apply (`question-bank`, `paper-generator`, `omr-engine`, `bd-payments`, `bangla-ui`).
- Write acceptance criteria as a checklist before coding. Ask the user only about genuine product decisions.

## 2. Plan (present before implementing)
List: entities and migrations, request/response DTOs, validators, handlers, endpoints + permissions, Hangfire jobs,
SignalR events, React routes/components, tests, and what is out of scope. Keep the slice shippable in one PR.

## 3. Back end (in this order)
1. **Domain** — entities/enums in `backend/src/EProshno.Core/<Area>/`. Pure rules (scoring, shuffle, entitlement
   maths, normalisation) live here as small classes with unit tests and no infrastructure dependencies.
2. **Persistence** — `IEntityTypeConfiguration<T>` in `EProshno.Infrastructure/Persistence/Configurations/`.
   Tenant data implements `ITenantOwned`. Then:
   `dotnet ef migrations add <PascalName> -p backend/src/EProshno.Infrastructure -s backend/src/EProshno.Api`
   and read the generated migration before applying it.
3. **Use case** — `EProshno.Api/Features/<Area>/<UseCase>.cs` containing `Request`, `Response`, `Validator`, `Handler`
   (pattern in TECH-SPEC §3.1). Handlers take `CancellationToken`, read with `AsNoTracking()` + `Select` projections,
   and throw `AppException(code, messageBn, status)` for business errors.
4. **Endpoint** — action on `<Area>Controller`: `[HasPermission(...)]` (or a deliberate `[AllowAnonymous]` with a comment),
   `[ProducesResponseType]` for every status code, route `/api/v1/<kebab-plural>`.
5. **Jobs** — Hangfire job classes in `EProshno.Worker/Jobs/`, idempotent, enqueued from handlers via `IBackgroundJobClient`
   after `SaveChangesAsync` succeeds.

## 4. Contract sync
Run the API, then `cd frontend && pnpm api:gen`. Commit the regenerated `src/lib/api/`.
If a generated type is wrong (nullable, enum, missing response), fix the C# DTO or attributes — never edit generated files.

## 5. Front end
1. Add the route in `frontend/src/app/router.tsx` (lazy import) under the correct layout (AppShell, Admin, Exam, Print).
2. Page and components in `frontend/src/features/<area>/`, using the generated TanStack Query hooks; invalidate related
   queries on mutation success.
3. Forms: react-hook-form + zod (prefer the Orval-generated zod schema); map `ValidationProblemDetails` errors onto fields.
4. shadcn/ui primitives (`pnpm dlx shadcn@latest add <name>` if missing), Bangla strings from `src/i18n/bn.ts`,
   loading skeletons, empty state, and an error state with a retry action.

## 6. Test
- xUnit + Shouldly unit tests for Core logic.
- Integration tests in `EProshno.IntegrationTests` (Testcontainers PostgreSQL) for each endpoint: success, validation
  failure, permission denied, and **cross-tenant access returns 404**.
- Vitest + React Testing Library (+ MSW) for non-trivial components and hooks.
- Playwright E2E for each new user flow (happy path + one failure path).
- Run:
  - `dotnet build backend/EProshno.sln && dotnet test backend/EProshno.sln`
  - `cd frontend && pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`

## 7. Verify in the running app
Start API, Worker and `pnpm dev`; walk the flow at 1440px and 390px, and compare with the reference screenshot if any.
Report honestly what was and wasn't verified.

## 8. Finish
- Update `docs/PRD.md` / `docs/TECH-SPEC.md` if behaviour or data model differs from the doc.
- Summarise: endpoints added, migrations, new config keys, new packages (with licence), follow-ups.

## Conventions
- C#: file-scoped namespaces, primary constructors for DI, `sealed` classes by default, records for DTOs,
  `IdGen.New()` for ids (UUIDv7; stays the same call after the .NET 10 upgrade), `TimeProvider` for time. No MediatR/AutoMapper; explicit projections.
- TypeScript: strict, no `any`, kebab-case file names (matching shadcn), PascalCase components, hooks prefixed `use`.
- Never log secrets, OTPs, passwords, or student personal data.

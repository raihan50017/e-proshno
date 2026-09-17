# MVP build progress (M0–M5)

Working log for the MVP build so a new session can resume. Update it after each step.

## Decisions for this build (see ADR 0002 once written)
- Back end stays on .NET 8 (SDK 8.0.4xx installed; .NET 10 upgrade still planned per ADR 0001).
- **Auth:** JWT access token (15 min, in memory in the SPA) + rotating refresh token in an HttpOnly cookie
  (`ep.rt`, SameSite=Strict, path `/api/v1/auth`). Identity (IdentityCore) for users, hashing, lockout, OTP.
- **Authorization:** role-based. Token `role` claim carries platform roles (SuperAdmin, ContentEditor,
  ContentReviewer, Support) and the active institution role (Owner, Admin, Teacher); `inst` claim = institution id.
- **Minimal APIs** (endpoint group per feature) instead of controllers.
- **CQRS:** `ICommand<T>`/`IQuery<T>` + handlers, in-house dispatcher with a FluentValidation pipeline (no MediatR).
- Jobs: API enqueues through `IJobScheduler` (Hangfire; `Jobs:Mode=Inline` runs them in-process for tests/dev).
  Jobs take `(institutionId, id)` and call `TenantContext.Set`, so they run under the normal tenant filter.
  Import jobs live in Infrastructure; the PDF job implements `IRenderPdfJob` in the Worker.
- Platform-bank imports (content team) use `ImportJob.BankId = null` and `InstitutionId = ImportJob.PlatformScope` (Guid.Empty).
- Storage: `IObjectStorage` (Local for dev, S3 for MinIO/R2); public images/logos served by `/api/v1/media/{key}`
  (only `media/` and `logos/` prefixes, unguessable keys), private files by HMAC-signed `/api/v1/files/{key}` links.
  Uploads go through the API (multipart), not presigned URLs, so Local storage works in dev.
- Render tokens: `{inst:N}.{exp}.{sig}`; the render endpoint sets the tenant from the token (no IgnoreQueryFilters).
- PDF cache key also includes set.UpdatedAt and institution.UpdatedAt (header changes invalidate).
- Postgres: local Windows service already uses 5432, so docker-compose Postgres maps to **5433**.
- pnpm via corepack shims in `%APPDATA%\npm` (pnpm 10.34.5). Python only 3.10 installed (OMR service targets 3.12 in Docker).
- Word (.docx) and PDF import deferred (needs pandoc / M8); paste, Excel, CSV, JSON bank package in scope.
  SignalR deferred (polling `GET /api/v1/jobs/{id}` and `GET /api/v1/imports/{id}`).
- Image re-encoding (SkiaSharp) deferred: uploads are type-sniffed and size-limited only. Follow-up.
- Production SMS gateway not implemented (DevSmsSender only). Follow-up.
- Public brand name is still undecided: UI uses a placeholder constant.
- Seeded plan prices/limits are placeholders (`SeedData.Plans`).

## Status
- [x] Repo root files, solution, projects, central packages, dotnet-ef local tool
- [x] Core: entities, BanglaText, RichContent (+ markup export, statements), QuestionRules (+ Fingerprint),
      AutoSelector, Mulberry32, PaperSettings/PaperComposer, import models, DraftValidator, DraftMapper,
      QuestionTextParser, billing, students, platform
- [x] Infrastructure: DbContext + configs, audit, tokens, storage + MediaService, SMS (dev), billing
      (entitlements, gateways, applier, reconciliation/reminder/cleanup jobs), TenantContext, jobs (IJobScheduler),
      questions (QuestionContentValidator, QuestionWriter), imports (tabular/CSV/Excel readers, template/error/export
      workbooks, BankPackage, DraftResolver, ImportProcessor/Committer/Rollback), papers (PaperLoader, RenderTokenService),
      InstitutionSetup, seeders (DataSeeder, DevDataSeeder), DependencyInjection — **builds clean**
- [ ] Initial migration (after Api Program exists: `dotnet ef migrations add Initial ...`)
- [ ] Api (in progress, **does not compile yet**): written so far — Program.cs, Common (Cqrs dispatcher,
      ErrorHandling, AuthSetup policies/rate limits/refresh cookie, OpenApiSetup, Paging), Features/Endpoints.cs
      (registry + health), Auth (register, login, OTP, reset, refresh, logout, change password, me),
      Institutions (profile, logo, paper defaults, members, invitations, activity), Taxonomy (queries +
      SyllabusCommands — needs `Messages.ChapterNumberTaken`/`SyllabusInUse`, fix `Sort = 1 + … ?? 0` precedence),
      QuestionSets/PaperSettingsValidator. **Next:** Taxonomy endpoints, Questions (QuestionSearch, QuestionReader,
      admin + teacher), QuestionBanks (BankAccess), Imports (ImportAccess), QuestionSets (SetAccess, picker,
      items, settings, paper, pdf, jobs, render), Files/media, Billing, Dashboard, Students, Admin; appsettings;
      then build, `dotnet ef migrations add Initial`.
- [ ] Worker: Hangfire server, PDF job (Playwright), recurring jobs
- [ ] Tests: unit (text, parser, composer, selector, tabular reader), integration (auth, tenancy, sets, imports, payments)
- [ ] Frontend scaffold + features
- [ ] services/omr stub, docker-compose, CI, docs (ADR 0002, CLAUDE.md, TECH-SPEC updates)

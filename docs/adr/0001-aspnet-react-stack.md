# ADR 0001 — ASP.NET Core Web API (.NET 8) + React (Vite) + shadcn/ui

- Status: Accepted
- Date: 2026-09-15

## Context
The first blueprint proposed a full-stack TypeScript monorepo on Next.js. The product owner prefers an ASP.NET Web API
back end on **.NET 8** with a React front end built on shadcn/ui.

.NET 8 is an LTS release whose Microsoft support ends on **10 November 2026** — about eight weeks after this decision and
before the planned MVP launch. After that date it receives no security patches.

## Decision
- **Back end:** ASP.NET Core Web API on .NET 8, controllers with feature folders, EF Core 8 + PostgreSQL, ASP.NET Core
  Identity with cookie auth, FluentValidation, Hangfire, SignalR, Swashbuckle (OpenAPI), Playwright for .NET (PDFs).
- **Front end:** React + TypeScript SPA built with Vite, shadcn/ui + Tailwind CSS, React Router, TanStack Query.
  The API client, types and zod schemas are generated from the OpenAPI document with Orval.
- **OMR:** a separate Python FastAPI + OpenCV service, called only by the .NET worker.
- **Hosting:** SPA static files and the API share one origin behind Caddy (`/` → SPA, `/api` + `/hubs` → API).
- **Upgrade readiness (mandatory):**
  - Target framework set once in `backend/Directory.Build.props`; SDK pinned in `backend/global.json`.
  - Package versions only in `backend/Directory.Packages.props` (central package management).
  - .NET 9+ features are wrapped so the upgrade is local: ids via `IdGen.New()` (UUIDNext today, `Guid.CreateVersion7()`
    later); OpenAPI via Swashbuckle (built-in `AddOpenApi()` optional later); caching via FusionCache.
  - The upgrade to .NET 10 LTS (supported until November 2028) is its own PR in week 8 and must land before
    10 November 2026 for anything deployed to production.

## Consequences
- Positive: a stack the owner knows, strong typing and performance, mature tooling; Hangfire gives retries and a job dashboard.
- Two languages: DTOs cross the boundary **only** through the generated client (`pnpm api:gen`), never hand-copied.
- Validation exists twice: FluentValidation is authoritative; zod only improves form UX.
- An SPA is weak for SEO, so the public marketing site is a separate static site (milestone M9).
- Same-origin hosting keeps cookie auth simple (no CORS, antiforgery header only).
- **Risk:** running .NET 8 in production after 10 November 2026 means an unpatched runtime. The week-8 upgrade is a launch blocker.

## Alternatives considered
- **Start directly on .NET 10:** avoids the upgrade entirely; preferable unless hosting, tooling or team constraints require .NET 8.
- **Next.js full stack** (previous proposal): single language, not the owner's preferred stack.
- **Minimal APIs** instead of controllers: equally valid; controllers chosen for familiarity and attribute-based policies.
- **Clean Architecture with MediatR/AutoMapper:** more ceremony for a small team, and both libraries moved to commercial licensing.
- **OpenCvSharp in-process OMR:** fewer services, but the Python CV ecosystem makes threshold tuning much faster.

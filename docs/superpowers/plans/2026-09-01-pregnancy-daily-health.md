# Pregnancy Daily Health Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Mẹ bầu page answer “hôm nay đã ăn và chăm sóc đủ các việc cần nhớ chưa?” and show private charts from real maternal health entries.

**Architecture:** Keep the existing server-only Supabase access pattern. Add one nullable daily metric row per date, expose it only through authenticated Portal routes, and render mobile-first charts with Recharts plus accessible summaries. Charts describe recorded values and never diagnose or invent targets.

**Tech Stack:** Next.js 16, React 19, Supabase Postgres/RPC, Recharts 3.10.1, Vitest.

**Spec:** User request in the active EmBe task; medical boundaries follow `docs/research/pregnancy-content-sources.md`.

## Global Constraints

- iPhone/iOS first; every control has a 44px touch target and no hover dependency.
- Keep Supabase secret keys server-only and all health tables inaccessible to `anon` and `authenticated`.
- Never infer diagnosis, “normal”, calorie targets, medication dose, or hydration targets.
- Empty charts must ask for the first real entry; never display fixture health data.
- Preserve offline checklist behavior and existing stored task IDs.

---

### Task 1: Daily nutrition checklist contract

**Files:**
- Modify: `apps/portal/tests/pregnancy.test.tsx`
- Modify: `apps/portal/tests/pregnancy-route.test.ts`
- Modify: `apps/portal/src/lib/pregnancy-content.ts`
- Modify: `apps/portal/src/app/api/pregnancy/route.ts`
- Modify: `supabase/schemas/portal_read_model.sql`
- Create: `supabase/migrations/<generated>_expand_pregnancy_checklist.sql`

**Interfaces:**
- Produces: stable checklist IDs for meals, food groups, water, supplements, movement, rest and notes.

- [ ] Write a failing page test requiring breakfast, lunch, dinner, diverse food, water and food-safety actions.
- [ ] Run `npm test -- pregnancy.test.tsx` and confirm it fails because meal actions are absent.
- [ ] Add the minimum checklist entries and update the API allowlist/database constraint.
- [ ] Run the page and route tests and confirm they pass.

### Task 2: Private daily health records

**Files:**
- Create: `apps/portal/tests/pregnancy-health-route.test.ts`
- Create: `apps/portal/src/app/api/pregnancy/health/route.ts`
- Modify: `supabase/schemas/portal_read_model.sql`
- Create: `supabase/migrations/<generated>_add_pregnancy_health_metrics.sql`
- Modify: `supabase/tests/rls.sql`

**Interfaces:**
- Produces: `GET /api/pregnancy/health?end=YYYY-MM-DD&days=28` and `PATCH /api/pregnancy/health`.
- Metric shape: `{day, weightKg, systolic, diastolic, sleepMinutes, waterGlasses, movementMinutes, wellbeing}` with nullable bounded values.

- [ ] Write failing authorization, validation, bounded-history and save tests.
- [ ] Run the focused route tests and confirm expected failures.
- [ ] Add the private table, service-only RPCs and authenticated route.
- [ ] Add RLS/privilege tests proving browsers cannot read or write the table/RPCs directly.
- [ ] Run focused tests and confirm they pass.

### Task 3: One-hand health entry and charts

**Files:**
- Create: `apps/portal/src/components/pregnancy-health-tracker.tsx`
- Create: `apps/portal/src/components/pregnancy-health-charts.tsx`
- Modify: `apps/portal/src/app/me-bau/page.tsx`
- Modify: `apps/portal/src/app/globals.css`
- Modify: `apps/portal/package.json`
- Modify: `package-lock.json`
- Modify: `apps/portal/tests/pregnancy.test.tsx`

**Interfaces:**
- Consumes: the health API from Task 2.
- Produces: a compact daily entry sheet and 7/28-day accessible charts for weight, blood pressure, sleep, water, movement, wellbeing and checklist completion.

- [ ] Write failing interaction and empty-state tests.
- [ ] Run the page tests and confirm the controls/charts are missing.
- [ ] Install exact `recharts@3.10.1` and `react-is@19.2.8`.
- [ ] Implement touch-first entry, optimistic save state, lazy chart rendering, text summaries and empty states.
- [ ] Run focused tests and confirm they pass.

### Task 4: Remote migration, production verification and release

**Files:**
- Modify: `docs/research/pregnancy-content-sources.md`
- Modify: `docs/api/openapi.json`

**Interfaces:**
- Consumes: all previous tasks.
- Produces: deployed private maternal tracking without sample health records.

- [ ] Fetch current Supabase changelog/RLS guidance and review the migration against it.
- [ ] Run Portal tests, typecheck, production build and Supabase pgTAP tests.
- [ ] Push migrations, verify RPC round-trip with a disposable transaction or rollback-safe query, and run advisors.
- [ ] Commit and push `main`; wait for Vercel production Ready.
- [ ] Verify `/me-bau` at 390×844, keyboard/touch flow, empty charts and browser error logs.

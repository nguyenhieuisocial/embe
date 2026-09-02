# Family Activity Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notify the other family member immediately when an authenticated EmBe device successfully changes family data.

**Architecture:** Reuse the existing private Web Push subscriptions and retryable delivery queue. The service worker observes successful first-party API mutations, reports only the API path plus its own push endpoint to an authenticated server route, and the database resolves the actor role, excludes that person's devices, and queues a privacy-safe message for the other person.

**Tech Stack:** Next.js 16 route handlers, Web Push/PWA service worker, Supabase PostgreSQL RPC, Vitest.

**Spec:** User request in the current EmBe task: all other family members should know immediately when one person updates data.

## Global Constraints

- Work directly on `main` as explicitly authorized for this repository.
- Never include entered health values, notes, filenames, locations, or credentials in lock-screen notification text.
- Notify only after a successful authenticated mutation.
- Preserve iPhone/iOS PWA support and keep private API responses out of browser caches.

---

### Task 1: Private activity queue

**Files:**
- Create: `supabase/migrations/20260902153000_add_family_activity_notifications.sql`
- Test: `apps/portal/tests/push-notification-contract.test.ts`

**Interfaces:**
- Produces: `embe_enqueue_family_activity(uuid,text,text)` and `embe_claim_family_activity(uuid,integer)` service-role RPCs.

- [ ] Add a failing migration contract test for role exclusion, safe activity categories, deduplication and retry queue reuse.
- [ ] Run the targeted test and verify it fails.
- [ ] Add the two guarded RPC functions and service-role-only grants.
- [ ] Run the targeted test and verify it passes.

### Task 2: Authenticated immediate dispatch

**Files:**
- Create: `apps/portal/src/lib/family-activity-notification.ts`
- Create: `apps/portal/src/lib/push-delivery-server.ts`
- Create: `apps/portal/src/app/api/notifications/activity/route.ts`
- Modify: `apps/portal/src/app/api/notifications/dispatch/route.ts`
- Modify: `apps/portal/tests/push-notification-route.test.ts`

**Interfaces:**
- Consumes: the queue RPCs from Task 1 and existing `sendPush`.
- Produces: `POST /api/notifications/activity` accepting `{ eventId, sourceEndpoint, pathname, method }` and returning only delivery counts.

- [ ] Add failing route tests for authentication, safe path classification, exclusion locator forwarding and immediate delivery.
- [ ] Run the route tests and verify they fail.
- [ ] Implement bounded input normalization and server-owned Vietnamese notification copy.
- [ ] Share claimed-delivery validation/retry bookkeeping between scheduled and activity dispatch.
- [ ] Run the route tests and verify they pass.

### Task 3: Automatic PWA reporting and live refresh

**Files:**
- Modify: `apps/portal/public/sw.js`
- Modify: `apps/portal/src/components/pwa-runtime.tsx`
- Modify: `apps/portal/src/components/notification-setup.tsx`
- Modify: `apps/portal/tests/pwa-offline.test.ts`

**Interfaces:**
- Consumes: `POST /api/notifications/activity` and the current device Push subscription endpoint.
- Produces: automatic activity reporting for successful family mutations plus an in-app update banner when another device pushes an update.

- [ ] Add failing service-worker tests for successful-mutation reporting, excluded internal endpoints, burst deduplication and client update messages.
- [ ] Run the PWA tests and verify they fail.
- [ ] Intercept only recognized first-party mutation responses, report asynchronously, and keep the original response fast.
- [ ] Post a privacy-safe refresh event to open EmBe windows when a push arrives.
- [ ] Show a compact one-tap refresh banner and clarify that activity notifications are enabled per phone.
- [ ] Run targeted tests, the complete portal suite, typecheck and production build.
- [ ] Apply the migration, push `main`, wait for CI/deployment, and verify on the production PWA.


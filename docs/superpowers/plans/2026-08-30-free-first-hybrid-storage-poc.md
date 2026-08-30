# Free-First Hybrid Storage PoC Implementation Plan

> **Scope:** Lab-only proof of concept. No production data, no production route,
> no personal Telegram account, and feature flag off by default.

**Goal:** Prove or disprove whether a dedicated Telegram Premium account over
MTProto can be implemented behind the same provider boundary as Local/R2/S3,
while keeping EmBe semantic metadata, credentials and provider locators private.

**Critical concern:** Telegram API terms permit legitimate client applications,
but do not explicitly approve using a Premium account as an object-storage
backend. Bot terms explicitly reject cloud-storage sites. The PoC therefore
measures technical behavior without treating success as production approval.

## Assumptions and gates

- Work happens on `codex/telegram-storage-poc` in `C:\EmBe`.
- Runtime state is below ignored `C:\EmBe\data\storage-poc`.
- Live Telegram tests require a dedicated Premium account, its own API ID/hash,
  an encrypted session, and a private lab channel. A personal account is never a
  fallback.
- Live R2/S3 tests require a disposable lab bucket and scoped credentials.
- Missing live credentials must produce an explicit skipped benchmark, never a
  fabricated result.
- Telegram provider stays behind `EMBE_STORAGE_POC_ENABLED=false` and
  `EMBE_TELEGRAM_POC_ENABLED=false` by default.

## Success criteria

1. A standalone service exposes provider-neutral upload, download/Range, soft
   delete, health, reconciliation and index-rebuild APIs.
2. SQLite migration stores semantic assets separately from provider locators,
   tenant/owner/ACL/checksum/encryption/status and shards.
3. Local provider and encrypted cache pass automated tests without credentials.
4. MTProto adapter uses a user session, private channel shards, retry/backoff,
   file-reference refresh and history scanning; it cannot initialize without the
   two feature flags and dedicated-account assertion.
5. Synthetic benchmark supports 1 MB, 20 MB, 100 MB, 500 MB, 1 GB, 2 GB and
   optional 3–3.9 GB without committing generated files.
6. Report distinguishes measured, skipped and inferred results and ends with a
   go/no-go decision.

## Tasks

### 1. Research and dependency selection

- Verify official MTProto/Premium limits, Terms, file reference, history and
  flood-wait behavior.
- Review named repositories plus current alternatives; record licenses,
  maintenance and reusable patterns.
- Select the smallest maintained MTProto client that supports the required
  file-size path; pin the dependency.

**Verify:** claim-to-source ledger has source, date, confidence and gap.

### 2. Isolated service skeleton and schema

- Create `services/storage-poc` with package metadata and explicit lab README.
- Add migration for assets, ACL, storage objects, Telegram shards/locators,
  encryption envelopes, outbox and benchmark runs.
- Add config validation and feature flags.

**Verify:** migration applies twice safely to a temporary SQLite database;
schema constraints reject cross-tenant/invalid state examples.

### 3. Provider contract, Local provider and encryption/cache

- Define async `StorageProvider` capabilities and operations.
- Implement `LocalStorage` with atomic write, SHA-256, Range reads and delete.
- Implement encrypted chunk container using a reviewed AEAD library with
  per-object random key and wrapped-key boundary.
- Add bounded read-through cache with hit/miss metrics.

**Verify:** unit tests for round trip, corruption, Range boundaries, cache
hit/miss, checksum mismatch and interrupted atomic write.

### 4. Telegram MTProto provider

- Authenticate only from encrypted dedicated session; never phone/OTP in API.
- Resolve private shard peers, upload to the selected shard and persist locator.
- Read arbitrary ranges by Telegram part requests; refresh expired file
  references from the source message.
- Soft delete in DB, optional remote delete only under lab policy.
- Scan shard history and signed caption/document attributes to rebuild index.
- Map flood/session/permission/network errors into stable provider errors.

**Verify:** mocked contract tests always run; live tests require explicit env
gate and a channel allowlist.

### 5. Lab API and benchmark harness

- Implement upload session, content/Range, delete, health, reconcile and rebuild
  routes; require lab API key and tenant context.
- Generate deterministic sparse/synthetic files outside Git.
- Record throughput, TTFB, range latency, concurrency, cache hit/miss and error
  taxonomy in JSON/Markdown.

**Verify:** API tests cover auth, path traversal, MIME/size limits, Range 206/416,
soft delete and tenant isolation. Benchmark dry-run must work offline.

### 6. Live lab execution and decision report

- Run Local baseline.
- Run R2/S3 only if disposable scoped credentials are present.
- Run Telegram sizes/concurrency/failure drills only if dedicated Premium session
  and lab channels are present.
- Never substitute personal credentials or production buckets.

**Verify:** report labels every row `measured`, `skipped`, or `not supported`;
no secret/session/channel ID appears in committed output.

### 7. Final verification

- Run all unit/integration/security tests, type/static checks and secret scan.
- Review git diff for production business-logic changes; expected result is none.
- Keep service disabled and document exact cleanup of lab messages/session/cache.

**Verify:** clean test output and feature flags remain off.

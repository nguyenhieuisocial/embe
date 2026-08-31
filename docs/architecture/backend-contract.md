# EmBe backend contract

Portal routes are same-origin, require the `embe_session` HttpOnly cookie and
always return `Cache-Control: private, no-store`. Browser code must never call
Supabase, Immich, Memos, BabyBuddy, Grocy, Telegram or Ollama directly.

The machine-readable OpenAPI 3.0 contract is
`docs/api/openapi.json`. CI verifies its stable paths, operation IDs, local
references and public/private boundary against the Portal contract.

## Stable Portal APIs

| Route | Methods | Purpose |
|---|---|---|
| `/api/health` | `GET` | Public, content-free deployment health |
| `/api/journal` | `POST` | Idempotent private journal inbox |
| `/api/pregnancy` | `GET`, `PATCH` | Atomic due-date and daily checklist state |
| `/api/inventory` | `GET`, `POST` | Bounded Grocy snapshot and idempotent commands |
| `/api/assistant` | `GET`, `POST` | Bounded local-only analytics questions |
| `/api/procurement` | `GET`, `PATCH` | Hash-locked purchase proposals and human transitions |
| `/api/media/:id` | `GET` | Private preview proxy; never exposes a provider locator |

All mutation requests are limited to 2 KiB and use a UUID v4 idempotency key.
Failure responses expose only stable codes: `unauthorized`, `invalid_request`,
`not_found`, and `temporarily_unavailable`.

## Procurement state machine

`DRAFT -> REVIEWED -> APPROVED -> ORDERED -> RECEIVED`

`CANCELLED` is allowed only through a human-confirmed transition. The client
must send the exact `proposalHash` returned by the latest `GET`; stale hashes are
dead-lettered and never applied. The local runtime remains authoritative for
supplier listings, quotes, warehouse routes, exchange rates, input snapshots
and approvals. Supabase contains only the bounded decision projection.

Example transition request:

```json
{
  "proposalId": "11111111-1111-4111-8111-111111111111",
  "target": "REVIEWED",
  "proposalHash": "64-lowercase-hex-characters",
  "idempotencyKey": "22222222-2222-4222-8222-222222222222"
}
```

Accepted work returns HTTP `202`; the UI must poll `GET` until `pending` is zero
and must not optimistically display `APPROVED`, `ORDERED` or `RECEIVED`.

## Privacy boundary

- Supabase is a server-only read model and command queue.
- Raw health notes, filenames, EXIF/GPS, faces, Telegram locators/sessions,
  provider URLs, API keys, prompts and raw analytics records never enter Portal.
- Ollama receives aggregate metrics only and binds to loopback.
- Telegram is an encrypted secondary replica, never the only authoritative copy.
- Procurement never performs checkout, bypasses CAPTCHA or stores marketplace
  login credentials.

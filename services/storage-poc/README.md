# EmBe Storage PoC

The HTTP API remains an isolated lab for comparing `LocalStorage`, S3-compatible
storage and Telegram over MTProto. The Windows-only secondary worker also has a
production adapter for one narrow use: originals from allowlisted curated Immich
albums are encrypted locally and copied to private Telegram shards. Telegram is
never the only authoritative copy and is not connected to Portal or Supabase.

Both feature gates default to off. Runtime files, SQLite, cache and Telegram
session must stay under ignored `C:\EmBe\data\storage-poc`.

```powershell
python -m venv C:\EmBe\.venv
C:\EmBe\.venv\Scripts\python -m pip install -e C:\EmBe\services\storage-poc[test]
$env:EMBE_STORAGE_POC_ENABLED='true'
$env:EMBE_STORAGE_POC_API_KEY='<random-lab-key>'
C:\EmBe\.venv\Scripts\python -m uvicorn embe_storage.api:app --host 127.0.0.1 --port 8099
```

Live Telegram mode additionally requires a dedicated standard or Premium account,
private shard allowlist and an already-authorized session. The API never asks
for phone, password or OTP, and it refuses to use a session unless
the dedicated-account assertion, pinned user ID and shard allowlist all match.
On Windows, the MTProto session is protected with DPAPI and the Linux API only
queues secondary copies; `scripts/run-telegram-secondary.ps1` performs the
encrypted replication under the Windows identity that owns the session.

See `docs/operations/storage-poc-runbook.md` before enabling any live provider.

The benchmark CLI accepts `local`, `r2`, `s3` and `telegram_mtproto_lab`.
Network providers are constructed only from scoped lab environment variables;
missing credentials fail closed instead of silently falling back to local.
API requests targeting Telegram first commit a local canonical object
and enqueue replication; the worker performs MTProto upload out of request scope.

The scheduled Windows runner first scans only configured Immich albums. It
archives images and videos, records an idempotent source link, strips the source
filename from the recovery manifest, and then verifies the Telegram session and
every shard even when the album is empty. A standard account is capped below
2 GB per original; oversized media fails closed instead of being split to evade
Telegram limits.

`scripts/telegram_live_smoke.py` is the bounded live acceptance check. It sends
random bytes through the encrypted provider, verifies a full read, verifies a
range read, deletes the Telegram message, and retains only aggregate timing and
boolean evidence. It never uses family media or stores a provider locator.

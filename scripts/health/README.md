# EmBe health and observability

`health-audit.ps1` is the single privacy-safe readiness report. It checks storage,
backup/restore, sync jobs, the public Portal, Node-RED, Uptime Kuma, Ollama, the
read-only MCP runtime, and the latest monthly PDF. Its JSON contains only status,
ages, counts, booleans, and HTTP status codes—never response bodies, credentials,
family notes, names, photos, or URL query strings.

Uptime Kuma remains the existing internal dashboard; the health audit does not
duplicate its history or alerting. The one-time bootstrap reuses the maintained
MIT-licensed `uptime-kuma-api2` Socket.IO client compatible with Kuma 2.x:

1. Install `requirements.txt` into the project virtual environment.
2. Run `bootstrap-uptime-kuma.ps1 -AllowInitialSetup` once and choose a dedicated
   username and strong password in the Windows credential dialog.
3. Re-run without `-AllowInitialSetup` whenever monitors need reconciliation.

The password exists only in the child process environment for the duration of the
command. It is neither written to disk nor included in status output. Reconciliation
is additive and idempotent: it never deletes or overwrites user-created monitors.

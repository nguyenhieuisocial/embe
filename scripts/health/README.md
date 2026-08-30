# EmBe health and observability

`health-audit.ps1` is the single privacy-safe readiness report. It checks storage,
backup/restore, sync jobs, the public Portal, Node-RED, Uptime Kuma, Ollama, the
read-only MCP runtime, and the latest monthly PDF. Its JSON contains only status,
ages, counts, booleans, and HTTP status codes—never response bodies, credentials,
family notes, names, photos, or URL query strings.

Uptime Kuma remains the existing internal dashboard; the health audit does not
duplicate its history or alerting. The one-time bootstrap uses the official
Socket.IO handlers and the `socket.io-client` already bundled in the pinned Kuma
container, so no duplicate API service or extra runtime dependency is installed:

1. Run `bootstrap-uptime-kuma.ps1 -AllowInitialSetup` once and choose a dedicated
   username and strong password in the Windows credential dialog.
2. Re-run without `-AllowInitialSetup` whenever monitors need reconciliation.

For unattended local reconciliation, `-CredentialPath` may point to a PowerShell
credential exported with DPAPI for the same Windows account. Such a file belongs
under ignored `secrets/runtime`, never in Git or a shared drive.

The credential is sent to the container over standard input and exists only in
process memory for the duration of the command. It is neither passed in command-line
arguments nor written to disk or status output. Reconciliation is additive and
idempotent: it never deletes or overwrites user-created monitors.

# EmBe health and observability

`health-audit.ps1` is the single privacy-safe readiness report. It checks storage,
backup/restore, sync jobs, the public Portal, Node-RED, Uptime Kuma, Ollama, the
read-only MCP runtime, and the latest monthly PDF. Its JSON contains only status,
ages, counts, booleans, and HTTP status codes—never response bodies, credentials,
family notes, names, photos, or URL query strings.

`EmBe-DiskMaintenance` runs daily with limited current-user rights. It trims
free WSL blocks and Docker build cache older than seven days. Only when free
space remains below the safety floor does it clear npm/pip download caches,
which are reproducible. It never prunes images, containers, volumes, databases,
or family media. The health
audit fails closed if its sanitized status is missing, stale, or the task is
disabled.

`install-tailscale-private-probe.ps1` installs a limited current-user probe every
five minutes because Tailscale identity is not available to the isolated backup
account. The probe persists only three HTTP status codes; `health-audit.ps1`
accepts them for at most ten minutes and otherwise fails closed or attempts a
live check.

Mỗi lần health audit chạy thật, `record-soak.ps1` tự cập nhật bằng chứng ổn định
liên tục. Một lần health không đạt sẽ đặt lại thời gian tính bảy ngày; soak chỉ
đạt khi đủ thời gian và cả năm failure drill đã có bằng chứng `pass`.

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

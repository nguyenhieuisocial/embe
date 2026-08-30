[CmdletBinding()]
param(
    [string]$TailscalePath = "C:\Program Files\Tailscale\tailscale.exe",
    [switch]$Apply
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not (Test-Path -LiteralPath $TailscalePath -PathType Leaf)) {
    throw "Tailscale is not installed."
}

$rawStatus = & $TailscalePath status --json 2>$null
if ($LASTEXITCODE -ne 0) { throw "Unable to read Tailscale status." }
$status = $rawStatus | ConvertFrom-Json
if ([string]$status.BackendState -ne "Running") {
    throw "Tailscale is installed but not logged in."
}

$dnsName = ([string]$status.Self.DNSName).TrimEnd('.')
if ([string]::IsNullOrWhiteSpace($dnsName)) { throw "Tailscale DNS name is unavailable." }

if ($Apply) {
    $null = & $TailscalePath serve --bg --yes --https=8443 http://127.0.0.1:5230 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Unable to configure private Memos access." }
    $null = & $TailscalePath serve --bg --yes --https=10000 http://127.0.0.1:8000 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Unable to configure private BabyBuddy access." }
}

[ordered]@{
    status = if ($Apply) { "ready" } else { "planned" }
    privacy = "tailnet-only"
    memos_url = "https://${dnsName}:8443"
    babybuddy_url = "https://${dnsName}:10000"
} | ConvertTo-Json -Compress

[CmdletBinding()]
param(
    [string]$TailscalePath = "C:\Program Files\Tailscale\tailscale.exe",
    [string]$Target = "http://127.0.0.1:2283",
    [switch]$Apply
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ($Target -ne "http://127.0.0.1:2283") {
    throw "Only the loopback Immich endpoint is allowed."
}
if (-not (Test-Path -LiteralPath $TailscalePath -PathType Leaf)) {
    throw "Tailscale is not installed."
}

$rawStatus = & $TailscalePath status --json 2>$null
if ($LASTEXITCODE -ne 0) { throw "Unable to read Tailscale status." }
$status = $rawStatus | ConvertFrom-Json
if ([string]$status.BackendState -ne "Running") {
    throw "Tailscale is installed but not logged in."
}

$dnsName = [string]$status.Self.DNSName
$result = [ordered]@{
    status = if ($Apply) { "ready" } else { "planned" }
    privacy = "tailnet-only"
    target = $Target
    server_url = if ($dnsName) { "https://$($dnsName.TrimEnd('.'))" } else { $null }
}

if ($Apply) {
    $null = & $TailscalePath serve --bg --yes $Target 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Unable to configure private Immich access." }
}

$result | ConvertTo-Json -Compress

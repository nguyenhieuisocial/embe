param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$runner = Join-Path $projectRoot "scripts\network\configure-immich-tailscale.ps1"
$testRoot = Join-Path $env:TEMP ("embe-tailscale-test-" + [guid]::NewGuid().ToString("N"))
$fake = Join-Path $testRoot "tailscale.ps1"
$log = Join-Path $testRoot "args.log"

try {
    New-Item -ItemType Directory -Path $testRoot | Out-Null
    @'
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
Add-Content -LiteralPath $env:EMBE_TAILSCALE_TEST_LOG -Value ($Args -join " ")
if ($Args[0] -eq "status") {
    '{"BackendState":"Running","Self":{"DNSName":"embe-home.example.ts.net."}}'
}
exit 0
'@ | Set-Content -LiteralPath $fake -Encoding UTF8
    $env:EMBE_TAILSCALE_TEST_LOG = $log

    $planned = & powershell -NoProfile -ExecutionPolicy Bypass -File $runner -TailscalePath $fake | ConvertFrom-Json
    if ($planned.status -ne "planned") { throw "Dry-run is not the default." }
    if ($planned.server_url -ne "https://embe-home.example.ts.net") { throw "Private URL is incorrect." }
    if ((Get-Content -LiteralPath $log -Raw) -match "serve") { throw "Dry-run changed Tailscale Serve." }

    $ready = & powershell -NoProfile -ExecutionPolicy Bypass -File $runner -TailscalePath $fake -Apply | ConvertFrom-Json
    if ($ready.status -ne "ready") { throw "Apply did not report ready." }
    $arguments = Get-Content -LiteralPath $log -Raw
    if ($arguments -notmatch "serve --bg --yes http://127.0.0.1:2283") { throw "Serve did not target Immich loopback." }
    if ($arguments -match "funnel") { throw "Public Funnel must never be enabled." }

    Write-Output "PASS: Tailscale Immich tests passed"
} finally {
    Remove-Item Env:\EMBE_TAILSCALE_TEST_LOG -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $testRoot) {
        $resolved = [IO.Path]::GetFullPath($testRoot)
        if (-not $resolved.StartsWith([IO.Path]::GetFullPath($env:TEMP), [StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to clean outside temp."
        }
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}

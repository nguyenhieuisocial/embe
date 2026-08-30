param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$runner = Join-Path $projectRoot "scripts\network\configure-care-apps-tailscale.ps1"
$testRoot = Join-Path $env:TEMP ("embe-care-tailscale-test-" + [guid]::NewGuid().ToString("N"))
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

    $planned = & pwsh -NoProfile -File $runner -TailscalePath $fake | ConvertFrom-Json
    if ($planned.status -ne "planned") { throw "Dry-run is not the default." }
    if ($planned.memos_url -ne "https://embe-home.example.ts.net:8443") { throw "Memos URL is incorrect." }
    if ($planned.babybuddy_url -ne "https://embe-home.example.ts.net:10000") { throw "BabyBuddy URL is incorrect." }
    if ((Get-Content -LiteralPath $log -Raw) -match "serve") { throw "Dry-run changed Tailscale Serve." }

    $ready = & pwsh -NoProfile -File $runner -TailscalePath $fake -Apply | ConvertFrom-Json
    if ($ready.status -ne "ready" -or $ready.privacy -ne "tailnet-only") { throw "Apply result is unsafe." }
    $arguments = Get-Content -LiteralPath $log -Raw
    if ($arguments -notmatch "serve --bg --yes --https=8443 http://127.0.0.1:5230") { throw "Memos was not mapped safely." }
    if ($arguments -notmatch "serve --bg --yes --https=10000 http://127.0.0.1:8000") { throw "BabyBuddy was not mapped safely." }
    if ($arguments -match "funnel") { throw "Public Funnel must never be enabled." }

    Write-Output "PASS: private care apps Tailscale tests passed"
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

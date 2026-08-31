[CmdletBinding()]
param(
    [string]$ProjectRoot = "C:\EmBe",
    [string]$OutputPath = "",
    [string]$FixturePath = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
if (-not $OutputPath) { $OutputPath = Join-Path $ProjectRoot "data\health\uptime-monitors.json" }

if ($FixturePath) {
    $counts = Get-Content -LiteralPath $FixturePath -Raw | ConvertFrom-Json
} else {
    $python = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
    $helper = Join-Path $ProjectRoot "scripts\health\uptime-kuma-state.py"
    $database = Join-Path $ProjectRoot "data\appdata\uptime-kuma\kuma.db"
    foreach ($required in @($python, $helper, $database)) {
        if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "Uptime monitor probe dependency is unavailable" }
    }
    $raw = & $python $helper --database $database 2>$null
    if ($LASTEXITCODE -ne 0) { throw "Uptime monitor probe failed" }
    $counts = $raw | ConvertFrom-Json
}

$active = [int]$counts.active
$healthy = [int]$counts.healthy
$stale = [int]$counts.stale
$passed = $active -eq 7 -and $healthy -eq 7 -and $stale -eq 0
$report = [ordered]@{
    schema_version = 1
    generated_at = [DateTimeOffset]::UtcNow.ToString("o")
    status = $(if ($passed) { "pass" } else { "critical" })
    active = $active
    healthy = $healthy
    stale = $stale
    privacy = "Only aggregate monitor counts are stored; no name, URL, token, response body, or family content is included."
}

[IO.Directory]::CreateDirectory((Split-Path $OutputPath -Parent)) | Out-Null
$temporary = "$OutputPath.tmp"
[IO.File]::WriteAllText($temporary, ($report | ConvertTo-Json -Depth 3), [Text.UTF8Encoding]::new($false))
Move-Item -LiteralPath $temporary -Destination $OutputPath -Force
$report | ConvertTo-Json -Compress
if (-not $passed) { exit 2 }
exit 0

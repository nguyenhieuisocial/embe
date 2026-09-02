param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$runner = Join-Path $projectRoot "scripts\backup\run-critical-r2.ps1"
$runnerSource = Get-Content -LiteralPath $runner -Raw
if (-not $runnerSource.Contains('Move-Item -LiteralPath $temporary -Destination $statusPath -Force')) {
    throw "Critical backup status must be replaced atomically"
}
if (([regex]::Matches($runnerSource, '& powershell -NoProfile -NonInteractive')).Count -ne 2) {
    throw "Every child PowerShell backup process must be non-interactive"
}

function New-TestProject([bool]$BackupSucceeds) {
    $root = Join-Path $env:TEMP ("embe-critical-r2-test-" + [guid]::NewGuid().ToString("N"))
    foreach ($relative in @("infra\compose", "secrets", "scripts\backup", "tools\bin", "exports\backup-staging", "infra", "vault")) {
        New-Item -ItemType Directory -Path (Join-Path $root $relative) -Force | Out-Null
    }
    @(
        "EMBE_R2_ACCOUNT_ID=0123456789abcdef0123456789abcdef"
        "EMBE_R2_ACCESS_KEY_ID=test-key"
        "EMBE_R2_SECRET_ACCESS_KEY=test-secret"
    ) | Set-Content -LiteralPath (Join-Path $root "infra\compose\storage-poc.env")
    Set-Content -LiteralPath (Join-Path $root "secrets\restic-r2-password.txt") -Value "test-password" -NoNewline
    Set-Content -LiteralPath (Join-Path $root "tools\bin\restic.exe") -Value "stub" -NoNewline

    $prepare = @'
param()
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$session = Join-Path $root ("exports\backup-staging\" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $session -Force | Out-Null
Set-Content -LiteralPath (Join-Path $session "database.dump") -Value "private snapshot"
Set-Content -LiteralPath (Join-Path $session "supabase-portal-schema.sql") -Value "schema"
Set-Content -LiteralPath (Join-Path $session "supabase-portal-data.sql") -Value "data"
[ordered]@{status="ok";session=$session;artifact_count=3} | ConvertTo-Json -Compress
'@
    Set-Content -LiteralPath (Join-Path $root "scripts\backup\prepare-snapshots.ps1") -Value $prepare

    if ($BackupSucceeds) {
        $backup = @'
param(
    [string]$CodeConfigPath, [string]$VaultPath, [string]$AppDataPath,
    [string]$Repository, [string]$PasswordFile, [string]$ResticPath,
    [string]$ManifestPath, [string]$Tag, [switch]$AllowR2Repository,
    [string[]]$RequiredAppDataFiles
)
$expected = @("supabase-portal-schema.sql", "supabase-portal-data.sql")
$received = if (@($RequiredAppDataFiles).Count -eq 1) { @($RequiredAppDataFiles[0] -split ",") } else { @($RequiredAppDataFiles) }
if ($received.Count -ne 2) { throw "Required Supabase dumps were not passed to restic" }
foreach ($name in $expected) {
    if ($received -notcontains $name) { throw "Missing required dump: $name" }
}
[ordered]@{status="ok";file_count=3;snapshot_id="test-id";manifest="test.json"} | ConvertTo-Json -Compress
'@
    } else {
        $backup = 'throw "simulated backup failure"'
    }
    Set-Content -LiteralPath (Join-Path $root "scripts\backup\run-restic.ps1") -Value $backup
    return $root
}

foreach ($succeeds in @($true, $false)) {
    $root = New-TestProject $succeeds
    try {
        $failed = $false
        try {
            & powershell -NoProfile -ExecutionPolicy Bypass -File $runner -ProjectRoot $root | Out-Null
            if (-not $succeeds) { throw "Expected simulated backup failure" }
        } catch {
            if ($succeeds) { throw }
            $failed = $true
        }
        if (-not $succeeds -and -not $failed) { throw "Failure path was not exercised" }
        $statusPath = Join-Path $root "exports\backup-manifests\backup-run-status-v2.json"
        if (-not (Test-Path -LiteralPath $statusPath -PathType Leaf)) {
            throw "Critical backup did not write its safe status record"
        }
        $status = Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
        $expectedStatus = if ($succeeds) { "ok" } else { "failed" }
        if ($status.status -ne $expectedStatus) {
            throw "Unexpected critical backup status: $($status.status)"
        }
        if (-not $succeeds -and $status.phase -ne "restic") {
            throw "Failure status did not identify the restic phase"
        }
        $statusText = Get-Content -LiteralPath $statusPath -Raw
        if ($statusText -match "test-secret|test-password") {
            throw "Critical backup status leaked a secret"
        }
        $leftovers = @(Get-ChildItem -LiteralPath (Join-Path $root "exports\backup-staging") -Directory)
        if ($leftovers.Count -ne 0) { throw "Plaintext snapshot session was not cleaned" }
    } finally {
        Remove-Item -LiteralPath $root -Recurse -Force
    }
}

$staleRoot = New-TestProject $true
try {
    $stale = Join-Path $staleRoot "exports\backup-staging\interrupted-session"
    New-Item -ItemType Directory -Path $stale -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $stale "plaintext.sql") -Value "sensitive"
    (Get-Item -LiteralPath $stale).LastWriteTimeUtc = (Get-Date).ToUniversalTime().AddHours(-4)
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        & powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $runner -ProjectRoot $staleRoot 2>$null | Out-Null
        $staleExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previousPreference }
    if ($staleExit -eq 0) { throw "Stale plaintext staging did not block backup" }
    if (-not (Test-Path -LiteralPath $stale -PathType Container)) { throw "Runner deleted stale staging without operator review" }
    $status = Get-Content -LiteralPath (Join-Path $staleRoot "exports\backup-manifests\backup-run-status-v2.json") -Raw | ConvertFrom-Json
    if ($status.status -ne "failed" -or $status.phase -ne "preflight") { throw "Stale staging failure was not reported safely" }
} finally {
    Remove-Item -LiteralPath $staleRoot -Recurse -Force
}

Write-Output "PASS: critical R2 runner cleans plaintext snapshots after success and failure"

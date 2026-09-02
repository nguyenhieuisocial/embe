param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$runner = Join-Path $projectRoot "scripts\backup\run-critical-r2.ps1"

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
        $leftovers = @(Get-ChildItem -LiteralPath (Join-Path $root "exports\backup-staging") -Directory)
        if ($leftovers.Count -ne 0) { throw "Plaintext snapshot session was not cleaned" }
    } finally {
        Remove-Item -LiteralPath $root -Recurse -Force
    }
}

Write-Output "PASS: critical R2 runner cleans plaintext snapshots after success and failure"

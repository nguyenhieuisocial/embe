param()

$ErrorActionPreference = "Stop"
$root = Join-Path $env:TEMP ("embe-snapshot-test-" + [guid]::NewGuid().ToString("N"))
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$python = Join-Path $projectRoot ".venv\Scripts\python.exe"
$script = Join-Path $projectRoot "scripts\backup\prepare-snapshots.ps1"
$scriptSource = Get-Content -LiteralPath $script -Raw
if (-not $scriptSource.Contains('Move-Item -LiteralPath $temporary -Destination $statusPath -Force')) {
    throw "Snapshot status must be replaced atomically"
}
$fixture = Join-Path $projectRoot "scripts\tests\create-sqlite-fixture.py"

try {
    foreach ($relative in @("babybuddy\data", "memos", "grocy\data")) {
        New-Item -ItemType Directory -Path (Join-Path $root "appdata\$relative") -Force | Out-Null
    }
    foreach ($db in @("babybuddy\data\db.sqlite3", "memos\memos_prod.db", "grocy\data\grocy.db")) {
        & $python $fixture (Join-Path $root "appdata\$db")
        if ($LASTEXITCODE -ne 0) { throw "Unable to create SQLite fixture" }
    }

    $outputRoot = Join-Path $root "exports\backup-staging"
    $secretDirectory = Join-Path $root "secrets"
    $toolDirectory = Join-Path $root "tools\bin"
    New-Item -ItemType Directory -Path $outputRoot, $secretDirectory, $toolDirectory -Force | Out-Null
    @(
        "SUPABASE_PROJECT_REF=test-project-ref"
        "SUPABASE_ACCESS_TOKEN=test-token"
    ) | Set-Content -LiteralPath (Join-Path $secretDirectory "supabase-backup.env") -Encoding UTF8
    $currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    & icacls $secretDirectory /inheritance:r /grant:r "*${currentSid}:(OI)(CI)F" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Unable to protect test secret directory" }

    $fakeSupabase = Join-Path $toolDirectory "supabase.ps1"
    @'
param([Parameter(ValueFromRemainingArguments = $true)] [string[]]$Arguments)
$fileIndex = [Array]::IndexOf($Arguments, "--file")
if ($fileIndex -lt 0) { throw "Missing --file" }
Set-Content -LiteralPath $Arguments[$fileIndex + 1] -Value "non-empty dump"
'@ | Set-Content -LiteralPath $fakeSupabase -Encoding UTF8

    $result = & powershell -NoProfile -ExecutionPolicy Bypass -File $script `
        -ProjectRoot $root -AppDataRoot (Join-Path $root "appdata") -OutputRoot $outputRoot `
        -PythonPath $python -SupabaseCliPath $fakeSupabase -SkipImmich | ConvertFrom-Json
    if ($result.status -ne "ok" -or $result.artifact_count -ne 5) { throw "Snapshot result is invalid" }
    $snapshotStatusPath = Join-Path $root "exports\backup-manifests\snapshot-run-status-v2.json"
    $snapshotStatus = Get-Content -LiteralPath $snapshotStatusPath -Raw | ConvertFrom-Json
    if ($snapshotStatus.status -ne "ok" -or $snapshotStatus.phase -ne "complete") {
        throw "Successful snapshot status is invalid"
    }
    $manifest = Get-Content -LiteralPath $result.manifest -Raw | ConvertFrom-Json
    if ($manifest.artifacts.Count -ne 5) { throw "Snapshot manifest is incomplete" }
    foreach ($artifact in $manifest.artifacts) {
        $path = Join-Path $result.session $artifact.name
        if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $artifact.sha256) {
            throw "Snapshot checksum mismatch: $($artifact.name)"
        }
    }
    foreach ($required in @("supabase-portal-schema.sql", "supabase-portal-data.sql")) {
        if (@($manifest.artifacts | Where-Object name -eq $required).Count -ne 1) { throw "Snapshot manifest missing $required" }
    }

    Remove-Item -LiteralPath $result.session -Recurse -Force
    $failingCli = Join-Path $toolDirectory "supabase-fail.ps1"
    'throw "simulated Supabase failure"' | Set-Content -LiteralPath $failingCli -Encoding UTF8
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        & powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $script `
            -ProjectRoot $root -AppDataRoot (Join-Path $root "appdata") -OutputRoot $outputRoot `
            -PythonPath $python -SupabaseCliPath $failingCli -SkipImmich 2>$null | Out-Null
        $failureExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($failureExitCode -eq 0) { throw "Expected Supabase snapshot failure" }
    if (@(Get-ChildItem -LiteralPath $outputRoot -Directory).Count -ne 0) { throw "Failed snapshot left plaintext staging behind" }
    $snapshotStatus = Get-Content -LiteralPath $snapshotStatusPath -Raw | ConvertFrom-Json
    if ($snapshotStatus.status -ne "failed" -or $snapshotStatus.phase -ne "supabase") {
        throw "Failed snapshot status did not identify the Supabase phase"
    }

    Write-Output "PASS: consistent SQLite/Supabase snapshots, manifest, and failure cleanup"
} finally {
    if (Test-Path -LiteralPath $root) {
        $resolved = [IO.Path]::GetFullPath($root)
        $temp = [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') + '\'
        if (-not ($resolved + '\').StartsWith($temp, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to remove path outside TEMP"
        }
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}

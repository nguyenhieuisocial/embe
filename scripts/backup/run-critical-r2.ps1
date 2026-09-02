param(
    [string]$ProjectRoot = "C:\EmBe",
    [double]$StagingMaxAgeHours = 3
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$envFile = Join-Path $ProjectRoot "infra\compose\storage-poc.env"
$passwordFile = Join-Path $ProjectRoot "secrets\restic-r2-password.txt"
$prepareScript = Join-Path $ProjectRoot "scripts\backup\prepare-snapshots.ps1"
$backupScript = Join-Path $ProjectRoot "scripts\backup\run-restic.ps1"
$restic = Join-Path $ProjectRoot "tools\bin\restic.exe"
$manifestDirectory = Join-Path $ProjectRoot "exports\backup-manifests"
$statusPath = Join-Path $manifestDirectory "backup-run-status-v2.json"
$phase = "preflight"
$startedUtc = (Get-Date).ToUniversalTime().ToString("o")

function Write-BackupStatus {
    param(
        [Parameter(Mandatory = $true)][string]$Status,
        [Parameter(Mandatory = $true)][string]$Phase,
        [string]$FailureType
    )

    New-Item -ItemType Directory -Path $manifestDirectory -Force | Out-Null
    $payload = [ordered]@{
        status = $Status
        phase = $Phase
        failure_type = $FailureType
        started_utc = $startedUtc
        finished_utc = (Get-Date).ToUniversalTime().ToString("o")
    } | ConvertTo-Json -Compress
    $temporary = "$statusPath.tmp"
    [IO.File]::WriteAllText($temporary, $payload, [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temporary -Destination $statusPath -Force
}

$snapshot = $null
try {
    foreach ($required in @($envFile, $passwordFile, $prepareScript, $backupScript, $restic)) {
        if (-not (Test-Path -LiteralPath $required)) { throw "Required backup path is missing: $required" }
    }
    $stagingDirectory = Join-Path $ProjectRoot "exports\backup-staging"
    $staleCutoff = (Get-Date).ToUniversalTime().AddHours(-$StagingMaxAgeHours)
    $staleStaging = @(Get-ChildItem -LiteralPath $stagingDirectory -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTimeUtc -lt $staleCutoff })
    if ($staleStaging.Count -gt 0) {
        throw "Stale plaintext backup staging requires operator review."
    }

    Get-Content -LiteralPath $envFile | Where-Object { $_ -and -not $_.StartsWith("#") } | ForEach-Object {
        $parts = $_ -split "=", 2
        [Environment]::SetEnvironmentVariable($parts[0], $parts[1], "Process")
    }

    foreach ($name in @("EMBE_R2_ACCOUNT_ID", "EMBE_R2_ACCESS_KEY_ID", "EMBE_R2_SECRET_ACCESS_KEY")) {
        if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
            throw "Required R2 setting is missing: $name"
        }
    }

    $env:AWS_ACCESS_KEY_ID = $env:EMBE_R2_ACCESS_KEY_ID
    $env:AWS_SECRET_ACCESS_KEY = $env:EMBE_R2_SECRET_ACCESS_KEY
    $env:AWS_DEFAULT_REGION = "auto"

    $phase = "snapshot"
    $snapshot = & powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $prepareScript -ProjectRoot $ProjectRoot | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or $snapshot.status -ne "ok") { throw "Application snapshot failed" }

    New-Item -ItemType Directory -Path $manifestDirectory -Force | Out-Null
    $manifestPath = Join-Path $manifestDirectory ((Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ") + ".json")
    $repository = "s3:https://$($env:EMBE_R2_ACCOUNT_ID).r2.cloudflarestorage.com/embe-backup/restic-critical"

    $phase = "restic"
    $backup = & powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $backupScript `
        -CodeConfigPath (Join-Path $ProjectRoot "infra") `
        -VaultPath (Join-Path $ProjectRoot "embe") `
        -AppDataPath $snapshot.session `
        -Repository $repository `
        -PasswordFile $passwordFile `
        -ResticPath $restic `
        -ManifestPath $manifestPath `
        -RequiredAppDataFiles "supabase-portal-schema.sql,supabase-portal-data.sql" `
        -Tag "embe-critical-r2" `
        -AllowR2Repository | ConvertFrom-Json

    if ($LASTEXITCODE -ne 0 -or $backup.status -ne "ok") { throw "Restic R2 backup failed" }

    Write-BackupStatus -Status "ok" -Phase "complete"
    [ordered]@{
        status = "ok"
        snapshot_artifacts = $snapshot.artifact_count
        backup_files = $backup.file_count
        snapshot_id = $backup.snapshot_id
        manifest = $backup.manifest
    } | ConvertTo-Json -Compress
} catch {
    Write-BackupStatus -Status "failed" -Phase $phase -FailureType $_.Exception.GetType().Name
    throw
} finally {
    if ($null -ne $snapshot -and -not [string]::IsNullOrWhiteSpace([string]$snapshot.session)) {
        $sessionPath = [IO.Path]::GetFullPath([string]$snapshot.session)
        $stagingRoot = [IO.Path]::GetFullPath((Join-Path $ProjectRoot "exports\backup-staging")).TrimEnd('\') + '\'
        if (-not ($sessionPath + '\').StartsWith($stagingRoot, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to remove snapshot outside backup staging"
        }
        if (Test-Path -LiteralPath $sessionPath) {
            Remove-Item -LiteralPath $sessionPath -Recurse -Force
        }
    }
}

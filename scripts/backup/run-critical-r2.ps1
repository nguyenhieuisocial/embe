param(
    [string]$ProjectRoot = "C:\EmBe"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$envFile = Join-Path $ProjectRoot "infra\compose\storage-poc.env"
$passwordFile = Join-Path $ProjectRoot "secrets\restic-r2-password.txt"
$prepareScript = Join-Path $ProjectRoot "scripts\backup\prepare-snapshots.ps1"
$backupScript = Join-Path $ProjectRoot "scripts\backup\run-restic.ps1"
$restic = Join-Path $ProjectRoot "tools\bin\restic.exe"

foreach ($required in @($envFile, $passwordFile, $prepareScript, $backupScript, $restic)) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Required backup path is missing: $required" }
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

$snapshot = $null
try {
    $snapshot = & powershell -NoProfile -ExecutionPolicy Bypass -File $prepareScript | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or $snapshot.status -ne "ok") { throw "Application snapshot failed" }

    $manifestDirectory = Join-Path $ProjectRoot "exports\backup-manifests"
    New-Item -ItemType Directory -Path $manifestDirectory -Force | Out-Null
    $manifestPath = Join-Path $manifestDirectory ((Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ") + ".json")
    $repository = "s3:https://$($env:EMBE_R2_ACCOUNT_ID).r2.cloudflarestorage.com/embe-backup/restic-critical"

    $backup = & powershell -NoProfile -ExecutionPolicy Bypass -File $backupScript `
        -CodeConfigPath (Join-Path $ProjectRoot "infra") `
        -VaultPath (Join-Path $ProjectRoot "embe") `
        -AppDataPath $snapshot.session `
        -Repository $repository `
        -PasswordFile $passwordFile `
        -ResticPath $restic `
        -ManifestPath $manifestPath `
        -Tag "embe-critical-r2" `
        -AllowR2Repository | ConvertFrom-Json

    if ($LASTEXITCODE -ne 0 -or $backup.status -ne "ok") { throw "Restic R2 backup failed" }

    [ordered]@{
        status = "ok"
        snapshot_artifacts = $snapshot.artifact_count
        backup_files = $backup.file_count
        snapshot_id = $backup.snapshot_id
        manifest = $backup.manifest
    } | ConvertTo-Json -Compress
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

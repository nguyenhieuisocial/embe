param(
    [Parameter(Mandatory = $true)]
    [string]$CodeConfigPath,

    [Parameter(Mandatory = $true)]
    [string]$VaultPath,

    [Parameter(Mandatory = $true)]
    [string]$AppDataPath,

    [Parameter(Mandatory = $true)]
    [string]$Repository,

    [Parameter(Mandatory = $true)]
    [string]$PasswordFile,

    [string]$Tag = "embe-backup",

    [string]$ResticPath,

    [string]$ManifestPath
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if ([string]::IsNullOrWhiteSpace($ResticPath)) {
    $ResticPath = Join-Path $projectRoot "tools\bin\restic.exe"
}
if ([string]::IsNullOrWhiteSpace($ManifestPath)) {
    $ManifestPath = Join-Path $projectRoot "exports\backup-manifest.json"
}

function Assert-RequiredValue {
    param(
        [string]$Name,
        [string]$Value
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        throw "$Name is required."
    }
}

function Assert-Directory {
    param(
        [string]$Name,
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        throw "Missing directory for ${Name}: ${Path}"
    }
}

function Assert-PasswordFile {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Password file is missing: $Path"
    }
    if ((Get-Item -LiteralPath $Path).Length -eq 0) {
        throw "Password file is empty: $Path"
    }
}

function Assert-LocalRepository {
    param(
        [string]$Path
    )

    if ($Path -match "^[A-Za-z]:[\\/]" -or $Path -match "^\\\\") {
        # Allow Windows local paths and UNC share paths for bounded restore-drill work.
    } elseif ($Path -match "^[a-zA-Z][a-zA-Z0-9+.-]*:") {
        throw "Cloud/remote repositories are blocked in bounded offline restore-drill task: $Path"
    }

    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Get-DirectoryManifest {
    param(
        [string]$Label,
        [string]$Path
    )

    $resolved = (Resolve-Path -LiteralPath $Path).Path
    $files = Get-ChildItem -LiteralPath $resolved -Recurse -File -ErrorAction Stop
    $fileEntries = @()
    foreach ($file in $files) {
        $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        $fileEntries += [ordered]@{
            relative_path = $file.FullName.Substring($resolved.Length).TrimStart([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
            name = $file.Name
            size_bytes = $file.Length
            sha256 = $hash
        }
    }

    $totalBytes = 0L
    foreach ($entry in $fileEntries) {
        $totalBytes += [int64]$entry.size_bytes
    }

    [ordered]@{
        label = $Label
        source_path = $resolved
        file_count = $fileEntries.Count
        total_bytes = $totalBytes
        files = @($fileEntries)
    }
}

function Invoke-Restic {
    param(
        [string[]]$Arguments
    )

    if (-not (Test-Path -LiteralPath $ResticPath)) {
        throw "Restic binary not found: $ResticPath"
    }

    $command = $Arguments -join " "
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $stdout = & $ResticPath @Arguments 2>&1
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    if ($exitCode -ne 0) {
        $text = if ($stdout) { ($stdout | ForEach-Object { $_.ToString() }) -join "`n" } else { "<no output>" }
        throw "restic failed with exit code $exitCode for: $command`n$text"
    }

    if ($stdout -is [string]) {
        return @($stdout)
    }
    return @($stdout)
}

function Get-ResticVersion {
    try {
        return (& $ResticPath --version 2>$null | Select-Object -First 1).ToString().Trim()
    } catch {
        return "unknown"
    }
}

function Get-SnapshotIdFromOutput {
    param(
        [string[]]$Lines
    )

    foreach ($line in $Lines) {
        try {
            $obj = $line | ConvertFrom-Json -ErrorAction Stop
        } catch {
            continue
        }

        $properties = @($obj.PSObject.Properties.Name)
        if ($properties -contains "summary" -and $null -ne $obj.summary) {
            $summaryProperties = @($obj.summary.PSObject.Properties.Name)
            if ($summaryProperties -contains "snapshot_id" -and $obj.summary.snapshot_id) {
                return $obj.summary.snapshot_id
            }
            if ($summaryProperties -contains "id" -and $obj.summary.id) {
                return $obj.summary.id
            }
        }
        if ($properties -contains "snapshot_id" -and $obj.snapshot_id) {
            return $obj.snapshot_id
        }
        if ($properties -contains "id" -and $properties -contains "time" -and $obj.id -and $obj.time) {
            return $obj.id
        }
    }

    return $null
}

$requiredParams = @(
    @{ Name = "CodeConfigPath"; Value = $CodeConfigPath },
    @{ Name = "VaultPath"; Value = $VaultPath },
    @{ Name = "AppDataPath"; Value = $AppDataPath },
    @{ Name = "Repository"; Value = $Repository },
    @{ Name = "PasswordFile"; Value = $PasswordFile }
)

foreach ($item in $requiredParams) {
    Assert-RequiredValue -Name $item.Name -Value $item.Value
}

Assert-Directory -Name "CodeConfigPath" -Path $CodeConfigPath
Assert-Directory -Name "VaultPath" -Path $VaultPath
Assert-Directory -Name "AppDataPath" -Path $AppDataPath
Assert-PasswordFile -Path $PasswordFile
Assert-LocalRepository -Path $Repository

$manifestDirectory = Split-Path -Parent $ManifestPath
if (-not (Test-Path -LiteralPath $manifestDirectory)) {
    New-Item -ItemType Directory -Path $manifestDirectory -Force | Out-Null
}

$sourceGroups = @(
    @{ label = "code"; path = (Resolve-Path -LiteralPath $CodeConfigPath).Path },
    @{ label = "vault"; path = (Resolve-Path -LiteralPath $VaultPath).Path },
    @{ label = "appdata"; path = (Resolve-Path -LiteralPath $AppDataPath).Path }
)

$snapshots = foreach ($source in $sourceGroups) {
    Get-DirectoryManifest -Label $source.label -Path $source.path
}

$initArguments = @("-r", $Repository, "-p", $PasswordFile, "init")
try {
    $null = Invoke-Restic -Arguments $initArguments
} catch {
    if ($_ -notmatch "already exists" -and $_ -notmatch "config file already exists") {
        throw
    }
}

$backupArguments = @(
    "-r", $Repository,
    "-p", $PasswordFile,
    "backup",
    "--json"
)
if (-not [string]::IsNullOrWhiteSpace($Tag)) {
    $backupArguments += @("--tag", $Tag)
}
$backupArguments += @(
    $CodeConfigPath,
    $VaultPath,
    $AppDataPath
)

$backupOutput = Invoke-Restic -Arguments $backupArguments
$snapshotId = Get-SnapshotIdFromOutput -Lines $backupOutput

if ([string]::IsNullOrWhiteSpace($snapshotId)) {
    throw "Unable to parse snapshot id from restic backup output."
}

$report = [ordered]@{
    backup_id = [guid]::NewGuid().ToString()
    created_utc = (Get-Date).ToUniversalTime().ToString("o")
    repository = $Repository
    snapshot_id = $snapshotId
    tag = $Tag
    restic_version = Get-ResticVersion
    sources = @($snapshots)
}

$report | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $ManifestPath

$totalFiles = 0
foreach ($source in $snapshots) {
    $totalFiles += [int]$source.file_count
}

[ordered]@{
    status = "ok"
    manifest = $ManifestPath
    backup_id = $report.backup_id
    snapshot_id = $snapshotId
    source_count = $snapshots.Count
    file_count = $totalFiles
} | ConvertTo-Json -Depth 8

param(
    [Parameter(Mandatory = $true)]
    [string]$ManifestPath,

    [Parameter(Mandatory = $true)]
    [string]$PasswordFile,

    [Parameter(Mandatory = $true)]
    [string]$RestoreRoot,

    [string]$ResticPath,

    [switch]$AllowR2Repository
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ([string]::IsNullOrWhiteSpace($ResticPath)) {
    $projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
    $ResticPath = Join-Path $projectRoot "tools\bin\restic.exe"
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

Assert-RequiredValue -Name "ManifestPath" -Value $ManifestPath
Assert-RequiredValue -Name "PasswordFile" -Value $PasswordFile
Assert-RequiredValue -Name "RestoreRoot" -Value $RestoreRoot

if (-not (Test-Path -LiteralPath $ManifestPath)) {
    throw "Manifest is missing: $ManifestPath"
}
if (-not (Test-Path -LiteralPath $PasswordFile -PathType Leaf)) {
    throw "Password file is missing: $PasswordFile"
}
if ((Get-Item -LiteralPath $PasswordFile).Length -eq 0) {
    throw "Password file is empty: $PasswordFile"
}

$manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
if (-not $manifest.snapshot_id) {
    throw "Manifest missing snapshot_id: $ManifestPath"
}
if (-not $manifest.repository) {
    throw "Manifest missing repository path: $ManifestPath"
}
$repositoryPath = [string]$manifest.repository
if ($repositoryPath -match "^[A-Za-z]:[\\/]" -or $repositoryPath -match "^\\\\") {
    # Local Windows drive or UNC path.
} elseif ($repositoryPath -match "^[a-zA-Z][a-zA-Z0-9+.-]*:") {
    if (-not $AllowR2Repository) {
        throw "Cloud/remote repositories are blocked unless AllowR2Repository is explicit: $($manifest.repository)"
    }
    if ($repositoryPath -notmatch '^s3:https://[0-9a-f]{32}\.r2\.cloudflarestorage\.com/embe-backup/restic-critical/?$') {
        throw "Remote repository is outside the approved EmBe R2 prefix: $($manifest.repository)"
    }
}
if ($repositoryPath -notmatch '^[a-zA-Z][a-zA-Z0-9+.-]*:' -and -not (Test-Path -LiteralPath $repositoryPath -PathType Container)) {
    throw "Repository is missing: $($manifest.repository)"
}

$requiredAppDataFiles = @()
if ($manifest.PSObject.Properties.Name -contains "required_appdata_files") {
    $requiredAppDataFiles = @($manifest.required_appdata_files)
    $appDataSources = @($manifest.sources | Where-Object { $_.label -eq "appdata" })
    if ($appDataSources.Count -ne 1) { throw "Manifest must contain exactly one appdata source." }
    foreach ($requiredFile in $requiredAppDataFiles) {
        $name = [string]$requiredFile
        if ([string]::IsNullOrWhiteSpace($name) -or $name -ne [IO.Path]::GetFileName($name)) {
            throw "Unsafe required appdata filename in manifest."
        }
        $matches = @($appDataSources[0].files | Where-Object { $_.relative_path -eq $name })
        if ($matches.Count -ne 1) { throw "Manifest is missing required appdata file: $name" }
    }
}

if (-not (Test-Path -LiteralPath $RestoreRoot)) {
    New-Item -ItemType Directory -Path $RestoreRoot -Force | Out-Null
}

$restoreSession = Join-Path $RestoreRoot ("restic-drill-" + (Get-Date).ToString("yyyyMMddTHHmmssfff"))
New-Item -ItemType Directory -Path $restoreSession -Force | Out-Null

$restoreCandidateTarget = Join-Path $restoreSession "restore"
New-Item -ItemType Directory -Path $restoreCandidateTarget -Force | Out-Null

$mismatches = @()
$used = New-Object 'System.Collections.Generic.HashSet[string]'

foreach ($source in $manifest.sources) {
    $label = [string]$source.label
    if ($label -notmatch '^[a-zA-Z0-9._-]+$') {
        throw "Unsafe source label in manifest: $label"
    }

    $sourceTarget = Join-Path $restoreCandidateTarget $label
    New-Item -ItemType Directory -Path $sourceTarget -Force | Out-Null

    $snapshotPath = ([string]$source.source_path).Replace('\', '/').Replace(':', '').TrimStart('/')
    if ([string]::IsNullOrWhiteSpace($snapshotPath)) {
        throw "Manifest source path is empty for: $label"
    }
    $snapshotReference = "$($manifest.snapshot_id):/$snapshotPath"

    $restoreArgs = @(
        "restore",
        $snapshotReference,
        "--json",
        "--verify",
        "--target",
        $sourceTarget,
        "-r",
        $manifest.repository,
        "-p",
        $PasswordFile
    )
    $null = Invoke-Restic -Arguments $restoreArgs

    $resolvedSourceTarget = [System.IO.Path]::GetFullPath($sourceTarget).TrimEnd('\') + '\'
    foreach ($file in $source.files) {
        $candidatePath = Join-Path $sourceTarget ([string]$file.relative_path)
        $resolvedCandidate = [System.IO.Path]::GetFullPath($candidatePath)
        if (-not $resolvedCandidate.StartsWith($resolvedSourceTarget, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Unsafe relative path in manifest: $($file.relative_path)"
        }
        if (-not (Test-Path -LiteralPath $resolvedCandidate -PathType Leaf)) {
            $mismatches += "missing:$label/$($file.relative_path)"
            continue
        }

        $hash = (Get-FileHash -LiteralPath $resolvedCandidate -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($hash -ne ([string]$file.sha256).ToLowerInvariant()) {
            $mismatches += "checksum-mismatch:$label/$($file.relative_path)"
            continue
        }
        $used.Add($resolvedCandidate) | Out-Null
    }
}

$verifyOk = ($mismatches.Count -eq 0)
$reportPath = Join-Path $restoreSession ("restore-report.json")
$report = [ordered]@{
    status = if ($verifyOk) { "pass" } else { "fail" }
    manifest = $ManifestPath
    snapshot_id = $manifest.snapshot_id
    repository = $manifest.repository
    restore_root = $restoreCandidateTarget
    total_expected_files = @($manifest.sources | ForEach-Object { $_.files } | ForEach-Object { $_ }).Count
    restored_files_found = $used.Count
    required_appdata_files = @($requiredAppDataFiles)
    mismatches = @($mismatches)
    verified_at = (Get-Date).ToUniversalTime().ToString("o")
}

$report | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $reportPath

if (-not $verifyOk) {
    throw ([string]::Join("`n", $mismatches))
}

[ordered]@{
    status = "pass"
    report = $reportPath
    restore_session = $restoreSession
    restored = $used.Count
} | ConvertTo-Json -Depth 8

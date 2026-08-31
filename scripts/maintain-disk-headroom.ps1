[CmdletBinding()]
param(
    [string]$ProjectRoot = "C:\EmBe",
    [string]$StatusPath = "",
    [ValidateRange(25, 60)]
    [double]$TargetFreePercent = 27,
    [ValidateRange(15, 40)]
    [double]$MinimumFreePercent = 25,
    [ValidateRange(-1, 100)]
    [double]$FreePercentOverride = -1,
    [switch]$SkipActions
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ($MinimumFreePercent -gt $TargetFreePercent) { throw "Minimum free percent exceeds target" }
if (-not $StatusPath) { $StatusPath = Join-Path $ProjectRoot "data\status\disk-maintenance.json" }

function Get-FreePercent {
    if ($FreePercentOverride -ge 0) { return $FreePercentOverride }
    $driveName = ([IO.Path]::GetPathRoot($ProjectRoot)).TrimEnd(':', '\')
    $drive = Get-PSDrive -Name $driveName
    return 100 * $drive.Free / ($drive.Used + $drive.Free)
}

$before = Get-FreePercent
$maintenanceAttempted = $false
$builderCachePruned = $false
$filesystemTrimmed = $false

if ($before -lt $TargetFreePercent -and -not $SkipActions) {
    $maintenanceAttempted = $true

    if (Test-Path -LiteralPath "\\.\pipe\dockerDesktopLinuxEngine") {
        & docker builder prune --force --filter "until=168h" *> $null
        $builderCachePruned = $LASTEXITCODE -eq 0
    }

    & wsl.exe -d docker-desktop -u root -- fstrim -av *> $null
    $filesystemTrimmed = $LASTEXITCODE -eq 0
}

$after = Get-FreePercent
$status = if ($after -ge $MinimumFreePercent) { "pass" } else { "warning" }
$report = [ordered]@{
    schema_version = 1
    generated_at = [DateTimeOffset]::UtcNow.ToString("o")
    status = $status
    free_percent_before = [math]::Round($before, 2)
    free_percent_after = [math]::Round($after, 2)
    target_percent = $TargetFreePercent
    minimum_percent = $MinimumFreePercent
    target_met = $after -ge $TargetFreePercent
    maintenance_attempted = $maintenanceAttempted
    builder_cache_pruned = $builderCachePruned
    filesystem_trimmed = $filesystemTrimmed
    privacy = "No path, file name, image, volume, container output, or family content is included."
}

[IO.Directory]::CreateDirectory((Split-Path $StatusPath -Parent)) | Out-Null
$temporary = "$StatusPath.tmp"
[IO.File]::WriteAllText($temporary, ($report | ConvertTo-Json -Depth 4), [Text.UTF8Encoding]::new($false))
Move-Item -LiteralPath $temporary -Destination $StatusPath -Force
$report | ConvertTo-Json -Depth 4 -Compress
exit $(if ($status -eq "pass") { 0 } else { 2 })

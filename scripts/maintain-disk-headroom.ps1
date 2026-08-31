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
    [switch]$SkipActions,
    [string]$TempPath = $env:TEMP,
    [switch]$SkipSystemActions
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
$packageCachesCleared = $false
$staleWslSwapsRemoved = 0
$staleWslSwapBytes = [long]0

function Remove-StaleWslSwaps([string]$RootPath) {
    $removed = 0
    $bytes = [long]0
    if (-not (Test-Path -LiteralPath $RootPath -PathType Container)) { return @($removed, $bytes) }
    $root = Get-Item -LiteralPath $RootPath -Force
    if ($root.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Temporary root must not be a reparse point" }
    $rootFull = [IO.Path]::GetFullPath($root.FullName).TrimEnd('\')
    $cutoff = [DateTime]::UtcNow.AddHours(-2)
    foreach ($directory in Get-ChildItem -LiteralPath $rootFull -Directory -Force -ErrorAction SilentlyContinue) {
        if ($directory.Name -notmatch '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$') { continue }
        if ($directory.Attributes -band [IO.FileAttributes]::ReparsePoint) { continue }
        if ($directory.Parent.FullName.TrimEnd('\') -ne $rootFull) { continue }
        $entries = @(Get-ChildItem -LiteralPath $directory.FullName -Force -ErrorAction SilentlyContinue)
        if ($entries.Count -ne 1 -or $entries[0].PSIsContainer -or $entries[0].Name -ne 'swap.vhdx') { continue }
        $swap = $entries[0]
        if ($swap.LastWriteTimeUtc -gt $cutoff -or ($swap.Attributes -band [IO.FileAttributes]::ReparsePoint)) { continue }
        try {
            $stream = [IO.File]::Open($swap.FullName, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::None)
            $stream.Dispose()
        } catch { continue }
        $length = [long]$swap.Length
        [IO.File]::Delete($swap.FullName)
        [IO.Directory]::Delete($directory.FullName, $false)
        $removed++
        $bytes += $length
    }
    return @($removed, $bytes)
}

if ($before -lt $TargetFreePercent -and -not $SkipActions) {
    $maintenanceAttempted = $true

    $swapCleanup = @(Remove-StaleWslSwaps $TempPath)
    $staleWslSwapsRemoved = [int]$swapCleanup[0]
    $staleWslSwapBytes = [long]$swapCleanup[1]

    if (-not $SkipSystemActions -and (Test-Path -LiteralPath "\\.\pipe\dockerDesktopLinuxEngine")) {
        & docker builder prune --force --filter "until=168h" *> $null
        $builderCachePruned = $LASTEXITCODE -eq 0
    }

    if (-not $SkipSystemActions) {
        & wsl.exe -d docker-desktop -u root -- fstrim -av *> $null
        $filesystemTrimmed = $LASTEXITCODE -eq 0
    }

    if (-not $SkipSystemActions -and (Get-FreePercent) -lt $TargetFreePercent) {
        $npmAvailable = $null -ne (Get-Command npm -ErrorAction SilentlyContinue)
        $npmCleared = $false
        if ($npmAvailable) {
            $previousErrorActionPreference = $ErrorActionPreference
            try {
                $ErrorActionPreference = "Continue"
                & npm cache clean --force *> $null
                $npmCleared = $LASTEXITCODE -eq 0
            } finally {
                $ErrorActionPreference = $previousErrorActionPreference
            }
        }

        $python = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
        $pipCleared = $false
        if (Test-Path -LiteralPath $python -PathType Leaf) {
            $previousErrorActionPreference = $ErrorActionPreference
            try {
                $ErrorActionPreference = "Continue"
                & $python -m pip cache purge *> $null
                $pipCleared = $LASTEXITCODE -eq 0
            } finally {
                $ErrorActionPreference = $previousErrorActionPreference
            }
        }
        $packageCachesCleared = $npmCleared -or $pipCleared
    }
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
    package_caches_cleared = $packageCachesCleared
    stale_wsl_swaps_removed = $staleWslSwapsRemoved
    stale_wsl_swap_gib_reclaimed = [math]::Round($staleWslSwapBytes / 1GB, 2)
    privacy = "No path, file name, image, volume, container output, or family content is included."
}

[IO.Directory]::CreateDirectory((Split-Path $StatusPath -Parent)) | Out-Null
$temporary = "$StatusPath.tmp"
[IO.File]::WriteAllText($temporary, ($report | ConvertTo-Json -Depth 4), [Text.UTF8Encoding]::new($false))
Move-Item -LiteralPath $temporary -Destination $StatusPath -Force
$report | ConvertTo-Json -Depth 4 -Compress
exit $(if ($status -eq "pass") { 0 } else { 2 })

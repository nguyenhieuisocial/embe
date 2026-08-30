param(
    [string]$MediaPath
)

$minimumFreePercent = 25

function Get-MediaStorageReadiness {
    param(
        [string]$MediaPath,
        [string]$ResolvedPath,
        [string]$Drive,
        [double]$FreePercent
    )

    if ([string]::IsNullOrWhiteSpace($MediaPath)) {
        return [pscustomobject]@{
            ready      = $false
            reason     = "missing-media-path"
            path       = [string]::Empty
            drive      = [string]::Empty
            freePercent = 0
        }
    }

    if ([string]::IsNullOrWhiteSpace($ResolvedPath)) {
        return [pscustomobject]@{
            ready      = $false
            reason     = "media-path-unresolvable"
            path       = $MediaPath
            drive      = [string]::Empty
            freePercent = 0
        }
    }

    if ([string]::IsNullOrWhiteSpace($Drive)) {
        return [pscustomobject]@{
            ready      = $false
            reason     = "invalid-drive"
            path       = $ResolvedPath
            drive      = [string]::Empty
            freePercent = 0
        }
    }

    if ($Drive -ieq "C") {
        return [pscustomobject]@{
            ready      = $false
            reason     = "system-drive"
            path       = $ResolvedPath
            drive      = $Drive
            freePercent = $FreePercent
        }
    }

    if ($FreePercent -lt $minimumFreePercent) {
        return [pscustomobject]@{
            ready      = $false
            reason     = "insufficient-free-space"
            path       = $ResolvedPath
            drive      = $Drive
            freePercent = $FreePercent
        }
    }

    return [pscustomobject]@{
        ready       = $true
        reason      = "ok"
        path        = $ResolvedPath
        drive       = $Drive
        freePercent = $FreePercent
    }
}

function Get-MediaStoragePathInfo {
    param([string]$Path)

    try {
        $item = Get-Item -LiteralPath $Path -ErrorAction Stop
    } catch {
        return @{ ResolvedPath = $null; Drive = $null; FreePercent = 0 }
    }

    $resolved = $item.FullName

    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        $target = $item.Target
        if ($target) {
            if ($target -is [array] -and $target.Length -gt 0) {
                $target = $target[0]
            }
            if (-not [string]::IsNullOrWhiteSpace($target)) {
                try {
                    if ([System.IO.Path]::IsPathRooted($target)) {
                        $resolved = (Resolve-Path -LiteralPath $target -ErrorAction Stop).Path
                    } else {
                        $base = Split-Path -Path $item.FullName -Parent
                        $resolved = (Resolve-Path -LiteralPath (Join-Path $base $target) -ErrorAction Stop).Path
                    }
                } catch {
                    # keep original path when target cannot be resolved
                }
            }
        }
    }

    $root = [System.IO.Path]::GetPathRoot($resolved)
    if ([string]::IsNullOrWhiteSpace($root)) {
        return @{ ResolvedPath = $resolved; Drive = $null; FreePercent = 0 }
    }

    $drive = $root.TrimEnd('\').TrimEnd(':').ToUpperInvariant()
    try {
        $driveInfo = Get-PSDrive -Name $drive -ErrorAction Stop
    } catch {
        return @{ ResolvedPath = $resolved; Drive = $null; FreePercent = 0 }
    }

    $total = [double]($driveInfo.Free + $driveInfo.Used)
    if ($total -le 0) {
        $freePercent = 0
    } else {
        $freePercent = [Math]::Round(($driveInfo.Free / $total) * 100, 2)
    }

    return @{
        ResolvedPath = $resolved
        Drive = $drive
        FreePercent = $freePercent
    }
}

$pathInfo = Get-MediaStoragePathInfo -Path $MediaPath

$result = Get-MediaStorageReadiness -MediaPath $MediaPath `
    -ResolvedPath $pathInfo.ResolvedPath `
    -Drive $pathInfo.Drive `
    -FreePercent $pathInfo.FreePercent

$output = [pscustomobject]@{
    ready = $result.ready
    reason = $result.reason
    path = $result.path
    drive = $result.drive
    freePercent = [double]$result.freePercent
}

$output | ConvertTo-Json -Depth 3

if ($output.ready) {
    exit 0
}
exit 1

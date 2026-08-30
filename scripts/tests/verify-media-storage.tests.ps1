param()

$scriptPath = Join-Path $PSScriptRoot '..\verify-media-storage.ps1'
$failed = 0
$total = 0

function Assert-Equal {
    param(
        [Parameter(Mandatory)] [string]$Name,
        $Expected,
        [Parameter(Mandatory)] $Actual
    )
    $script:total++
    if ((($null -eq $Expected) -and ($null -ne $Actual)) -or (($null -ne $Expected) -and ($null -eq $Actual)) -or ($Expected -ne $Actual)) {
        Write-Error "$Name`: expected '$Expected', got '$Actual'"
        $script:failed++
    } else {
        Write-Host "PASS: $Name" -ForegroundColor Green
    }
}

Assert-Equal "Production script file exists" $true (Test-Path $scriptPath)
if (-not (Test-Path $scriptPath)) {
    Write-Host "Expected RED before implementation: verify-media-storage.ps1 is missing." -ForegroundColor Red
    exit 1
}

. $scriptPath

function Invoke-VerifyMediaStorage {
    param([string]$MediaPath)
    if ([string]::IsNullOrWhiteSpace($MediaPath)) {
        $json = & powershell -NoProfile -ExecutionPolicy Bypass -File $scriptPath 2>$null
    } else {
        $json = & powershell -NoProfile -ExecutionPolicy Bypass -File $scriptPath -MediaPath $MediaPath 2>$null
    }
    $code = $LASTEXITCODE
    [pscustomobject]@{
        ExitCode = $code
        JsonText = $json
        Output = if ($json) { $json | ConvertFrom-Json } else { $null }
    }
}

$cases = @(
    @{
        Name = "Missing path fails"
        Report = Get-MediaStorageReadiness -MediaPath $null -ResolvedPath $null -Drive $null -FreePercent 0
        ExpectReady = $false
        ExpectReason = "missing-media-path"
        ExpectPath = [string]::Empty
        ExpectDrive = [string]::Empty
        ExpectFreePercent = 0
    },
    @{
        Name = "Unresolvable path fails"
        Report = Get-MediaStorageReadiness -MediaPath "Z:\__not_exist__" -ResolvedPath $null -Drive $null -FreePercent 0
        ExpectReady = $false
        ExpectReason = "media-path-unresolvable"
        ExpectPath = "Z:\__not_exist__"
        ExpectDrive = [string]::Empty
        ExpectFreePercent = 0
    },
    @{
        Name = "System drive is rejected"
        Report = Get-MediaStorageReadiness -MediaPath "C:\temp" -ResolvedPath "C:\temp" -Drive "C" -FreePercent 99
        ExpectReady = $false
        ExpectReason = "system-drive"
        ExpectPath = "C:\temp"
        ExpectDrive = "C"
        ExpectFreePercent = 99
    },
    @{
        Name = "Low free space is rejected"
        Report = Get-MediaStorageReadiness -MediaPath "D:\media" -ResolvedPath "D:\media" -Drive "D" -FreePercent 10
        ExpectReady = $false
        ExpectReason = "insufficient-free-space"
        ExpectPath = "D:\media"
        ExpectDrive = "D"
        ExpectFreePercent = 10
    },
    @{
        Name = "Healthy path passes"
        Report = Get-MediaStorageReadiness -MediaPath "D:\media" -ResolvedPath "D:\media" -Drive "D" -FreePercent 42
        ExpectReady = $true
        ExpectReason = "ok"
        ExpectPath = "D:\media"
        ExpectDrive = "D"
        ExpectFreePercent = 42
    }
)

$junctionRoot = Join-Path $env:TEMP ("verify-media-storage-junction-" + [guid]::NewGuid().ToString())
$junctionTarget = Join-Path $junctionRoot "target"
$junctionLink = Join-Path $junctionRoot "media-link"

try {
    New-Item -ItemType Directory -Path $junctionTarget -Force | Out-Null
    New-Item -ItemType Junction -Path $junctionLink -Value $junctionTarget -Force | Out-Null

    $pathInfoFromJunction = Get-MediaStoragePathInfo -Path $junctionLink
    Assert-Equal "PathInfo follows reparse target path" $junctionTarget $pathInfoFromJunction.ResolvedPath
} finally {
    if (Test-Path $junctionRoot) {
        $resolvedJunctionRoot = [System.IO.Path]::GetFullPath($junctionRoot)
        $resolvedTempRoot = [System.IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') + '\'
        if (-not $resolvedJunctionRoot.StartsWith($resolvedTempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to clean a test path outside the temporary directory"
        }
        Remove-Item -LiteralPath $resolvedJunctionRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}

foreach ($case in $cases) {
    Assert-Equal "$($case.Name): ready" $case.ExpectReady $case.Report.ready
    Assert-Equal "$($case.Name): reason" $case.ExpectReason $case.Report.reason
    Assert-Equal "$($case.Name): path" $case.ExpectPath $case.Report.path
    Assert-Equal "$($case.Name): drive" $case.ExpectDrive $case.Report.drive
    Assert-Equal "$($case.Name): freePercent" $case.ExpectFreePercent $case.Report.freePercent
}

$resultMissing = Invoke-VerifyMediaStorage -MediaPath $null
Assert-Equal "Script missing-path exit code" 1 $resultMissing.ExitCode
Assert-Equal "Script missing-path reason" "missing-media-path" $resultMissing.Output.reason

$resultUnresolvable = Invoke-VerifyMediaStorage -MediaPath "Z:\__not_exist__"
Assert-Equal "Script unresolvable-path exit code" 1 $resultUnresolvable.ExitCode
Assert-Equal "Script unresolvable-path reason" "media-path-unresolvable" $resultUnresolvable.Output.reason

if ($failed -gt 0) {
    Write-Host "`nFAIL: $failed of $total assertions failed." -ForegroundColor Red
    exit 1
}

Write-Host "`nPASS: All $total assertions passed." -ForegroundColor Green
exit 0

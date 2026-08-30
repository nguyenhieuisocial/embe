$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$scriptPath = Join-Path $projectRoot "scripts\verify-toolchain.ps1"
$pwsh = Join-Path $PSHOME "pwsh.exe"

if (-not (Test-Path -LiteralPath $scriptPath)) {
    throw "verify-toolchain.ps1 is missing"
}

function Invoke-ToolchainCheck([double]$MinimumFreeGB) {
    $output = & $pwsh -NoProfile -File $scriptPath -MinimumFreeGB $MinimumFreeGB -Json 2>&1
    $exitCode = $LASTEXITCODE
    $json = ($output | Out-String).Trim() | ConvertFrom-Json

    [pscustomobject]@{
        ExitCode = $exitCode
        Result = $json
    }
}

$healthy = Invoke-ToolchainCheck -MinimumFreeGB 100
if ($healthy.ExitCode -ne 0) { throw "Expected healthy toolchain to exit 0" }
if (-not $healthy.Result.ready) { throw "Expected ready=true" }
if (-not $healthy.Result.docker.running) { throw "Expected Docker server to be running" }
if (($healthy.Result.tools | Where-Object { -not $_.installed }).Count -ne 0) {
    throw "Expected every required tool to be installed"
}

$insufficientDisk = Invoke-ToolchainCheck -MinimumFreeGB 100000
if ($insufficientDisk.ExitCode -eq 0) { throw "Expected impossible disk threshold to fail" }
if ($insufficientDisk.Result.ready) { throw "Expected ready=false for insufficient disk" }
if ($insufficientDisk.Result.disk.passed) { throw "Expected disk check to fail" }

Write-Output "verify-toolchain tests passed"

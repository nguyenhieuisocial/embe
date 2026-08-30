[CmdletBinding()]
param(
    [string]$ProjectRoot = "C:\EmBe",
    [string]$HealthFixture = "",
    [string]$HealthOutputPath = "",
    [string]$OutputPath = "",
    [switch]$SkipContractTests
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$scriptEngine = (Get-Process -Id $PID).Path

$healthScript = Join-Path $ProjectRoot "scripts\health\health-audit.ps1"
$healthOutput = if ($HealthOutputPath) { $HealthOutputPath } else { Join-Path $ProjectRoot "data\status\system-health.json" }
$arguments = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $healthScript, "-ProjectRoot", $ProjectRoot, "-OutputPath", $healthOutput)
if ($HealthFixture) { $arguments += @("-FixturePath", $HealthFixture) }
$null = & $scriptEngine @arguments
$healthExit = $LASTEXITCODE

$contracts = [Collections.Generic.List[object]]::new()
if (-not $SkipContractTests) {
    $commands = @(
        @{ name = "core_compose"; file = "scripts\tests\verify-core-compose.tests.ps1" },
        @{ name = "snapshot_contract"; file = "scripts\tests\prepare-snapshots.tests.ps1" },
        @{ name = "restore_contract"; file = "scripts\tests\restore-drill.tests.ps1" }
    )
    foreach ($command in $commands) {
        $previousPreference = $ErrorActionPreference
        $ErrorActionPreference = "SilentlyContinue"
        $contractOutput = & $scriptEngine -NoProfile -ExecutionPolicy Bypass -File (Join-Path $ProjectRoot $command.file) 2>&1
        $contractExit = $LASTEXITCODE
        $ErrorActionPreference = $previousPreference
        $contracts.Add([ordered]@{ id = $command.name; status = $(if ($contractExit -eq 0) { "pass" } else { "critical" }) })
    }
}

$blocked = $healthExit -ne 0 -or @($contracts | Where-Object status -eq "critical").Count -gt 0
$report = [ordered]@{
    schema_version = 1
    generated_at = [DateTimeOffset]::UtcNow.ToString("o")
    status = $(if ($blocked) { "blocked" } else { "pass" })
    health_report = $healthOutput
    contracts = $contracts
    rule = "No update may proceed when this report is blocked."
}
$evidenceDirectory = Join-Path $ProjectRoot "data\evidence"
New-Item -ItemType Directory $evidenceDirectory -Force | Out-Null
$path = if ($OutputPath) { $OutputPath } else { Join-Path $evidenceDirectory "update-preflight.json" }
[IO.Directory]::CreateDirectory((Split-Path $path -Parent)) | Out-Null
[IO.File]::WriteAllText($path, ($report | ConvertTo-Json -Depth 6), [Text.UTF8Encoding]::new($false))
$report | ConvertTo-Json -Depth 6 -Compress
if ($blocked) { exit 2 }
exit 0

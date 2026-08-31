[CmdletBinding()]
param(
    [string]$ProjectRoot = "C:\EmBe",
    [string]$HealthReport = "",
    [string]$DrillEvidence = "",
    [string]$OutputPath = "",
    [string]$NowUtc = "",
    [double]$RequiredDays = 7
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Convert-ToDateTimeOffset([object]$Value) {
    if ($Value -is [DateTimeOffset]) { return $Value }
    if ($Value -is [DateTime]) { return [DateTimeOffset]::new($Value) }
    return [DateTimeOffset]::Parse(
        [string]$Value,
        [Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::RoundtripKind
    )
}

if (-not $HealthReport) { $HealthReport = Join-Path $ProjectRoot "data\status\system-health.json" }
if (-not $DrillEvidence) { $DrillEvidence = Join-Path $ProjectRoot "data\evidence\failure-drills.json" }
if (-not $OutputPath) { $OutputPath = Join-Path $ProjectRoot "data\evidence\soak.json" }

$now = if ($NowUtc) { Convert-ToDateTimeOffset $NowUtc } else { [DateTimeOffset]::UtcNow }
if (-not (Test-Path -LiteralPath $HealthReport -PathType Leaf)) {
    throw "Health report is missing"
}

$health = Get-Content -LiteralPath $HealthReport -Raw | ConvertFrom-Json
$healthy = [string]$health.status -eq "pass"
$previous = if (Test-Path -LiteralPath $OutputPath -PathType Leaf) {
    Get-Content -LiteralPath $OutputPath -Raw | ConvertFrom-Json
} else { $null }

$failedSamples = if ($previous -and $previous.failed_samples) { [int]$previous.failed_samples } else { 0 }
$healthySamples = if ($previous -and $previous.healthy_samples) { [int]$previous.healthy_samples } else { 0 }
$startedAt = if ($previous -and $previous.started_at) { Convert-ToDateTimeOffset $previous.started_at } else { $null }
$lastFailureAt = if ($previous -and $previous.last_failure_at) { [string]$previous.last_failure_at } else { $null }
$lastFailureChecks = if ($previous -and $previous.PSObject.Properties["last_failure_checks"]) {
    @($previous.last_failure_checks | ForEach-Object { [string]$_ })
} else { @() }

if ($healthy) {
    if ($null -eq $startedAt) { $startedAt = $now }
    $healthySamples++
} else {
    $startedAt = $null
    $healthySamples = 0
    $failedSamples++
    $lastFailureAt = $now.ToString("o")
    $lastFailureChecks = @(
        if ($health.PSObject.Properties["checks"]) {
            $health.checks |
                Where-Object { [string]$_.status -ne "pass" } |
                ForEach-Object { [string]$_.id }
        }
    )
    if ($lastFailureChecks.Count -eq 0) { $lastFailureChecks = @("health_status") }
}

$durationDays = if ($null -ne $startedAt) { [math]::Max(0, ($now - $startedAt).TotalDays) } else { 0 }
$requiredDrills = @(
    "host_restart",
    "network_interruption",
    "token_rotation",
    "backup_restore",
    "cloudflare_lan_fallback"
)
$drills = if (Test-Path -LiteralPath $DrillEvidence -PathType Leaf) {
    Get-Content -LiteralPath $DrillEvidence -Raw | ConvertFrom-Json
} else { $null }
$drillStatus = @($requiredDrills | ForEach-Object {
    $id = $_
    $property = if ($drills) { $drills.PSObject.Properties[$id] } else { $null }
    $passed = $null -ne $property -and [string]$property.Value.status -eq "pass"
    [ordered]@{ id = $id; status = $(if ($passed) { "pass" } else { "pending" }) }
})
$allDrillsPassed = @($drillStatus | Where-Object status -ne "pass").Count -eq 0
$passed = $healthy -and $durationDays -ge $RequiredDays -and $allDrillsPassed

$report = [ordered]@{
    schema_version = 1
    generated_at = $now.ToString("o")
    status = $(if ($passed) { "pass" } else { "collecting" })
    started_at = $(if ($null -ne $startedAt) { $startedAt.ToString("o") } else { $null })
    last_sample_at = $now.ToString("o")
    last_failure_at = $lastFailureAt
    last_failure_checks = $lastFailureChecks
    duration_days = [math]::Round($durationDays, 4)
    required_days = $RequiredDays
    healthy_samples = $healthySamples
    failed_samples = $failedSamples
    drills = $drillStatus
    privacy = "No note, photo, token, URL, or family content is included."
}

[IO.Directory]::CreateDirectory((Split-Path $OutputPath -Parent)) | Out-Null
$temporary = "$OutputPath.tmp"
[IO.File]::WriteAllText($temporary, ($report | ConvertTo-Json -Depth 6), [Text.UTF8Encoding]::new($false))
Move-Item -LiteralPath $temporary -Destination $OutputPath -Force
$report | ConvertTo-Json -Depth 6 -Compress

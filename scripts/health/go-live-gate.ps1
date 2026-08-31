[CmdletBinding()]
param(
    [string]$ProjectRoot = "C:\EmBe",
    [string]$HealthReport = "",
    [string]$DrillEvidence = "",
    [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
if (-not $HealthReport) { $HealthReport = Join-Path $ProjectRoot "data\status\system-health.json" }
if (-not $DrillEvidence) { $DrillEvidence = Join-Path $ProjectRoot "data\evidence\failure-drills.json" }

$gates = [Collections.Generic.List[object]]::new()
function Add-Gate([string]$Id, [bool]$Passed, [string]$Reason) {
    $gates.Add([ordered]@{ id = $Id; status = $(if ($Passed) { "pass" } else { "blocked" }); reason = $Reason })
}

$health = if (Test-Path $HealthReport) { Get-Content $HealthReport -Raw | ConvertFrom-Json } else { $null }
Add-Gate "software_health" ($null -ne $health -and $health.status -eq "pass") "Health audit phải đạt toàn bộ."

$backupChecks = if ($health) {
    @($health.checks | Where-Object { $_.id -in @("backup_freshness", "restore_drill", "restic_integrity") })
} else { @() }
$offsiteBackupPass = $backupChecks.Count -eq 3 -and @($backupChecks | Where-Object status -ne "pass").Count -eq 0
Add-Gate "encrypted_offsite_backup" $offsiteBackupPass "R2 mã hóa phải còn mới, kiểm tra toàn vẹn và restore drill đều đạt."

$requiredDrills = @("host_restart", "network_interruption", "token_rotation", "backup_restore", "cloudflare_lan_fallback")
$drills = if (Test-Path -LiteralPath $DrillEvidence -PathType Leaf) {
    Get-Content -LiteralPath $DrillEvidence -Raw | ConvertFrom-Json
} else { $null }
$drillsPass = $null -ne $drills -and @($requiredDrills | Where-Object {
    $property = $drills.PSObject.Properties[$_]
    $null -eq $property -or [string]$property.Value.status -ne "pass"
}).Count -eq 0
Add-Gate "operational_drills" $drillsPass "Các bài kiểm tra restart, mất mạng, đổi token, restore và LAN fallback phải đạt."

$blocked = @($gates | Where-Object status -eq "blocked").Count -gt 0
$report = [ordered]@{
    schema_version = 1
    generated_at = [DateTimeOffset]::UtcNow.ToString("o")
    status = $(if ($blocked) { "blocked" } else { "pass" })
    scope = "Infrastructure, observability, backup and restore gates only."
    gates = $gates
}
$directory = Join-Path $ProjectRoot "data\evidence"
New-Item -ItemType Directory $directory -Force | Out-Null
$path = if ($OutputPath) { $OutputPath } else { Join-Path $directory "go-live.json" }
[IO.Directory]::CreateDirectory((Split-Path $path -Parent)) | Out-Null
[IO.File]::WriteAllText($path, ($report | ConvertTo-Json -Depth 6), [Text.UTF8Encoding]::new($false))
$report | ConvertTo-Json -Depth 6 -Compress
if ($blocked) { exit 2 }
exit 0

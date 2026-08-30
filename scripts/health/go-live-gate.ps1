[CmdletBinding()]
param(
    [string]$ProjectRoot = "C:\EmBe",
    [string]$HealthReport = "",
    [string]$ExternalBackupEvidence = "",
    [string]$SoakEvidence = "",
    [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
if (-not $HealthReport) { $HealthReport = Join-Path $ProjectRoot "data\status\system-health.json" }
if (-not $SoakEvidence) { $SoakEvidence = Join-Path $ProjectRoot "data\evidence\soak.json" }

$gates = [Collections.Generic.List[object]]::new()
function Add-Gate([string]$Id, [bool]$Passed, [string]$Reason) {
    $gates.Add([ordered]@{ id = $Id; status = $(if ($Passed) { "pass" } else { "blocked" }); reason = $Reason })
}

$health = if (Test-Path $HealthReport) { Get-Content $HealthReport -Raw | ConvertFrom-Json } else { $null }
Add-Gate "software_health" ($null -ne $health -and $health.status -eq "pass") "Health audit phải đạt toàn bộ."

$externalPass = $false
if ($ExternalBackupEvidence -and (Test-Path $ExternalBackupEvidence)) {
    $external = Get-Content $ExternalBackupEvidence -Raw | ConvertFrom-Json
    $externalPass = $external.status -eq "pass" -and $external.device_is_separate -eq $true -and $external.restore_verified -eq $true
}
Add-Gate "third_copy_separate_device" $externalPass "Cần USB HDD hoặc NAS riêng và restore đạt từ bản sao đó."

$soakPass = $false
if ($SoakEvidence -and (Test-Path $SoakEvidence)) {
    $soak = Get-Content $SoakEvidence -Raw | ConvertFrom-Json
    $soakPass = $soak.status -eq "pass" -and [double]$soak.duration_days -ge 7
}
Add-Gate "seven_day_soak" $soakPass "Cần đủ 7 ngày ổn định cùng các failure drill bắt buộc."

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

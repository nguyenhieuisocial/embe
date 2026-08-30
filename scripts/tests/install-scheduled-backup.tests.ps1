param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$scriptPath = Join-Path $projectRoot "scripts\backup\install-scheduled-backup.ps1"
$source = Get-Content -LiteralPath $scriptPath -Raw

foreach ($required in @(
    'ServiceAccountName = "EmBeBackupSvc"',
    'New-LocalUser',
    '-LogonType Password',
    'Add-LocalGroupMember -Group "docker-users"',
    'New-TimeSpan -Hours 6',
    'EmBe Restic Integrity Check',
    'check-restic.ps1',
    'EmBe Infrastructure Health Audit',
    'New-TimeSpan -Minutes 5',
    'LastTaskResult -notin @(0, 1, 2)',
    'LastTaskResult -ne 0'
)) {
    if (-not $source.Contains($required)) { throw "Scheduled backup installer is missing: $required" }
}
if ($source.Contains('-LogonType Interactive')) { throw "Interactive-only scheduled backup is not allowed" }

Write-Output "PASS: scheduled backup uses an isolated non-interactive account and verifies execution"

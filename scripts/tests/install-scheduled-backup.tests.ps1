param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$scriptPath = Join-Path $projectRoot "scripts\backup\install-scheduled-backup.ps1"
$source = Get-Content -LiteralPath $scriptPath -Raw

foreach ($required in @(
    'ServiceAccountName = "EmBeBackupSvc"',
    'New-LocalUser',
    '-User $serviceIdentity -Password $generatedPassword -RunLevel Limited',
    'Add-LocalGroupMember -Group "docker-users"',
    'New-TimeSpan -Hours 6',
    'EmBe Restic Integrity Check',
    'check-restic.ps1',
    'EmBe Infrastructure Health Audit',
    'New-TimeSpan -Minutes 5',
    'Principal.LogonType -ne "Password"',
    'Principal.RunLevel -ne "Limited"',
    '$validServiceUsers = @($ServiceAccountName, $serviceIdentity)',
    '$hasStarted = $scheduledInfo.LastRunTime -ge $startedAt.AddSeconds(-2)',
    'Actions.Arguments -notmatch [regex]::Escape("-NonInteractive")',
    'LastTaskResult -notin @(0, 1, 2)',
    'LastTaskResult -ne 0',
    'backup-service-install.json',
    'install_step',
    'error_type',
    'LsaAddAccountRights',
    'SeBatchLogonRight',
    '$installStep = "batch_logon_right"'
)) {
    if (-not $source.Contains($required)) { throw "Scheduled backup installer is missing: $required" }
}
if ($source.Contains('-LogonType Interactive')) { throw "Interactive-only scheduled backup is not allowed" }
if ($source.Contains('New-ScheduledTaskPrincipal')) { throw "Installer must not mix Principal and Password parameter sets" }
if ($source.Contains('RandomNumberGenerator]::Fill')) { throw "Installer must support Windows PowerShell 5.1 cryptography APIs" }
if (-not $source.Contains('RandomNumberGenerator]::Create')) { throw "Installer must use a cryptographic random generator" }
if ($source.Contains('Write-Output $generatedPassword') -or $source.Contains('Write-Host $generatedPassword')) {
    throw "Generated service-account password must never be printed"
}

$actionCount = ([regex]::Matches($source, 'New-ScheduledTaskAction[^\r\n]+-NonInteractive')).Count
if ($actionCount -ne 3) { throw "All three task actions must be explicitly non-interactive" }

foreach ($runner in @('run-critical-r2.ps1', 'check-restic.ps1', 'health-audit.ps1')) {
    if (([regex]::Matches($source, [regex]::Escape($runner))).Count -lt 1) {
        throw "Missing scheduled runner: $runner"
    }
}

Write-Output "PASS: scheduled backup uses an isolated non-interactive account and verifies execution"

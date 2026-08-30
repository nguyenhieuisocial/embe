param(
    [string]$ProjectRoot = "C:\EmBe",
    [string]$TaskName = "EmBe Critical R2 Backup",
    [string]$IntegrityTaskName = "EmBe Restic Integrity Check",
    [string]$HealthTaskName = "EmBe Infrastructure Health Audit",
    [string]$ServiceAccountName = "EmBeBackupSvc",
    [switch]$VerifyNow
)

$ErrorActionPreference = "Stop"
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principalCheck = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principalCheck.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Administrator elevation is required to install the isolated backup account"
}

$runner = Join-Path $ProjectRoot "scripts\backup\run-critical-r2.ps1"
$integrityRunner = Join-Path $ProjectRoot "scripts\backup\check-restic.ps1"
$healthRunner = Join-Path $ProjectRoot "scripts\health\health-audit.ps1"
if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) { throw "Backup runner is missing: $runner" }
if (-not (Test-Path -LiteralPath $integrityRunner -PathType Leaf)) { throw "Integrity runner is missing: $integrityRunner" }
if (-not (Test-Path -LiteralPath $healthRunner -PathType Leaf)) { throw "Health runner is missing: $healthRunner" }

$alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#%+-_"
$randomBytes = New-Object byte[] 40
[Security.Cryptography.RandomNumberGenerator]::Fill($randomBytes)
$generatedPassword = -join ($randomBytes | ForEach-Object { $alphabet[$_ % $alphabet.Length] })
$securePassword = ConvertTo-SecureString $generatedPassword -AsPlainText -Force
$existingAccount = Get-LocalUser -Name $ServiceAccountName -ErrorAction SilentlyContinue
if ($null -eq $existingAccount) {
    New-LocalUser -Name $ServiceAccountName -Password $securePassword -PasswordNeverExpires -UserMayNotChangePassword -Description "Runs encrypted EmBe backups only" | Out-Null
} else {
    Set-LocalUser -Name $ServiceAccountName -Password $securePassword -PasswordNeverExpires $true -UserMayChangePassword $false
    Enable-LocalUser -Name $ServiceAccountName
}
if (-not (Get-LocalGroupMember -Group "docker-users" -Member $ServiceAccountName -ErrorAction SilentlyContinue)) {
    Add-LocalGroupMember -Group "docker-users" -Member $ServiceAccountName
}

$serviceIdentity = "$env:COMPUTERNAME\$ServiceAccountName"
$readPaths = @(
    (Join-Path $ProjectRoot "infra"),
    (Join-Path $ProjectRoot "embe"),
    (Join-Path $ProjectRoot "data\appdata"),
    (Join-Path $ProjectRoot "scripts"),
    (Join-Path $ProjectRoot "tools"),
    (Join-Path $ProjectRoot ".venv"),
    (Join-Path $ProjectRoot "secrets\restic-r2-password.txt")
)
foreach ($path in $readPaths) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Required backup path is missing: $path" }
    $aclGrant = if (Test-Path -LiteralPath $path -PathType Container) { "${serviceIdentity}:(OI)(CI)RX" } else { "${serviceIdentity}:R" }
    $aclArguments = @($path, "/grant:r", $aclGrant)
    if (Test-Path -LiteralPath $path -PathType Container) { $aclArguments += @("/T", "/C") }
    & icacls.exe @aclArguments | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Unable to grant backup read access: $path" }
}
$exportsPath = Join-Path $ProjectRoot "exports"
New-Item -ItemType Directory -Path $exportsPath -Force | Out-Null
& icacls.exe $exportsPath /grant:r "${serviceIdentity}:(OI)(CI)M" /T /C | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Unable to grant backup staging access" }
$statusPath = Join-Path $ProjectRoot "data\status"
New-Item -ItemType Directory -Path $statusPath -Force | Out-Null
& icacls.exe $statusPath /grant:r "${serviceIdentity}:(OI)(CI)M" /T /C | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Unable to grant health status access" }

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$runner`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Hours 6) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew
$taskPrincipal = New-ScheduledTaskPrincipal -UserId $serviceIdentity -LogonType Password -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $taskPrincipal -Password $generatedPassword -Description "Encrypted EmBe vault/config/database snapshots to private Cloudflare R2." -Force | Out-Null

$integrityAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$integrityRunner`""
$integrityTrigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 4am
$integritySettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $IntegrityTaskName -Action $integrityAction -Trigger $integrityTrigger -Settings $integritySettings -Principal $taskPrincipal -Password $generatedPassword -Description "Checks the encrypted EmBe Restic repository without exposing family data." -Force | Out-Null

$healthAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$healthRunner`""
$healthTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
$healthSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 3) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $HealthTaskName -Action $healthAction -Trigger $healthTrigger -Settings $healthSettings -Principal $taskPrincipal -Password $generatedPassword -Description "Writes a PII-free health gate for EmBe infrastructure." -Force | Out-Null
$generatedPassword = $null
$securePassword.Dispose()

if ($VerifyNow) {
    Start-ScheduledTask -TaskName $TaskName
    $deadline = (Get-Date).AddMinutes(10)
    do {
        Start-Sleep -Seconds 2
        $task = Get-ScheduledTask -TaskName $TaskName
        $info = Get-ScheduledTaskInfo -TaskName $TaskName
    } while ($task.State -eq "Running" -and (Get-Date) -lt $deadline)
    if ($task.State -eq "Running") { throw "Backup verification timed out" }
    if ($info.LastTaskResult -ne 0) { throw "Backup verification failed with task result $($info.LastTaskResult)" }

    Start-ScheduledTask -TaskName $IntegrityTaskName
    $deadline = (Get-Date).AddMinutes(10)
    do {
        Start-Sleep -Seconds 2
        $integrityTask = Get-ScheduledTask -TaskName $IntegrityTaskName
        $integrityInfo = Get-ScheduledTaskInfo -TaskName $IntegrityTaskName
    } while ($integrityTask.State -eq "Running" -and (Get-Date) -lt $deadline)
    if ($integrityTask.State -eq "Running" -or $integrityInfo.LastTaskResult -ne 0) { throw "Integrity verification failed" }

    Start-ScheduledTask -TaskName $HealthTaskName
    $deadline = (Get-Date).AddMinutes(5)
    do {
        Start-Sleep -Seconds 1
        $healthTask = Get-ScheduledTask -TaskName $HealthTaskName
        $healthInfo = Get-ScheduledTaskInfo -TaskName $HealthTaskName
    } while ($healthTask.State -eq "Running" -and (Get-Date) -lt $deadline)
    if ($healthTask.State -eq "Running" -or $healthInfo.LastTaskResult -notin @(0, 1, 2)) { throw "Health audit execution failed" }
}

$task = Get-ScheduledTask -TaskName $TaskName
$info = Get-ScheduledTaskInfo -TaskName $TaskName
$integrityTask = Get-ScheduledTask -TaskName $IntegrityTaskName
$integrityInfo = Get-ScheduledTaskInfo -TaskName $IntegrityTaskName
$healthTask = Get-ScheduledTask -TaskName $HealthTaskName
$healthInfo = Get-ScheduledTaskInfo -TaskName $HealthTaskName
[ordered]@{
    task = $task.TaskName
    state = [string]$task.State
    account = $task.Principal.UserId
    logon_type = [string]$task.Principal.LogonType
    last_result = $info.LastTaskResult
    verified_now = [bool]$VerifyNow
    cadence_hours = 6
    integrity_task = $integrityTask.TaskName
    integrity_last_result = $integrityInfo.LastTaskResult
    health_task = $healthTask.TaskName
    health_last_result = $healthInfo.LastTaskResult
} | ConvertTo-Json -Compress

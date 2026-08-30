param(
    [string]$ProjectRoot = "C:\EmBe",
    [string]$TaskName = "EmBe Portal Timeline Sync",
    [string]$RotationTaskName = "EmBe Integration Credential Rotation",
    [string]$SyncAccountName = "EmBePortalSyncSvc",
    [string]$CredentialAccountName = "EmBeCredentialSvc",
    [switch]$VerifyNow
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principalCheck = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principalCheck.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Administrator elevation is required to install isolated EmBe service accounts"
}

$python = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$syncScript = Join-Path $ProjectRoot "services\local-bff\src\sync_portal.py"
$provisioner = Join-Path $ProjectRoot "scripts\provision-local-integrations.ps1"
$adminSecretFile = Join-Path $ProjectRoot "secrets\portal-data.env"
$runtimeSecretDirectory = Join-Path $ProjectRoot "secrets\runtime"
$syncSecretFile = Join-Path $runtimeSecretDirectory "portal-sync.env"
$statusFile = Join-Path $ProjectRoot "data\status\portal-sync.json"
$logFile = Join-Path $ProjectRoot "data\logs\portal-sync.jsonl"
$vaultTimeline = Join-Path $ProjectRoot "vault\20-Timeline\Memos"
$vaultArchive = Join-Path $ProjectRoot "vault\90-System\Memos-Archive"

foreach ($path in @($python, $syncScript, $provisioner, $adminSecretFile, $syncSecretFile)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Portal integration dependency is missing: $path" }
}
foreach ($path in @((Split-Path $statusFile -Parent), (Split-Path $logFile -Parent), $vaultTimeline, $vaultArchive)) {
    New-Item -ItemType Directory -Path $path -Force | Out-Null
}

function New-ServiceAccountPassword([string]$AccountName, [string]$Description) {
    $alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#%+-_"
    $bytes = New-Object byte[] 48
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
    $plain = -join ($bytes | ForEach-Object { $alphabet[$_ % $alphabet.Length] })
    $secure = ConvertTo-SecureString $plain -AsPlainText -Force
    $existing = Get-LocalUser -Name $AccountName -ErrorAction SilentlyContinue
    if ($null -eq $existing) {
        New-LocalUser -Name $AccountName -Password $secure -PasswordNeverExpires -UserMayNotChangePassword -Description $Description | Out-Null
    } else {
        Set-LocalUser -Name $AccountName -Password $secure -PasswordNeverExpires $true -UserMayChangePassword $false
        Enable-LocalUser -Name $AccountName
    }
    $secure.Dispose()
    return $plain
}

$syncPassword = New-ServiceAccountPassword $SyncAccountName "Runs the read-only EmBe portal publication job"
$credentialPassword = New-ServiceAccountPassword $CredentialAccountName "Rotates EmBe integration credentials"
$syncIdentity = "$env:COMPUTERNAME\$SyncAccountName"
$credentialIdentity = "$env:COMPUTERNAME\$CredentialAccountName"
$ownerIdentity = $identity.Name

foreach ($path in @(
    (Join-Path $ProjectRoot ".venv"),
    (Join-Path $ProjectRoot "services\local-bff"),
    (Join-Path $ProjectRoot "services\vault-export"),
    (Join-Path $ProjectRoot "scripts")
)) {
    & icacls.exe $path /inheritance:d /T /C | Out-Null
    & icacls.exe $path /remove:g "*S-1-5-11" /T /C | Out-Null
    & icacls.exe $path /grant:r "${ownerIdentity}:(OI)(CI)(F)" "BUILTIN\Administrators:(OI)(CI)(F)" "SYSTEM:(OI)(CI)(F)" "${syncIdentity}:(OI)(CI)(RX)" "${credentialIdentity}:(OI)(CI)(RX)" /T /C | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Unable to protect executable integration path: $path" }
}

$secretRoot = Split-Path -Parent $adminSecretFile
& icacls.exe $secretRoot /grant:r "${credentialIdentity}:(RX)" | Out-Null
& icacls.exe $adminSecretFile /grant:r "${credentialIdentity}:(M)" | Out-Null
& icacls.exe $runtimeSecretDirectory /inheritance:r /grant:r "${ownerIdentity}:(OI)(CI)(F)" "BUILTIN\Administrators:(OI)(CI)(F)" "SYSTEM:(OI)(CI)(F)" "${credentialIdentity}:(OI)(CI)(M)" "${syncIdentity}:(OI)(CI)(RX)" /T /C | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Unable to isolate portal runtime credentials" }

foreach ($path in @((Split-Path $statusFile -Parent), (Split-Path $logFile -Parent), $vaultTimeline, $vaultArchive)) {
    & icacls.exe $path /grant:r "${syncIdentity}:(OI)(CI)(M)" /T /C | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Unable to grant portal sync output access: $path" }
}

$syncAction = New-ScheduledTaskAction -Execute $python -Argument "`"$syncScript`" --env `"$syncSecretFile`" --vault `"$ProjectRoot\vault`" --status `"$statusFile`" --log `"$logFile`"" -WorkingDirectory $ProjectRoot
$syncTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
$syncSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 3) -MultipleInstances IgnoreNew
$syncPrincipal = New-ScheduledTaskPrincipal -UserId $syncIdentity -LogonType Password -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $syncAction -Trigger $syncTrigger -Settings $syncSettings -Principal $syncPrincipal -Password $syncPassword -Description "Publishes only approved private Memos into the EmBe family read-model." -Force | Out-Null

$rotationAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$provisioner`" -ProjectRoot `"$ProjectRoot`" -RotateOnly" -WorkingDirectory $ProjectRoot
$rotationTrigger = New-ScheduledTaskTrigger -Daily -At 2am
$rotationSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -MultipleInstances IgnoreNew
$rotationPrincipal = New-ScheduledTaskPrincipal -UserId $credentialIdentity -LogonType Password -RunLevel Limited
Register-ScheduledTask -TaskName $RotationTaskName -Action $rotationAction -Trigger $rotationTrigger -Settings $rotationSettings -Principal $rotationPrincipal -Password $credentialPassword -Description "Checks and safely rotates EmBe integration credentials before expiry." -Force | Out-Null

$syncPassword = $null
$credentialPassword = $null

function Test-TaskNow([string]$Name, [int]$TimeoutMinutes) {
    Start-ScheduledTask -TaskName $Name
    $deadline = (Get-Date).AddMinutes($TimeoutMinutes)
    do {
        Start-Sleep -Seconds 1
        $task = Get-ScheduledTask -TaskName $Name
        $info = Get-ScheduledTaskInfo -TaskName $Name
    } while ($task.State -eq "Running" -and (Get-Date) -lt $deadline)
    if ($task.State -eq "Running") { throw "Task verification timed out: $Name" }
    if ($info.LastTaskResult -ne 0) { throw "Task verification failed: $Name ($($info.LastTaskResult))" }
}

if ($VerifyNow) {
    Test-TaskNow $RotationTaskName 5
    Test-TaskNow $TaskName 3
}

$syncTask = Get-ScheduledTask -TaskName $TaskName
$syncInfo = Get-ScheduledTaskInfo -TaskName $TaskName
$rotationTask = Get-ScheduledTask -TaskName $RotationTaskName
$rotationInfo = Get-ScheduledTaskInfo -TaskName $RotationTaskName
[ordered]@{
    status = "ready"
    sync_account = $syncTask.Principal.UserId
    sync_logon_type = [string]$syncTask.Principal.LogonType
    sync_last_result = $syncInfo.LastTaskResult
    rotation_account = $rotationTask.Principal.UserId
    rotation_logon_type = [string]$rotationTask.Principal.LogonType
    rotation_last_result = $rotationInfo.LastTaskResult
    runs_without_login = $true
    verified_now = [bool]$VerifyNow
} | ConvertTo-Json -Compress

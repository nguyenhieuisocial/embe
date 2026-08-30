param(
    [string]$ProjectRoot = "C:\EmBe",
    [string]$TaskName = "EmBe Critical R2 Backup",
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
if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) { throw "Backup runner is missing: $runner" }

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
    (Join-Path $ProjectRoot "vault"),
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

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$runner`""
$trigger = New-ScheduledTaskTrigger -Daily -At 3am
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew
$taskPrincipal = New-ScheduledTaskPrincipal -UserId $serviceIdentity -LogonType Password -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $taskPrincipal -Password $generatedPassword -Description "Encrypted EmBe vault/config/database snapshots to private Cloudflare R2." -Force | Out-Null
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
}

$task = Get-ScheduledTask -TaskName $TaskName
$info = Get-ScheduledTaskInfo -TaskName $TaskName
[ordered]@{
    task = $task.TaskName
    state = [string]$task.State
    account = $task.Principal.UserId
    logon_type = [string]$task.Principal.LogonType
    last_result = $info.LastTaskResult
    verified_now = [bool]$VerifyNow
} | ConvertTo-Json -Compress

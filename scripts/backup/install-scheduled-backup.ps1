param(
    [string]$ProjectRoot = "C:\EmBe",
    [string]$TaskName = "EmBe Critical R2 Backup",
    [string]$IntegrityTaskName = "EmBe Restic Integrity Check",
    [string]$HealthTaskName = "EmBe Infrastructure Health Audit",
    [string]$ServiceAccountName = "EmBeBackupSvc",
    [switch]$VerifyNow
)

$ErrorActionPreference = "Stop"
$installStatusPath = Join-Path $ProjectRoot "data\status\backup-service-install.json"
$installStep = "administrator_check"

function Write-InstallStatus([string]$Status, [string]$ErrorType = "", [string]$ErrorMessage = "") {
    $directory = Split-Path $installStatusPath -Parent
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    $payload = [ordered]@{
        schema_version = 1
        generated_at = [DateTimeOffset]::UtcNow.ToString("o")
        status = $Status
        install_step = $installStep
        error_type = $ErrorType
        error_message = $ErrorMessage
    }
    $temporary = "$installStatusPath.tmp"
    [IO.File]::WriteAllText($temporary, ($payload | ConvertTo-Json -Depth 4), [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temporary -Destination $installStatusPath -Force
}

trap {
    Write-InstallStatus -Status "failed" -ErrorType $_.Exception.GetType().Name -ErrorMessage $_.Exception.Message
    Write-Error $_
    exit 1
}

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

$lowercase = "abcdefghijkmnopqrstuvwxyz"
$uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ"
$digits = "23456789"
$symbols = "!@#%+-_"
$alphabet = "$lowercase$uppercase$digits$symbols"
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
function Get-CryptoIndex([int]$Maximum) {
    if ($Maximum -lt 1 -or $Maximum -gt 256) { throw "Invalid cryptographic index range" }
    $limit = 256 - (256 % $Maximum)
    $buffer = New-Object byte[] 1
    do { $rng.GetBytes($buffer) } while ([int]$buffer[0] -ge $limit)
    return [int]$buffer[0] % $Maximum
}

$passwordCharacters = New-Object 'System.Collections.Generic.List[char]'
try {
    foreach ($characterSet in @($lowercase, $uppercase, $digits, $symbols)) {
        $passwordCharacters.Add($characterSet[(Get-CryptoIndex $characterSet.Length)])
    }
    while ($passwordCharacters.Count -lt 40) {
        $passwordCharacters.Add($alphabet[(Get-CryptoIndex $alphabet.Length)])
    }
    for ($index = $passwordCharacters.Count - 1; $index -gt 0; $index--) {
        $swapIndex = Get-CryptoIndex ($index + 1)
        $temporaryCharacter = $passwordCharacters[$index]
        $passwordCharacters[$index] = $passwordCharacters[$swapIndex]
        $passwordCharacters[$swapIndex] = $temporaryCharacter
    }
    $generatedPassword = -join $passwordCharacters
} finally {
    $rng.Dispose()
}
$securePassword = ConvertTo-SecureString $generatedPassword -AsPlainText -Force
$installStep = "service_account"
$existingAccount = Get-LocalUser -Name $ServiceAccountName -ErrorAction SilentlyContinue
if ($null -eq $existingAccount) {
    New-LocalUser -Name $ServiceAccountName -Password $securePassword -PasswordNeverExpires -UserMayNotChangePassword -Description "Runs encrypted EmBe backups only" | Out-Null
} else {
    Set-LocalUser -Name $ServiceAccountName -Password $securePassword -PasswordNeverExpires $true -UserMayChangePassword $false
    Enable-LocalUser -Name $ServiceAccountName
}
$installStep = "docker_group"
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
$installStep = "filesystem_permissions"
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

$installStep = "scheduled_tasks"
function Assert-InstalledTask {
    param(
        [Parameter(Mandatory)] [string]$Name,
        [Parameter(Mandatory)] [string]$ExpectedRunner
    )

    $installedTask = Get-ScheduledTask -TaskName $Name -ErrorAction Stop
    $validServiceUsers = @($ServiceAccountName, $serviceIdentity)
    if ($validServiceUsers -notcontains [string]$installedTask.Principal.UserId) {
        throw "Scheduled task account is incorrect: $Name"
    }
    if ([string]$installedTask.Principal.LogonType -ne "Password") {
        throw "Scheduled task is not using password logon: $Name"
    }
    if ([string]$installedTask.Principal.RunLevel -ne "Limited") {
        throw "Scheduled task is unexpectedly elevated: $Name"
    }
    if ([string]$installedTask.Actions.Arguments -notmatch [regex]::Escape("-NonInteractive")) {
        throw "Scheduled task is not non-interactive: $Name"
    }
    if ([string]$installedTask.Actions.Arguments -notmatch [regex]::Escape($ExpectedRunner)) {
        throw "Scheduled task runner is incorrect: $Name"
    }
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$runner`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Hours 6) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -User $serviceIdentity -Password $generatedPassword -RunLevel Limited -Description "Encrypted EmBe vault/config/database snapshots to private Cloudflare R2." -Force | Out-Null

$integrityAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$integrityRunner`""
$integrityTrigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 4am
$integritySettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $IntegrityTaskName -Action $integrityAction -Trigger $integrityTrigger -Settings $integritySettings -User $serviceIdentity -Password $generatedPassword -RunLevel Limited -Description "Checks the encrypted EmBe Restic repository without exposing family data." -Force | Out-Null

$healthAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$healthRunner`""
$healthTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
$healthSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 3) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $HealthTaskName -Action $healthAction -Trigger $healthTrigger -Settings $healthSettings -User $serviceIdentity -Password $generatedPassword -RunLevel Limited -Description "Writes a PII-free health gate for EmBe infrastructure." -Force | Out-Null
Assert-InstalledTask -Name $TaskName -ExpectedRunner $runner
Assert-InstalledTask -Name $IntegrityTaskName -ExpectedRunner $integrityRunner
Assert-InstalledTask -Name $HealthTaskName -ExpectedRunner $healthRunner
$generatedPassword = $null
$securePassword.Dispose()

if ($VerifyNow) {
    $installStep = "live_verification"
    function Invoke-ScheduledTaskAndWait([string]$Name, [int]$TimeoutMinutes) {
        $startedAt = Get-Date
        Start-ScheduledTask -TaskName $Name
        $deadline = $startedAt.AddMinutes($TimeoutMinutes)
        do {
            Start-Sleep -Seconds 2
            $scheduledTask = Get-ScheduledTask -TaskName $Name
            $scheduledInfo = Get-ScheduledTaskInfo -TaskName $Name
            $hasStarted = $scheduledInfo.LastRunTime -ge $startedAt.AddSeconds(-2)
        } while ((-not $hasStarted -or $scheduledTask.State -eq "Running") -and (Get-Date) -lt $deadline)
        if (-not $hasStarted -or $scheduledTask.State -eq "Running") {
            throw "Scheduled task verification timed out: $Name"
        }
        return $scheduledInfo
    }

    $info = Invoke-ScheduledTaskAndWait -Name $TaskName -TimeoutMinutes 10
    if ($info.LastTaskResult -ne 0) { throw "Backup verification failed with task result $($info.LastTaskResult)" }

    $integrityInfo = Invoke-ScheduledTaskAndWait -Name $IntegrityTaskName -TimeoutMinutes 10
    if ($integrityInfo.LastTaskResult -ne 0) { throw "Integrity verification failed" }

    $healthInfo = Invoke-ScheduledTaskAndWait -Name $HealthTaskName -TimeoutMinutes 5
    if ($healthInfo.LastTaskResult -notin @(0, 1, 2)) { throw "Health audit execution failed" }
}

$task = Get-ScheduledTask -TaskName $TaskName
$info = Get-ScheduledTaskInfo -TaskName $TaskName
$integrityTask = Get-ScheduledTask -TaskName $IntegrityTaskName
$integrityInfo = Get-ScheduledTaskInfo -TaskName $IntegrityTaskName
$healthTask = Get-ScheduledTask -TaskName $HealthTaskName
$healthInfo = Get-ScheduledTaskInfo -TaskName $HealthTaskName
$installStep = "complete"
Write-InstallStatus -Status "ready"
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

[CmdletBinding()]
param(
    [string]$ProjectRoot = "C:\EmBe",
    [string]$TaskName = "EmBe BabyBuddy Memos Sync",
    [switch]$SkipInitialRun
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$runtimeSecret = Join-Path $ProjectRoot "secrets\runtime\babybuddy-memos-sync\sync.env"
$syncScript = Join-Path $ProjectRoot "services\babybuddy-memos-sync\src\embe_sync\main.py"
$statusDirectory = Join-Path $ProjectRoot "data\status"
$logDirectory = Join-Path $ProjectRoot "data\logs"
$statusFile = Join-Path $statusDirectory "babybuddy-memos-sync.json"
$logFile = Join-Path $logDirectory "babybuddy-memos-sync.jsonl"
$venvPython = Join-Path $ProjectRoot ".venv\Scripts\pythonw.exe"

if (-not (Test-Path -LiteralPath $runtimeSecret -PathType Leaf)) {
    throw "BabyBuddy sync runtime configuration is missing. Run scripts\provision-babybuddy-sync.ps1 first."
}
if (-not (Test-Path -LiteralPath $syncScript -PathType Leaf)) {
    throw "BabyBuddy sync program is missing."
}

if (-not (Test-Path -LiteralPath $venvPython -PathType Leaf)) {
    throw "The windowless project Python runtime is missing."
}
$python = $venvPython

New-Item -ItemType Directory -Path $statusDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

$arguments = @(
    ('"{0}"' -f $syncScript),
    "--env", ('"{0}"' -f $runtimeSecret),
    "--once",
    "--status", ('"{0}"' -f $statusFile),
    "--log", ('"{0}"' -f $logFile)
) -join " "

$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute $python -Argument $arguments -WorkingDirectory $ProjectRoot
$repeatTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 3650)
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 3) -MultipleInstances IgnoreNew -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger @($repeatTrigger, $logonTrigger) `
    -Settings $settings `
    -Principal $principal `
    -Description "Synchronizes tagged BabyBuddy milestones to private Memos while this user is signed in." `
    -Force | Out-Null

if (-not $SkipInitialRun) {
    $previousRun = (Get-ScheduledTaskInfo -TaskName $TaskName).LastRunTime
    Start-ScheduledTask -TaskName $TaskName

    $deadline = (Get-Date).AddSeconds(90)
    do {
        Start-Sleep -Milliseconds 500
        $task = Get-ScheduledTask -TaskName $TaskName
        $taskInfo = Get-ScheduledTaskInfo -TaskName $TaskName
        $finished = $taskInfo.LastRunTime -gt $previousRun -and $task.State -ne "Running"
    } while (-not $finished -and (Get-Date) -lt $deadline)

    if (-not $finished) {
        throw "BabyBuddy sync did not finish its first safety check within 90 seconds."
    }
    if ($taskInfo.LastTaskResult -ne 0) {
        throw "BabyBuddy sync safety check failed (result $($taskInfo.LastTaskResult)). See the sanitized local status file."
    }
}

$installedTask = Get-ScheduledTask -TaskName $TaskName
$installedInfo = Get-ScheduledTaskInfo -TaskName $TaskName
[pscustomobject]@{
    task = $installedTask.TaskName
    account = $installedTask.Principal.UserId
    logonType = $installedTask.Principal.LogonType.ToString()
    runLevel = $installedTask.Principal.RunLevel.ToString()
    schedule = "every minute while signed in"
    state = $installedTask.State.ToString()
    lastResult = $installedInfo.LastTaskResult
    status = $statusFile
} | ConvertTo-Json -Compress

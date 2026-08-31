[CmdletBinding()]
param(
    [string]$ProjectRoot = "C:\EmBe",
    [string]$TaskName = "EmBe Monthly Family Book",
    [switch]$SkipInitialRun
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$runner = Join-Path $ProjectRoot "services\reporting\run-monthly.ps1"
$runtimeSecret = Join-Path $ProjectRoot "secrets\runtime\portal-sync.env"
foreach ($path in @($runner, $runtimeSecret)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Monthly report dependency is missing: $path" }
}

$taskCommand = 'powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}" -ProjectRoot "{1}"' -f $runner, $ProjectRoot
& schtasks.exe /Create /TN $TaskName /TR $taskCommand /SC MONTHLY /D 1 /ST 06:15 /RL LIMITED /F | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Unable to register the monthly report task" }

if (-not $SkipInitialRun) {
    $previousRun = (Get-ScheduledTaskInfo -TaskName $TaskName).LastRunTime
    Start-ScheduledTask -TaskName $TaskName
    $deadline = (Get-Date).AddMinutes(3)
    do {
        Start-Sleep -Milliseconds 500
        $task = Get-ScheduledTask -TaskName $TaskName
        $info = Get-ScheduledTaskInfo -TaskName $TaskName
        $finished = $info.LastRunTime -gt $previousRun -and $task.State -ne "Running"
    } while (-not $finished -and (Get-Date) -lt $deadline)
    if (-not $finished -or $info.LastTaskResult -ne 0) { throw "Monthly report verification failed" }
}

$task = Get-ScheduledTask -TaskName $TaskName
$info = Get-ScheduledTaskInfo -TaskName $TaskName
[ordered]@{
    status = "ready"
    task = $task.TaskName
    account = $task.Principal.UserId
    logon_type = [string]$task.Principal.LogonType
    run_level = [string]$task.Principal.RunLevel
    next_run = $info.NextRunTime.ToString("o")
    verified_now = -not [bool]$SkipInitialRun
} | ConvertTo-Json -Compress

[CmdletBinding()]
param(
    [string]$ProjectRoot = "C:\EmBe",
    [string]$TaskName = "EmBe-DiskMaintenance",
    [switch]$VerifyNow
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$runner = Join-Path $ProjectRoot "scripts\maintain-disk-headroom.ps1"
if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) { throw "Disk maintenance runner is missing" }

$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$runner`" -ProjectRoot `"$ProjectRoot`""
$trigger = New-ScheduledTaskTrigger -Daily -At "04:20"
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force `
    -Description "Safely trims Docker blocks and, only below the safety floor, re-downloadable package caches without deleting images, volumes, or family data." | Out-Null

if ($VerifyNow) {
    $startedAt = Get-Date
    Start-ScheduledTask -TaskName $TaskName
    $deadline = $startedAt.AddMinutes(3)
    do {
        Start-Sleep -Seconds 2
        $task = Get-ScheduledTask -TaskName $TaskName
        $info = Get-ScheduledTaskInfo -TaskName $TaskName
        $hasStarted = $info.LastRunTime -ge $startedAt.AddSeconds(-2)
    } while ((-not $hasStarted -or $task.State -eq "Running") -and (Get-Date) -lt $deadline)
    if (-not $hasStarted -or $task.State -eq "Running" -or $info.LastTaskResult -ne 0) {
        throw "Disk maintenance task verification failed"
    }
}

$installed = Get-ScheduledTask -TaskName $TaskName
[ordered]@{
    status = "ready"
    task = $installed.TaskName
    account = $installed.Principal.UserId
    logon_type = [string]$installed.Principal.LogonType
    run_level = [string]$installed.Principal.RunLevel
    verified_now = [bool]$VerifyNow
} | ConvertTo-Json -Compress

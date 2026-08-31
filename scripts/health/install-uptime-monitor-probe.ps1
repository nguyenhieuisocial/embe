[CmdletBinding()]
param(
    [string]$ProjectRoot = "C:\EmBe",
    [string]$TaskName = "EmBe Uptime Monitor Health",
    [switch]$SkipInitialRun
)

$ErrorActionPreference = "Stop"
$runner = Join-Path $ProjectRoot "scripts\health\check-uptime-monitors.ps1"
if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) { throw "Uptime monitor health runner not found" }

$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$runner`" -ProjectRoot `"$ProjectRoot`""
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 2) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 2) -MultipleInstances IgnoreNew -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Writes privacy-safe aggregate health for seven EmBe Uptime Kuma monitors." -Force | Out-Null
if (-not $SkipInitialRun) { Start-ScheduledTask -TaskName $TaskName }

$task = Get-ScheduledTask -TaskName $TaskName
[pscustomobject]@{
    TaskName = $task.TaskName
    State = [string]$task.State
    RunLevel = [string]$task.Principal.RunLevel
    InitialRunStarted = (-not $SkipInitialRun)
}

[CmdletBinding()]
param(
    [string]$ProjectRoot = "C:\EmBe",
    [string]$TaskName = "EmBe Tailscale Private Health",
    [switch]$SkipInitialRun
)

$ErrorActionPreference = "Stop"
$python = Join-Path $ProjectRoot ".venv\Scripts\pythonw.exe"
$probe = Join-Path $ProjectRoot "scripts\health\tailscale-private-probe.py"
$tailscale = "C:\Program Files\Tailscale\tailscale.exe"
$output = Join-Path $ProjectRoot "data\health\tailscale-private.json"
foreach ($path in @($python, $probe, $tailscale)) { if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Tailscale health dependency not found" } }

$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$arguments = "`"$probe`" --tailscale `"$tailscale`" --output `"$output`""
$action = New-ScheduledTaskAction -Execute $python -Argument $arguments -WorkingDirectory $ProjectRoot
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 2) -MultipleInstances IgnoreNew -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Writes privacy-safe health codes for EmBe private Tailscale routes." -Force | Out-Null
if (-not $SkipInitialRun) { Start-ScheduledTask -TaskName $TaskName }

$task = Get-ScheduledTask -TaskName $TaskName
[pscustomobject]@{
    TaskName = $task.TaskName
    State = [string]$task.State
    RunLevel = [string]$task.Principal.RunLevel
    InitialRunStarted = (-not $SkipInitialRun)
}

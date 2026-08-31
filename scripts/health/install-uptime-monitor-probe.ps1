[CmdletBinding()]
param(
    [string]$ProjectRoot = "C:\EmBe",
    [string]$TaskName = "EmBe Uptime Monitor Health",
    [switch]$SkipInitialRun
)

$ErrorActionPreference = "Stop"
$python = Join-Path $ProjectRoot ".venv\Scripts\pythonw.exe"
$probe = Join-Path $ProjectRoot "scripts\health\uptime-kuma-state.py"
$database = Join-Path $ProjectRoot "data\appdata\uptime-kuma\kuma.db"
$output = Join-Path $ProjectRoot "data\health\uptime-monitors.json"
$immichProbe = Join-Path $ProjectRoot "scripts\health\immich-family-state.py"
$immichOutput = Join-Path $ProjectRoot "data\health\immich-family-account.json"
foreach ($path in @($python, $probe, $database, $immichProbe)) { if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Runtime health probe dependency not found" } }

$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$arguments = "`"$probe`" --database `"$database`" --output `"$output`" --expected 7"
$action = New-ScheduledTaskAction -Execute $python -Argument $arguments -WorkingDirectory $ProjectRoot
$immichArguments = "`"$immichProbe`" --output `"$immichOutput`""
$immichAction = New-ScheduledTaskAction -Execute $python -Argument $immichArguments -WorkingDirectory $ProjectRoot
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 2) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 2) -MultipleInstances IgnoreNew -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action @($action, $immichAction) -Trigger $trigger -Settings $settings -Principal $principal -Description "Writes privacy-safe aggregate health for EmBe runtime services." -Force | Out-Null
if (-not $SkipInitialRun) { Start-ScheduledTask -TaskName $TaskName }

$task = Get-ScheduledTask -TaskName $TaskName
[pscustomobject]@{
    TaskName = $task.TaskName
    State = [string]$task.State
    RunLevel = [string]$task.Principal.RunLevel
    InitialRunStarted = (-not $SkipInitialRun)
}

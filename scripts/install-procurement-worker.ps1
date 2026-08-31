[CmdletBinding()]
param(
    [string]$ProjectRoot = "C:\EmBe",
    [string]$TaskName = "EmBe Procurement Worker",
    [switch]$SkipInitialRun
)

$ErrorActionPreference = "Stop"
$python = Join-Path $ProjectRoot ".venv\Scripts\pythonw.exe"
$runner = Join-Path $ProjectRoot "services\procurement\run.py"
$envFile = Join-Path $ProjectRoot "secrets\runtime\portal-sync.env"
$database = Join-Path $ProjectRoot "data\procurement\procurement.sqlite3"
$status = Join-Path $ProjectRoot "data\status\procurement-worker.json"
foreach ($path in @($python, $runner, $envFile)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Procurement worker dependency is missing" }
}
New-Item -ItemType Directory -Path (Split-Path $database -Parent), (Split-Path $status -Parent) -Force | Out-Null

$arguments = "`"$runner`" --env `"$envFile`" --database `"$database`" --status `"$status`""
$action = New-ScheduledTaskAction -Execute $python -Argument $arguments -WorkingDirectory $ProjectRoot
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 3) -MultipleInstances IgnoreNew -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 1)
$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Publishes bounded procurement proposals and applies only human-confirmed transitions." -Force | Out-Null

if (-not $SkipInitialRun) {
    Start-ScheduledTask -TaskName $TaskName
}

$task = Get-ScheduledTask -TaskName $TaskName
[ordered]@{
    status = "ready"
    task = $task.TaskName
    execute = $task.Actions.Execute
    state = [string]$task.State
} | ConvertTo-Json -Compress

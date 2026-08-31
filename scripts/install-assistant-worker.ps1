param(
    [string]$ProjectRoot = "C:\EmBe",
    [string]$TaskName = "EmBe Local Assistant"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$python = Join-Path $ProjectRoot ".venv\Scripts\pythonw.exe"
$worker = Join-Path $ProjectRoot "services\assistant-worker\src\assistant_worker.py"
$portalEnv = Join-Path $ProjectRoot "secrets\runtime\portal-sync.env"
$database = Join-Path $ProjectRoot "data\analytics\family.sqlite3"
$status = Join-Path $ProjectRoot "data\status\assistant-worker.json"
foreach ($path in @($python, $worker, $portalEnv, $database)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Assistant worker dependency is missing" }
}

$arguments = "`"$worker`" --env `"$portalEnv`" --database `"$database`" --status `"$status`" --child-id embe"
$action = New-ScheduledTaskAction -Execute $python -Argument $arguments -WorkingDirectory $ProjectRoot
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 2) `
    -MultipleInstances IgnoreNew -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) `
    -LogonType Interactive -RunLevel Limited
$task = New-ScheduledTask -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
    -Description "Answers bounded family analytics questions with loopback-only Ollama."
Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null

$startedAt = Get-Date
Start-ScheduledTask -TaskName $TaskName
$deadline = (Get-Date).AddMinutes(2)
do {
    Start-Sleep -Seconds 1
    $current = Get-ScheduledTask -TaskName $TaskName
    $info = Get-ScheduledTaskInfo -TaskName $TaskName
    $finished = $current.State -ne "Running" -and $info.LastRunTime -ge $startedAt.AddSeconds(-2)
} while (-not $finished -and (Get-Date) -lt $deadline)
if (-not $finished -or $info.LastTaskResult -ne 0) { throw "Assistant worker Scheduled Task verification failed" }
[ordered]@{ status = "ready"; task = $TaskName; state = [string]$current.State; last_result = [int]$info.LastTaskResult } | ConvertTo-Json -Compress

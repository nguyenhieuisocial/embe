param(
    [string]$ProjectRoot = "C:\EmBe",
    [string]$TaskName = "EmBe Inventory Worker"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$runner = Join-Path $ProjectRoot "scripts\run-inventory-worker.ps1"
if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) {
    throw "Inventory worker runner is missing"
}

$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$runner`" -ProjectRoot `"$ProjectRoot`"" `
    -WorkingDirectory $ProjectRoot
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 1) `
    -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 2) `
    -MultipleInstances IgnoreNew `
    -RestartCount 2 `
    -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal `
    -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) `
    -LogonType Interactive `
    -RunLevel Limited

$task = New-ScheduledTask -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
    -Description "Processes private family inventory actions and publishes a bounded Grocy snapshot."
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

if (-not $finished -or $info.LastTaskResult -ne 0) {
    throw "Inventory worker Scheduled Task verification failed"
}

[ordered]@{
    status = "ready"
    task = $TaskName
    state = [string]$current.State
    last_result = [int]$info.LastTaskResult
} | ConvertTo-Json -Compress

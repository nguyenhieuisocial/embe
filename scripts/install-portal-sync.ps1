param(
    [string]$ProjectRoot = "C:\EmBe",
    [string]$TaskName = "EmBe Portal Timeline Sync",
    [switch]$VerifyNow
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$python = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$syncScript = Join-Path $ProjectRoot "services\local-bff\src\sync_portal.py"
$secretFile = Join-Path $ProjectRoot "secrets\portal-data.env"
foreach ($path in @($python, $syncScript, $secretFile)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Portal sync dependency is missing: $path" }
}

$action = New-ScheduledTaskAction -Execute $python -Argument "`"$syncScript`" --env `"$secretFile`" --vault `"$ProjectRoot\vault`"" -WorkingDirectory $ProjectRoot
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 3) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Publishes only #portal Memos into the private EmBe read-model." -Force | Out-Null

if ($VerifyNow) {
    Start-ScheduledTask -TaskName $TaskName
    $deadline = (Get-Date).AddMinutes(3)
    do {
        Start-Sleep -Seconds 1
        $task = Get-ScheduledTask -TaskName $TaskName
        $info = Get-ScheduledTaskInfo -TaskName $TaskName
    } while ($task.State -eq "Running" -and (Get-Date) -lt $deadline)
    if ($task.State -eq "Running") { throw "Portal sync verification timed out" }
    if ($info.LastTaskResult -ne 0) { throw "Portal sync failed with task result $($info.LastTaskResult)" }
}

$task = Get-ScheduledTask -TaskName $TaskName
$info = Get-ScheduledTaskInfo -TaskName $TaskName
[ordered]@{
    task = $task.TaskName
    state = [string]$task.State
    interval_minutes = 5
    last_result = $info.LastTaskResult
    verified_now = [bool]$VerifyNow
} | ConvertTo-Json -Compress

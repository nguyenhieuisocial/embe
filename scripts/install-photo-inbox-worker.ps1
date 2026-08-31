[CmdletBinding()]
param([string]$ProjectRoot = "C:\EmBe")

$ErrorActionPreference = "Stop"
$python = Join-Path $ProjectRoot ".venv\Scripts\pythonw.exe"
$worker = Join-Path $ProjectRoot "services\media-ingest\photo_inbox_worker.py"
$envFile = Join-Path $ProjectRoot "secrets\runtime\photo-inbox-worker.env"
$status = Join-Path $ProjectRoot "data\status\photo-inbox-worker.json"
foreach ($path in @($python, $worker, $envFile)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Photo inbox worker dependency is missing" }
}

$taskName = "EmBe Photo Inbox Worker"
$arguments = "`"$worker`" --env `"$envFile`" --status `"$status`""
$action = New-ScheduledTaskAction -Execute $python -Argument $arguments -WorkingDirectory $ProjectRoot
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 2)
$settings = New-ScheduledTaskSettingsSet -Hidden -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Output "Photo inbox worker scheduled without a visible PowerShell window."

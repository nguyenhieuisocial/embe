param([string]$ProjectRoot = 'C:\EmBe')
$ErrorActionPreference = 'Stop'
$taskName = 'EmBe Medical Document Worker'
$pythonw = Join-Path $ProjectRoot '.venv\Scripts\pythonw.exe'
$script = Join-Path $ProjectRoot 'services\media-ingest\medical_document_worker.py'
$settingsFile = Join-Path $ProjectRoot 'secrets\runtime\photo-inbox-worker.env'
$statusFile = Join-Path $ProjectRoot 'data\status\medical-document-worker.json'
foreach ($path in @($pythonw, $script, $settingsFile)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw 'Missing medical worker dependency' }
}
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$arguments = "`"$script`" --env `"$settingsFile`" --status `"$statusFile`" --watch"
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing -and $existing.State -eq 'Running') {
    Write-Output 'Medical worker already running; no restart performed.'
    exit 0
}
$action = New-ScheduledTaskAction -Execute $pythonw -Argument $arguments -WorkingDirectory $ProjectRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity
$settings = New-ScheduledTaskSettingsSet -Hidden -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Private page-by-page medical document transcription; requires human review.' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Output 'Medical document worker started directly with pythonw. No console window or Docker restart.'

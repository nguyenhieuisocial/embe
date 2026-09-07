param([string]$ProjectRoot = 'C:\EmBe')
$ErrorActionPreference = 'Stop'
$taskName = 'EmBe Studio Renderer'
$pythonw = Join-Path $ProjectRoot '.venv-studio-voice\Scripts\pythonw.exe'
$settingsFile = Join-Path $ProjectRoot 'secrets\runtime\portal-sync.env'
foreach ($path in @($pythonw, $settingsFile, (Join-Path $ProjectRoot 'data\studio-voice\models\vi_VN-vais1000-medium.onnx'))) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw 'Missing Studio dependency' }
}
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing -and $existing.State -eq 'Running') { Write-Output 'Studio already running; no restart.'; exit 0 }
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute $pythonw -Argument "-m embe_studio.web_worker --env `"$settingsFile`" --watch" -WorkingDirectory $ProjectRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity
$settings = New-ScheduledTaskSettingsSet -Hidden -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 2)
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Private Studio queue; one bounded render at a time, no social publishing.' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Output 'Studio renderer started without console windows. Existing apps unchanged.'

[CmdletBinding()]
param(
    [string]$ProjectRoot = "C:\EmBe",
    [string]$TaskName = "EmBe Shell Leak Guard"
)

$ErrorActionPreference = "Stop"
$python = Join-Path $ProjectRoot ".venv\Scripts\pythonw.exe"
$guard = Join-Path $ProjectRoot "scripts\health\shell_leak_guard.py"
foreach ($path in @($python, $guard)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Shell leak guard dependency is missing" }
}
$action = New-ScheduledTaskAction -Execute $python -Argument "`"$guard`"" -WorkingDirectory $ProjectRoot
$repeat = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 3650)
$logon = New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($repeat, $logon) -Settings $settings -Principal $principal -Description "Removes only abandoned bare PowerShell shells leaked by Claude Desktop." -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

[CmdletBinding()]
param(
    [string]$ProjectRoot = "C:\EmBe",
    [string]$TaskName = "EmBe Local Runtime Startup",
    [switch]$VerifyNow
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$runner = Join-Path $ProjectRoot "scripts\start-local-runtime.ps1"
if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) { throw "Local runtime starter is missing" }

$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$runner`" -ProjectRoot `"$ProjectRoot`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity
$trigger.Delay = "PT30S"
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Safely recovers Docker runtime sockets and starts Docker plus Ollama after sign-in." -Force | Out-Null

if ($VerifyNow) {
    $startedAt = Get-Date
    Start-ScheduledTask -TaskName $TaskName
    $deadline = $startedAt.AddMinutes(5)
    do {
        Start-Sleep -Seconds 2
        $task = Get-ScheduledTask -TaskName $TaskName
        $info = Get-ScheduledTaskInfo -TaskName $TaskName
        $hasStarted = $info.LastRunTime -ge $startedAt.AddSeconds(-2)
    } while ((-not $hasStarted -or $task.State -eq "Running") -and (Get-Date) -lt $deadline)
    if (-not $hasStarted -or $task.State -eq "Running" -or $info.LastTaskResult -ne 0) {
        throw "Local runtime startup task verification failed"
    }
}

$installed = Get-ScheduledTask -TaskName $TaskName
[ordered]@{
    status = "ready"
    task = $installed.TaskName
    account = $installed.Principal.UserId
    logon_type = [string]$installed.Principal.LogonType
    run_level = [string]$installed.Principal.RunLevel
    verified_now = [bool]$VerifyNow
} | ConvertTo-Json -Compress

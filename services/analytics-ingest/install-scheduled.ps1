[CmdletBinding()]
param(
    [string]$ProjectRoot = 'C:\EmBe',
    [string]$TaskName = 'EmBe Local Analytics Ingest',
    [string]$ConfigPath = '',
    [string]$SecretsPath = '',
    [string]$StatusPath = '',
    [switch]$SkipInitialRun
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$serviceRoot = Join-Path $ProjectRoot 'services\analytics-ingest'
$runner = Join-Path $serviceRoot 'run.py'
if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) { throw "Analytics runner not found" }

if (-not $ConfigPath) { $ConfigPath = Join-Path $serviceRoot 'config.local.json' }
if (-not $SecretsPath) { $SecretsPath = Join-Path $serviceRoot 'secrets.local.env' }
if (-not $StatusPath) { $StatusPath = Join-Path $ProjectRoot 'data\health\analytics-ingest.json' }

$python = Join-Path $ProjectRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    $python = (Get-Command python -ErrorAction Stop).Source
}

$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
if (Test-Path -LiteralPath $SecretsPath -PathType Leaf) {
    & icacls.exe $SecretsPath /inheritance:r /grant:r "${currentUser}:(R,W)" /grant:r 'SYSTEM:(F)' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Unable to restrict analytics secrets file permissions" }
}

$arguments = "`"$runner`" --config `"$ConfigPath`" --secrets `"$SecretsPath`" --status `"$StatusPath`""
$action = New-ScheduledTaskAction -Execute $python -Argument $arguments -WorkingDirectory $ProjectRoot
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Imports allowlisted Home Assistant, BabyBuddy, and Grocy facts into local SQLite analytics.' -Force | Out-Null

if (-not $SkipInitialRun -and (Test-Path -LiteralPath $ConfigPath -PathType Leaf) -and (Test-Path -LiteralPath $SecretsPath -PathType Leaf)) {
    Start-ScheduledTask -TaskName $TaskName
}

$task = Get-ScheduledTask -TaskName $TaskName
[pscustomobject]@{
    TaskName = $TaskName
    State = $task.State
    RunLevel = $task.Principal.RunLevel
    InitialRunStarted = (-not $SkipInitialRun -and (Test-Path -LiteralPath $ConfigPath) -and (Test-Path -LiteralPath $SecretsPath))
}

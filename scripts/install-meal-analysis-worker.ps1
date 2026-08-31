param(
    [string]$ProjectRoot = "C:\EmBe",
    [string]$TaskName = "EmBe Meal Analysis Worker",
    [switch]$VerifyNow
)

$ErrorActionPreference = "Stop"
$python = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$worker = Join-Path $ProjectRoot "services\media-ingest\meal_analysis_worker.py"
$nutritionBuilder = Join-Path $ProjectRoot "scripts\food\build_usda_local_db.py"
$nutritionDatabase = Join-Path $ProjectRoot "data\cache\fooddata-sr-legacy.sqlite"
$envFile = Join-Path $ProjectRoot "secrets\runtime\photo-inbox-worker.env"
$status = Join-Path $ProjectRoot "data\status\meal-analysis-worker.json"
foreach ($path in @($python, $worker, $nutritionBuilder, $envFile)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Meal analysis worker dependency is missing" }
}
if (-not (Test-Path -LiteralPath $nutritionDatabase -PathType Leaf)) {
    & $python $nutritionBuilder --output $nutritionDatabase
    if ($LASTEXITCODE -ne 0) { throw "Unable to build the local USDA nutrition index" }
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$arguments = "`"$worker`" --env `"$envFile`" --status `"$status`""
$action = New-ScheduledTaskAction -Execute $python -Argument $arguments -WorkingDirectory $ProjectRoot
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 2) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -Hidden -StartWhenAvailable -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
    -Description "Creates review-only food-photo drafts with local Ollama and USDA data; never diagnoses or auto-confirms." -Force | Out-Null

if ($VerifyNow) {
    Start-ScheduledTask -TaskName $TaskName
    $deadline = (Get-Date).AddMinutes(3)
    do {
        Start-Sleep -Milliseconds 500
        $task = Get-ScheduledTask -TaskName $TaskName
        $info = Get-ScheduledTaskInfo -TaskName $TaskName
    } while ($task.State -eq "Running" -and (Get-Date) -lt $deadline)
    if ($task.State -eq "Running" -or $info.LastTaskResult -ne 0) { throw "Meal analysis worker verification failed" }
}

$installed = Get-ScheduledTask -TaskName $TaskName
if ($installed.Settings.Hidden -ne $true -or $installed.Actions.Execute -ne $python) {
    throw "Meal analysis worker is not installed as a hidden direct-Python task"
}
Write-Output "Meal analysis worker installed as a hidden direct-Python task."

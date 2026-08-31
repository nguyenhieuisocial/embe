param(
    [string]$ProjectRoot = "C:\EmBe",
    [string]$TaskName = "EmBe-TelegramSecondary"
)

$ErrorActionPreference = "Stop"
$runner = Join-Path $ProjectRoot "scripts\run-telegram-secondary.ps1"
$telegramEnv = Join-Path $ProjectRoot "secrets\telegram-poc.env"
$sessionLine = Get-Content -LiteralPath $telegramEnv | Where-Object {
    $_ -match '^EMBE_TELEGRAM_DPAPI_SESSION_PATH='
} | Select-Object -Last 1
$session = if ($sessionLine) { ($sessionLine -split '=', 2)[1].Trim() } else { "" }
if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) { throw "Telegram secondary runner is missing" }
if (-not $session -or -not (Test-Path -LiteralPath $session -PathType Leaf)) { throw "Encrypted Telegram session is missing" }

$identity = "$env:USERDOMAIN\$env:USERNAME"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$runner`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) `
    -RepetitionInterval (New-TimeSpan -Minutes 10) `
    -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal -Force `
    -Description "Encrypts and replicates queued EmBe secondary copies to private Telegram shards." | Out-Null
Start-ScheduledTask -TaskName $TaskName

$deadline = (Get-Date).AddSeconds(30)
do {
    Start-Sleep -Milliseconds 500
    $task = Get-ScheduledTask -TaskName $TaskName
    $info = Get-ScheduledTaskInfo -TaskName $TaskName
    if ($task.State -ne "Running" -and $info.LastRunTime -gt [datetime]"2000-01-01") { break }
} while ((Get-Date) -lt $deadline)

if ($info.LastTaskResult -ne 0) { throw "Telegram secondary task verification failed" }
[ordered]@{
    task = $TaskName
    principal = $task.Principal.UserId
    last_result = $info.LastTaskResult
    state = [string]$task.State
} | ConvertTo-Json -Compress

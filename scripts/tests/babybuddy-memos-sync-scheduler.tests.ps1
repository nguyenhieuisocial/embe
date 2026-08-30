param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$installerPath = Join-Path $projectRoot "scripts\install-babybuddy-memos-sync-current-user.ps1"
$source = Get-Content -LiteralPath $installerPath -Raw

$tokens = $null
$parseErrors = $null
[System.Management.Automation.Language.Parser]::ParseFile($installerPath, [ref]$tokens, [ref]$parseErrors) | Out-Null
if ($parseErrors.Count -ne 0) {
    throw "Current-user scheduler installer has PowerShell syntax errors."
}

foreach ($required in @(
    'babybuddy-memos-sync\sync.env',
    'src\embe_sync\main.py',
    'New-TimeSpan -Minutes 1',
    '-LogonType Interactive',
    '-RunLevel Limited',
    '-MultipleInstances IgnoreNew',
    '--once',
    '--status',
    '--log',
    'LastRunTime -gt $previousRun',
    'LastTaskResult -ne 0',
    'ConvertTo-Json -Compress'
)) {
    if (-not $source.Contains($required)) {
        throw "Current-user scheduler installer is missing: $required"
    }
}

foreach ($forbidden in @(
    '-RunLevel Highest',
    '-LogonType Password',
    'New-LocalUser',
    'BABYBUDDY_TOKEN=',
    'MEMOS_SYNC_PAT='
)) {
    if ($source.Contains($forbidden)) {
        throw "Current-user scheduler installer contains unsafe behavior: $forbidden"
    }
}

Write-Output "PASS: BabyBuddy sync uses a non-elevated current-user task and secret-free command line"

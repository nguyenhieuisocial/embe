param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$installer = Get-Content -LiteralPath (Join-Path $projectRoot "scripts\install-portal-sync.ps1") -Raw
$provisioner = Get-Content -LiteralPath (Join-Path $projectRoot "scripts\provision-local-integrations.ps1") -Raw

foreach ($required in @(
    "sync_portal.py",
    "New-TimeSpan -Minutes 5",
    "LastTaskResult -ne 0",
    "approved private Memos",
    "EmBePortalSyncSvc",
    "EmBeCredentialSvc",
    "LogonType Password",
    "RunLevel Limited",
    "RotateOnly",
    "data\status\portal-sync.json",
    "data\logs\portal-sync.jsonl"
)) {
    if (-not $installer.Contains($required)) { throw "Portal sync installer is missing: $required" }
}
foreach ($forbidden in @(
    '-UserId "SYSTEM"',
    '-RunLevel Highest'
)) {
    if ($installer.Contains($forbidden)) { throw "Portal sync must not run with elevated machine privileges: $forbidden" }
}
foreach ($required in @(
    "RandomNumberGenerator",
    "MEMOS_PORTAL_PAT",
    "SUPABASE_SECRET_KEY",
    "icacls.exe",
    "portal-sync.env",
    "Save-SyncEnvFile",
    "personalAccessTokens",
    "DELETE",
    "ForceRotate"
)) {
    if (-not $provisioner.Contains($required)) { throw "Integration provisioner is missing: $required" }
}

Write-Output "PASS: portal sync is scheduled, verified, and uses restricted integration secrets"

param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$provisioner = Get-Content -LiteralPath (Join-Path $projectRoot "scripts\provision-babybuddy-sync.ps1") -Raw

foreach ($required in @(
    'username=\"embe-sync\"',
    'view_note',
    'view_child',
    'view_tag',
    'set_unusable_password',
    'EmBe BabyBuddy Bridge',
    'role = "USER"',
    'expiresInDays = 90',
    '/api/v1/auth/me',
    'MEMOS_BABYBUDDY_PORTAL_PAT',
    'BabyBuddy portal read',
    'secrets\runtime\babybuddy-memos-sync',
    'data\appdata\sync-daemon',
    '/inheritance:r',
    'old_credentials_pending'
)) {
    if (-not $provisioner.Contains($required)) { throw "BabyBuddy provisioner is missing: $required" }
}

foreach ($forbidden in @(
    'BABYBUDDY_TOKEN=$($values.',
    'MEMOS_SYNC_PAT=$($values.MEMOS_SYNC_PAT)',
    '[switch]$ForceRotate',
    'old.delete()'
)) {
    if ($provisioner.Contains($forbidden)) { throw "BabyBuddy runtime must not reuse an administrator credential: $forbidden" }
}

Write-Output "PASS: BabyBuddy bridge uses isolated identities, expiring credentials, and restricted runtime storage"

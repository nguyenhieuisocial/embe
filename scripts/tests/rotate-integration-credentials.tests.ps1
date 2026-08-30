param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$rotation = Get-Content -LiteralPath (Join-Path $projectRoot "scripts\rotate-babybuddy-memos-pats.ps1") -Raw
$wrapper = Get-Content -LiteralPath (Join-Path $projectRoot "scripts\rotate-integration-credentials.ps1") -Raw

foreach ($required in @(
    "AddDays(14)",
    "expiresInDays = 90",
    "BabyBuddy milestone bridge",
    "BabyBuddy portal read",
    "/api/v1/auth/me",
    "MEMOS_BABYBUDDY_PORTAL_PAT",
    "/inheritance:r",
    "projectOwnerIdentity",
    "old_credentials_pending"
)) {
    if (-not $rotation.Contains($required)) { throw "BabyBuddy Memos rotation is missing: $required" }
}
if ($rotation.IndexOf('Save-Env $portal') -gt $rotation.IndexOf('foreach ($oldToken')) {
    throw "Replacement credentials must be persisted before old credentials are revoked"
}
foreach ($required in @("provision-local-integrations.ps1", "rotate-babybuddy-memos-pats.ps1")) {
    if (-not $wrapper.Contains($required)) { throw "Integration rotation wrapper is missing: $required" }
}

Write-Output "PASS: integration credentials rotate before expiry and old tokens survive until safe replacement"

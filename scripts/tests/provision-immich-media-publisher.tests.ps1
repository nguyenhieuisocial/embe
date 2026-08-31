param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$provisioner = Get-Content -LiteralPath (Join-Path $projectRoot "scripts\provision-immich-media-publisher.ps1") -Raw

foreach ($required in @(
    'asset.read',
    'asset.view',
    'EmBe Portal Publisher',
    'albumName = "Em Bé"',
    '/api/system-metadata/admin-onboarding',
    '/api/search/metadata',
    '/api/assets/',
    'EMBE_MEDIA_PUBLISHER_ENABLED=true',
    '/inheritance:r',
    'EmBePortalSyncSvc'
)) {
    if (-not $provisioner.Contains($required)) { throw "Immich media provisioner is missing: $required" }
}

foreach ($forbidden in @(
    'asset.upload',
    'asset.delete',
    'album.delete',
    '"all"',
    'Write-Output $secret',
    'Write-Host $secret'
)) {
    if ($provisioner.Contains($forbidden)) { throw "Immich publisher must stay least-privileged: $forbidden" }
}

Write-Output "PASS: Immich media publisher provisioning is scoped, private, and least-privileged"

param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$composeSource = Get-Content -LiteralPath (Join-Path $projectRoot "infra\compose\core.yml") -Raw
if ($composeSource -notmatch '(?m)^name:\s*embe\s*$') {
    throw "Compose project name must remain embe"
}

$contracts = [ordered]@{
    "scripts\provision-immich-family-account.ps1" = @("embe-immich-postgres-1")
    "scripts\backup\prepare-snapshots.ps1" = @("embe-immich-postgres-1")
    "scripts\health\immich-family-state.py" = @("embe-immich-postgres-1")
    "scripts\health\health-audit.ps1" = @(
        "embe-immich-server-1",
        "embe-immich-postgres-1",
        "embe-immich-redis-1",
        "embe-immich-machine-learning-1"
    )
}

foreach ($entry in $contracts.GetEnumerator()) {
    $source = Get-Content -LiteralPath (Join-Path $projectRoot $entry.Key) -Raw
    foreach ($containerName in $entry.Value) {
        if (-not $source.Contains($containerName)) {
            throw "$($entry.Key) must use Compose project container name: $containerName"
        }
    }
    if ($source.Contains("compose-immich-")) {
        throw "$($entry.Key) still uses the obsolete Compose project prefix"
    }
}

Write-Output "PASS: Immich scripts use the canonical EmBe Compose container names"

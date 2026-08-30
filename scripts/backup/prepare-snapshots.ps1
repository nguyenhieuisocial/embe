param(
    [string]$AppDataRoot = "C:\EmBe\data\appdata",
    [string]$OutputRoot = "C:\EmBe\exports\backup-staging",
    [string]$PythonPath = "C:\EmBe\.venv\Scripts\python.exe",
    [string]$ImmichContainer = "compose-immich-postgres-1",
    [switch]$SkipImmich
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$helper = Join-Path $PSScriptRoot "sqlite-backup.py"
foreach ($required in @($AppDataRoot, $PythonPath, $helper)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "Required path is missing: $required"
    }
}

$session = Join-Path $OutputRoot ((Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ-") + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $session -Force | Out-Null

$databases = [ordered]@{
    babybuddy = Join-Path $AppDataRoot "babybuddy\data\db.sqlite3"
    memos = Join-Path $AppDataRoot "memos\memos_prod.db"
    grocy = Join-Path $AppDataRoot "grocy\data\grocy.db"
}

$artifacts = @()
foreach ($item in $databases.GetEnumerator()) {
    if (-not (Test-Path -LiteralPath $item.Value -PathType Leaf)) {
        throw "Database is missing: $($item.Value)"
    }
    $destination = Join-Path $session ("$($item.Key).sqlite3")
    & $PythonPath $helper $item.Value $destination
    if ($LASTEXITCODE -ne 0) {
        throw "SQLite backup failed: $($item.Key)"
    }
    $artifacts += $destination
}

if (-not $SkipImmich) {
    $containerStatus = (& docker inspect --format '{{.State.Running}}' $ImmichContainer 2>$null).Trim()
    if ($LASTEXITCODE -ne 0 -or $containerStatus -ne "true") {
        throw "Immich PostgreSQL container is not running: $ImmichContainer"
    }
    $containerDump = "/tmp/embe-immich-backup.dump"
    $hostDump = Join-Path $session "immich-postgres.dump"
    try {
        & docker exec $ImmichContainer pg_dump --username postgres --dbname immich --format custom --clean --if-exists --no-owner --no-privileges --file $containerDump
        if ($LASTEXITCODE -ne 0) { throw "Immich pg_dump failed" }
        & docker cp "${ImmichContainer}:${containerDump}" $hostDump
        if ($LASTEXITCODE -ne 0) { throw "Unable to copy Immich dump" }
        if ((Get-Item -LiteralPath $hostDump).Length -eq 0) { throw "Immich dump is empty" }
        $artifacts += $hostDump
    } finally {
        & docker exec $ImmichContainer rm -f $containerDump 2>$null | Out-Null
    }
}

$entries = foreach ($artifact in $artifacts) {
    [ordered]@{
        name = Split-Path -Leaf $artifact
        size_bytes = (Get-Item -LiteralPath $artifact).Length
        sha256 = (Get-FileHash -LiteralPath $artifact -Algorithm SHA256).Hash.ToLowerInvariant()
    }
}
$manifestPath = Join-Path $session "snapshot-manifest.json"
[ordered]@{
    created_utc = (Get-Date).ToUniversalTime().ToString("o")
    artifacts = @($entries)
} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

[ordered]@{
    status = "ok"
    session = $session
    manifest = $manifestPath
    artifact_count = $entries.Count
} | ConvertTo-Json -Compress

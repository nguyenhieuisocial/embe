param()

$ErrorActionPreference = "Stop"
$root = Join-Path $env:TEMP ("embe-snapshot-test-" + [guid]::NewGuid().ToString("N"))
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$python = Join-Path $projectRoot ".venv\Scripts\python.exe"
$script = Join-Path $projectRoot "scripts\backup\prepare-snapshots.ps1"
$fixture = Join-Path $projectRoot "scripts\tests\create-sqlite-fixture.py"

try {
    foreach ($relative in @("babybuddy\data", "memos", "grocy\data")) {
        New-Item -ItemType Directory -Path (Join-Path $root "appdata\$relative") -Force | Out-Null
    }
    foreach ($db in @("babybuddy\data\db.sqlite3", "memos\memos_prod.db", "grocy\data\grocy.db")) {
        & $python $fixture (Join-Path $root "appdata\$db")
        if ($LASTEXITCODE -ne 0) { throw "Unable to create SQLite fixture" }
    }

    $result = & powershell -NoProfile -ExecutionPolicy Bypass -File $script -AppDataRoot (Join-Path $root "appdata") -OutputRoot (Join-Path $root "output") -PythonPath $python -SkipImmich | ConvertFrom-Json
    if ($result.status -ne "ok" -or $result.artifact_count -ne 3) { throw "Snapshot result is invalid" }
    $manifest = Get-Content -LiteralPath $result.manifest -Raw | ConvertFrom-Json
    if ($manifest.artifacts.Count -ne 3) { throw "Snapshot manifest is incomplete" }
    foreach ($artifact in $manifest.artifacts) {
        $path = Join-Path $result.session $artifact.name
        if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $artifact.sha256) {
            throw "Snapshot checksum mismatch: $($artifact.name)"
        }
    }
    Write-Output "PASS: consistent SQLite snapshots and manifest"
} finally {
    if (Test-Path -LiteralPath $root) {
        $resolved = [IO.Path]::GetFullPath($root)
        $temp = [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') + '\'
        if (-not ($resolved + '\').StartsWith($temp, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to remove path outside TEMP"
        }
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}

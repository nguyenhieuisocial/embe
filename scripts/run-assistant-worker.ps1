param([string]$ProjectRoot = "C:\EmBe")

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$python = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$worker = Join-Path $ProjectRoot "services\assistant-worker\src\assistant_worker.py"
$portalEnv = Join-Path $ProjectRoot "secrets\runtime\portal-sync.env"
$database = Join-Path $ProjectRoot "data\analytics\family.sqlite3"
$status = Join-Path $ProjectRoot "data\status\assistant-worker.json"
foreach ($path in @($python, $worker, $portalEnv, $database)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Assistant worker dependency is missing" }
}

$oldPythonPath = $env:PYTHONPATH
try {
    $env:PYTHONPATH = Join-Path $ProjectRoot "services\mcp-readonly\src"
    & $python $worker --env $portalEnv --database $database --status $status --child-id "embe"
    if ($LASTEXITCODE -ne 0) { throw "Assistant worker returned a failure" }
} finally {
    if ($null -eq $oldPythonPath) { Remove-Item Env:\PYTHONPATH -ErrorAction SilentlyContinue }
    else { $env:PYTHONPATH = $oldPythonPath }
}

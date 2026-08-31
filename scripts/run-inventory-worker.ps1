param(
    [string]$ProjectRoot = "C:\EmBe"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$credentialPath = Join-Path $ProjectRoot "secrets\runtime\grocy-analytics-api.credential.clixml"
$python = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$worker = Join-Path $ProjectRoot "services\inventory-worker\src\inventory_worker.py"
$portalEnv = Join-Path $ProjectRoot "secrets\runtime\portal-sync.env"
$status = Join-Path $ProjectRoot "data\status\inventory-worker.json"

foreach ($path in @($credentialPath, $python, $worker, $portalEnv)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Inventory worker dependency is missing"
    }
}

$secureKey = Import-Clixml -LiteralPath $credentialPath
$plainKey = [System.Net.NetworkCredential]::new("", $secureKey).Password
try {
    $env:GROCY_API_KEY = $plainKey
    & $python $worker --env $portalEnv --status $status
    if ($LASTEXITCODE -ne 0) { throw "Inventory worker returned a failure" }
} finally {
    Remove-Item Env:\GROCY_API_KEY -ErrorAction SilentlyContinue
    $plainKey = $null
    if ($secureKey -is [IDisposable]) { $secureKey.Dispose() }
}

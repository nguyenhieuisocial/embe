[CmdletBinding()]
param(
    [string]$ProjectRoot = "C:\EmBe",
    [string]$OutputPath = "",
    [switch]$ReadData
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
if (-not $OutputPath) { $OutputPath = Join-Path $ProjectRoot "data\status\restic-check.json" }

$envFile = Join-Path $ProjectRoot "infra\compose\storage-poc.env"
$passwordFile = Join-Path $ProjectRoot "secrets\restic-r2-password.txt"
$restic = Join-Path $ProjectRoot "tools\bin\restic.exe"
foreach ($path in @($envFile, $passwordFile, $restic)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Restic integrity dependency is unavailable" }
}
Get-Content -LiteralPath $envFile | Where-Object { $_ -and -not $_.StartsWith("#") } | ForEach-Object {
    $parts = $_ -split "=", 2
    [Environment]::SetEnvironmentVariable($parts[0], $parts[1], "Process")
}
foreach ($name in @("EMBE_R2_ACCOUNT_ID", "EMBE_R2_ACCESS_KEY_ID", "EMBE_R2_SECRET_ACCESS_KEY")) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) { throw "Required R2 setting is missing" }
}
$env:AWS_ACCESS_KEY_ID = $env:EMBE_R2_ACCESS_KEY_ID
$env:AWS_SECRET_ACCESS_KEY = $env:EMBE_R2_SECRET_ACCESS_KEY
$env:AWS_DEFAULT_REGION = "auto"
$repository = "s3:https://$($env:EMBE_R2_ACCOUNT_ID).r2.cloudflarestorage.com/embe-backup/restic-critical"
$arguments = @("-r", $repository, "-p", $passwordFile, "check")
if ($ReadData) { $arguments += "--read-data" }

$started = [DateTimeOffset]::UtcNow
$resticOutput = & $restic @arguments 2>&1
$exitCode = $LASTEXITCODE
$report = [ordered]@{
    schema_version = 1
    checked_at = [DateTimeOffset]::UtcNow.ToString("o")
    status = $(if ($exitCode -eq 0) { "pass" } else { "critical" })
    read_data = [bool]$ReadData
    duration_seconds = [math]::Round(([DateTimeOffset]::UtcNow - $started).TotalSeconds, 2)
}
New-Item -ItemType Directory (Split-Path $OutputPath -Parent) -Force | Out-Null
$temporary = "$OutputPath.tmp"
[IO.File]::WriteAllText($temporary, ($report | ConvertTo-Json -Depth 4), [Text.UTF8Encoding]::new($false))
Move-Item $temporary $OutputPath -Force
$report | ConvertTo-Json -Compress
exit $exitCode

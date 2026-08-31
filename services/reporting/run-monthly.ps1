param(
    [string]$Month = "",
    [string]$DataPath = "",
    [string]$OutputRoot = "C:\EmBe\output\pdf",
    [string]$StatusPath = "C:\EmBe\data\status\monthly-report.json",
    [string]$ProjectRoot = "C:\EmBe"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$python = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$exporter = Join-Path $ProjectRoot "services\reporting\monthly_export.py"
$renderer = Join-Path $ProjectRoot "services\reporting\render-monthly.ps1"
$preflight = Join-Path $ProjectRoot "services\reporting\preflight_monthly.py"
$envPath = Join-Path $ProjectRoot "secrets\runtime\portal-sync.env"

if (-not $Month) {
    $Month = & $python -c "import sys; sys.path.insert(0, r'$ProjectRoot\services\reporting'); from monthly_export import previous_month_key; print(previous_month_key())"
    if ($LASTEXITCODE -ne 0) { throw "Unable to determine the previous month" }
}
if ($Month -notmatch '^\d{4}-(0[1-9]|1[0-2])$') { throw "Month must use YYYY-MM" }

$outputDirectory = [IO.Path]::GetFullPath($OutputRoot)
$rootPrefix = [IO.Path]::GetFullPath($ProjectRoot).TrimEnd('\') + '\'
foreach ($path in @($outputDirectory, [IO.Path]::GetFullPath($StatusPath))) {
    if (-not $path.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Monthly report paths must stay inside C:\EmBe"
    }
}

New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$pdf = Join-Path $outputDirectory "embe-monthly-$Month.pdf"
$manifest = Join-Path $outputDirectory "embe-monthly-$Month.manifest.json"
$qa = Join-Path $outputDirectory "embe-monthly-$Month.qa.json"
$sourceMode = "provided_snapshot"
if (-not $DataPath) {
    $sourceMode = "curated_memos"
    $DataPath = Join-Path $ProjectRoot "exports\monthly\$Month\source.json"
    & $python $exporter --env $envPath --month $Month --output $DataPath
    if ($LASTEXITCODE -ne 0) { throw "Monthly source export failed" }
}

$sourceData = Get-Content -LiteralPath $DataPath -Raw | ConvertFrom-Json
$sourceEventCount = $null
if ($sourceMode -eq "curated_memos") {
    if ($sourceData.status -ne "DRAFT" -or
        $sourceData.PSObject.Properties.Name -notcontains "source_manifest" -or
        $sourceData.source_manifest.PSObject.Properties.Name -notcontains "event_count" -or
        [int]$sourceData.source_manifest.event_count -lt 0) {
        throw "Curated monthly source provenance is invalid"
    }
    $sourceEventCount = [int]$sourceData.source_manifest.event_count
}

& $renderer -DataPath $DataPath -OutputPath $pdf -ManifestPath $manifest
if ($LASTEXITCODE -ne 0) { throw "Monthly PDF render failed" }
& $python $preflight --pdf $pdf --output $qa
if ($LASTEXITCODE -ne 0) { throw "Monthly PDF preflight failed" }

$manifestData = Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
$qaData = Get-Content -LiteralPath $qa -Raw | ConvertFrom-Json
$result = [ordered]@{
    schema_version = 1
    status = "ok"
    book_status = [string]$manifestData.status
    month = $Month
    generated_at_utc = (Get-Date).ToUniversalTime().ToString("o")
    pdf_sha256 = [string]$manifestData.output_sha256
    pages = [int]$qaData.pages
    source_mode = $sourceMode
    source_event_count = $sourceEventCount
}
$statusDirectory = Split-Path -Parent $StatusPath
New-Item -ItemType Directory -Path $statusDirectory -Force | Out-Null
$temporary = "$StatusPath.tmp"
[IO.File]::WriteAllText($temporary, ($result | ConvertTo-Json -Depth 4), [Text.UTF8Encoding]::new($false))
Move-Item -LiteralPath $temporary -Destination $StatusPath -Force
$result | ConvertTo-Json -Compress

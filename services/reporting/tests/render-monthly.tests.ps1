$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$renderScript = Join-Path $projectRoot "services\reporting\render-monthly.ps1"
$fixture = Join-Path $projectRoot "services\reporting\fixtures\2026-08.sample.json"
$template = Join-Path $projectRoot "services\reporting\templates\monthly-book.typ"
$pdfTempRoot = Join-Path $projectRoot "tmp\pdfs"
$testRoot = Join-Path $pdfTempRoot ("embe-reporting-" + [guid]::NewGuid().ToString("N"))
$output = Join-Path $testRoot "monthly-sample.pdf"
$manifest = Join-Path $testRoot "monthly-sample.manifest.json"
$qa = Join-Path $testRoot "monthly-sample.qa.json"
$python = "C:\Users\Admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$preflight = Join-Path $projectRoot "services\reporting\preflight_monthly.py"

try {
    New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
    & pwsh -NoProfile -File $renderScript -DataPath $fixture -OutputPath $output -ManifestPath $manifest
    if ($LASTEXITCODE -ne 0) { throw "Report renderer failed" }
    if (-not (Test-Path -LiteralPath $output -PathType Leaf)) { throw "PDF was not created" }
    if (-not (Test-Path -LiteralPath $manifest -PathType Leaf)) { throw "PDF manifest was not created" }
    $templateSource = Get-Content -LiteralPath $template -Raw
    if ($templateSource -notmatch 'inset: \(x: 7pt, y: 5pt\)') {
        throw "Table cell padding contract changed"
    }
    if ($templateSource -notmatch 'heading\(numbering: "1\.1"') {
        throw "Multilevel heading numbering is missing"
    }

    $verification = & $python -c @'
import json, sys
from pypdf import PdfReader

reader = PdfReader(sys.argv[1])
text = "\n".join(page.extract_text() or "" for page in reader.pages)
result = {
    "pages": len(reader.pages),
    "has_toc": "Mục lục" in text,
    "has_section": "Nhật ký trong tháng" in text,
    "has_subsection": "Khoảnh khắc đáng nhớ" in text,
    "has_disclaimer": "quyết định y khoa" in text,
}

print(json.dumps(result))
'@ $output | ConvertFrom-Json

    if ($verification.pages -lt 4) { throw "Expected at least four pages" }
    if (-not $verification.has_toc) { throw "Generated PDF is missing the table of contents" }
    if (-not $verification.has_section) { throw "Generated PDF is missing a level-one section" }
    if (-not $verification.has_subsection) { throw "Generated PDF is missing a level-two section" }
    if (-not $verification.has_disclaimer) { throw "Generated PDF is missing the safety disclaimer" }

    $manifestData = Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
    if ($manifestData.status -ne "DRAFT") { throw "Monthly book must remain a draft until family review" }
    if ($manifestData.output_sha256 -ne (Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash.ToLowerInvariant()) {
        throw "PDF checksum does not match its manifest"
    }
    if ($manifestData.source_sha256 -ne (Get-FileHash -LiteralPath $fixture -Algorithm SHA256).Hash.ToLowerInvariant()) {
        throw "Source checksum does not match its manifest"
    }

    & $python $preflight --pdf $output --output $qa
    if ($LASTEXITCODE -ne 0) { throw "Monthly PDF preflight failed" }
    $qaData = Get-Content -LiteralPath $qa -Raw | ConvertFrom-Json
    if (-not $qaData.passed) { throw "Monthly PDF QA report did not pass" }
    if ($qaData.sha256 -ne $manifestData.output_sha256) { throw "QA and manifest checksums differ" }

    Write-Output "monthly PDF tests passed"
} finally {
    if (Test-Path -LiteralPath $testRoot) {
        $resolvedTestRoot = [IO.Path]::GetFullPath($testRoot).TrimEnd('\') + '\'
        $resolvedTempRoot = [IO.Path]::GetFullPath($pdfTempRoot).TrimEnd('\') + '\'
        if (-not $resolvedTestRoot.StartsWith($resolvedTempRoot, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to clean path outside tmp/pdfs"
        }
        Remove-Item -LiteralPath $resolvedTestRoot -Recurse -Force
    }
}

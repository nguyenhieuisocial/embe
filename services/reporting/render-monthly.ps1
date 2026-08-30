param(
    [Parameter(Mandatory = $true)]
    [string]$DataPath,

    [Parameter(Mandatory = $true)]
    [string]$OutputPath,

    [string]$TypstPath,

    [string]$ManifestPath
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$templatePath = Join-Path $PSScriptRoot "templates\monthly-book.typ"
if ([string]::IsNullOrWhiteSpace($TypstPath)) {
    $TypstPath = Join-Path $projectRoot "tools\bin\typst.exe"
}

function Resolve-ProjectFile {
    param([string]$Path, [string]$Label, [switch]$MustExist)

    $resolved = [IO.Path]::GetFullPath($Path)
    $rootPrefix = [IO.Path]::GetFullPath($projectRoot).TrimEnd('\') + '\'
    if (-not $resolved.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "$Label must stay inside C:\EmBe"
    }
    if ($MustExist -and -not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
        throw "$Label is missing: $resolved"
    }
    return $resolved
}

$resolvedData = Resolve-ProjectFile -Path $DataPath -Label "DataPath" -MustExist
$resolvedOutput = Resolve-ProjectFile -Path $OutputPath -Label "OutputPath"
$resolvedTemplate = Resolve-ProjectFile -Path $templatePath -Label "Template" -MustExist
if ([string]::IsNullOrWhiteSpace($ManifestPath)) {
    $ManifestPath = Join-Path (Split-Path -Parent $resolvedOutput) (([IO.Path]::GetFileNameWithoutExtension($resolvedOutput)) + ".manifest.json")
}

function Get-ProjectRelativePath([string]$BasePath, [string]$TargetPath) {
    $base = [IO.Path]::GetFullPath($BasePath).TrimEnd('\') + '\'
    $baseUri = [Uri]$base
    $targetUri = [Uri][IO.Path]::GetFullPath($TargetPath)
    return [Uri]::UnescapeDataString($baseUri.MakeRelativeUri($targetUri).ToString())
}
$resolvedManifest = Resolve-ProjectFile -Path $ManifestPath -Label "ManifestPath"

if (-not (Test-Path -LiteralPath $TypstPath -PathType Leaf)) {
    throw "Typst binary is missing: $TypstPath"
}

$data = Get-Content -LiteralPath $resolvedData -Raw | ConvertFrom-Json
foreach ($required in @("title", "month", "family", "sections")) {
    if ($data.PSObject.Properties.Name -notcontains $required) {
        throw "Monthly data is missing required field: $required"
    }
}
if (@($data.sections).Count -eq 0) {
    throw "Monthly data must contain at least one section"
}

$outputDirectory = Split-Path -Parent $resolvedOutput
if (-not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

$relativeData = Get-ProjectRelativePath (Split-Path -Parent $resolvedTemplate) $resolvedData
$arguments = @(
    "compile",
    "--root", $projectRoot,
    "--input", "data=$relativeData",
    $resolvedTemplate,
    $resolvedOutput
)

$compilerOutput = & $TypstPath @arguments 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "Typst compile failed:`n$($compilerOutput | Out-String)"
}
if (-not (Test-Path -LiteralPath $resolvedOutput -PathType Leaf)) {
    throw "Typst reported success but PDF is missing: $resolvedOutput"
}

$sourceHash = (Get-FileHash -LiteralPath $resolvedData -Algorithm SHA256).Hash.ToLowerInvariant()
$outputHash = (Get-FileHash -LiteralPath $resolvedOutput -Algorithm SHA256).Hash.ToLowerInvariant()
$manifest = [ordered]@{
    schema_version = 1
    status = "DRAFT"
    generated_at_utc = (Get-Date).ToUniversalTime().ToString("o")
    title = [string]$data.title
    month = [string]$data.month
    family = [string]$data.family
    section_count = @($data.sections).Count
    source = Get-ProjectRelativePath $projectRoot $resolvedData
    source_sha256 = $sourceHash
    output = Get-ProjectRelativePath $projectRoot $resolvedOutput
    output_sha256 = $outputHash
    renderer = "typst"
}
$manifestDirectory = Split-Path -Parent $resolvedManifest
if (-not (Test-Path -LiteralPath $manifestDirectory)) {
    New-Item -ItemType Directory -Path $manifestDirectory -Force | Out-Null
}
$manifestTemporary = "$resolvedManifest.tmp"
try {
    [IO.File]::WriteAllText($manifestTemporary, ($manifest | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $manifestTemporary -Destination $resolvedManifest -Force
} finally {
    if (Test-Path -LiteralPath $manifestTemporary -PathType Leaf) {
        Remove-Item -LiteralPath $manifestTemporary -Force
    }
}

[ordered]@{
    status = "ok"
    output = $resolvedOutput
    source = $resolvedData
    manifest = $resolvedManifest
    output_sha256 = $outputHash
} | ConvertTo-Json

param(
    [Parameter(Mandatory = $true)]
    [string]$DataPath,

    [Parameter(Mandatory = $true)]
    [string]$OutputPath,

    [string]$TypstPath
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

$relativeData = [IO.Path]::GetRelativePath((Split-Path -Parent $resolvedTemplate), $resolvedData).Replace('\', '/')
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

[ordered]@{
    status = "ok"
    output = $resolvedOutput
    source = $resolvedData
} | ConvertTo-Json

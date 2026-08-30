$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$manifestPath = Join-Path $projectRoot "tools\toolchain.json"
$installerPath = Join-Path $projectRoot "scripts\install-toolchain.ps1"

if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "Pinned toolchain manifest is missing"
}

if (-not (Test-Path -LiteralPath $installerPath)) {
    throw "Toolchain installer is missing"
}

$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$requiredNames = @("sops", "age", "restic", "cloudflared", "typst")

foreach ($name in $requiredNames) {
    $tool = @($manifest.tools | Where-Object name -eq $name)
    if ($tool.Count -ne 1) {
        throw "Manifest must define exactly one pinned entry for $name"
    }
}

$outputs = @{}
foreach ($tool in $manifest.tools) {
    if ($tool.url -notmatch '^https://github\.com/.+/releases/download/[^/]+/[^/]+$') {
        throw "$($tool.name) must use an immutable GitHub release URL"
    }
    if ($tool.url -match '/latest/') {
        throw "$($tool.name) must not use a latest-release URL"
    }
    if ($tool.sha256 -notmatch '^[a-f0-9]{64}$') {
        throw "$($tool.name) must pin a SHA-256 digest"
    }
    if ($tool.output -notmatch '^[a-z0-9-]+\.exe$') {
        throw "$($tool.name) has an unsafe output filename"
    }
    if ($outputs.ContainsKey($tool.output)) {
        throw "Tool outputs must be unique"
    }
    $outputs[$tool.output] = $true
}

Write-Output "toolchain installer tests passed"

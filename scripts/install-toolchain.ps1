param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $projectRoot "tools\toolchain.json"
$binPath = Join-Path $projectRoot "tools\bin"
$stagingRoot = Join-Path $projectRoot "tools\staging"
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json

New-Item -ItemType Directory -Force -Path $binPath, $stagingRoot | Out-Null

foreach ($tool in $manifest.tools) {
    $destination = Join-Path $binPath $tool.output
    if ((Test-Path -LiteralPath $destination) -and -not $Force) {
        Write-Output "$($tool.name) already installed"
        continue
    }

    $stagingPath = Join-Path $stagingRoot ([guid]::NewGuid().ToString("N"))
    $resolvedStagingRoot = [System.IO.Path]::GetFullPath($stagingRoot).TrimEnd('\') + '\'
    $resolvedStagingPath = [System.IO.Path]::GetFullPath($stagingPath).TrimEnd('\') + '\'
    if (-not $resolvedStagingPath.StartsWith($resolvedStagingRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Unsafe staging path for $($tool.name)"
    }

    New-Item -ItemType Directory -Path $stagingPath | Out-Null
    try {
        $downloadName = [System.IO.Path]::GetFileName(([uri]$tool.url).AbsolutePath)
        $downloadPath = Join-Path $stagingPath $downloadName
        Invoke-WebRequest -Uri $tool.url -OutFile $downloadPath

        $actualHash = (Get-FileHash -LiteralPath $downloadPath -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actualHash -ne $tool.sha256) {
            throw "Checksum mismatch for $($tool.name)"
        }

        if ($tool.archive -eq "zip") {
            $extractPath = Join-Path $stagingPath "extracted"
            Expand-Archive -LiteralPath $downloadPath -DestinationPath $extractPath
            $matches = @(Get-ChildItem -LiteralPath $extractPath -Recurse -File -Filter $tool.binaryPattern)
            if ($matches.Count -ne 1) {
                throw "Expected one $($tool.binaryPattern) in $($tool.name) archive"
            }
            $binaryPath = $matches[0].FullName
        } elseif ($tool.archive -eq "exe") {
            $binaryPath = $downloadPath
        } else {
            throw "Unsupported archive type for $($tool.name)"
        }

        Copy-Item -LiteralPath $binaryPath -Destination $destination -Force
        Write-Output "installed $($tool.name) $($tool.version)"
    } finally {
        if (Test-Path -LiteralPath $stagingPath) {
            Remove-Item -LiteralPath $stagingPath -Recurse -Force
        }
    }
}

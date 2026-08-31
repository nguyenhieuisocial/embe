[CmdletBinding()]
param(
    [string]$ProjectRoot = "C:\EmBe",
    [string]$DockerBasePath = (Join-Path $env:LOCALAPPDATA "Docker"),
    [string]$SecretsEnginePath = (Join-Path $env:LOCALAPPDATA "docker-secrets-engine"),
    [string]$DockerDesktopPath = "C:\Program Files\Docker\Docker\Docker Desktop.exe",
    [string]$StatusPath = "",
    [switch]$SkipStart
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not $StatusPath) { $StatusPath = Join-Path $ProjectRoot "data\status\local-runtime.json" }
$startedAt = [DateTimeOffset]::UtcNow

function Write-RuntimeStatus([string]$Status, [hashtable]$Evidence) {
    $payload = [ordered]@{
        schema_version = 1
        generated_at = [DateTimeOffset]::UtcNow.ToString("o")
        status = $Status
        docker_ready = [bool]$Evidence.docker_ready
        ollama_ready = [bool]$Evidence.ollama_ready
        runtime_directories_quarantined = [int]$Evidence.runtime_directories_quarantined
        error_type = [string]$Evidence.error_type
        privacy = "No family content, credential, socket path, or process output is included."
    }
    [IO.Directory]::CreateDirectory((Split-Path $StatusPath -Parent)) | Out-Null
    $temporary = "$StatusPath.tmp"
    [IO.File]::WriteAllText($temporary, ($payload | ConvertTo-Json -Depth 4), [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temporary -Destination $StatusPath -Force
}

function Move-StaleRuntimeDirectory(
    [string]$SourcePath,
    [string]$ExpectedParentPath,
    [string]$BackupPrefix
) {
    if (-not (Test-Path -LiteralPath $SourcePath -PathType Container)) { return $false }
    $item = Get-Item -LiteralPath $SourcePath -Force
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw "Runtime parent directory must not be a reparse point"
    }
    $sourceFull = [IO.Path]::GetFullPath($SourcePath)
    $expectedParentFull = [IO.Path]::GetFullPath($ExpectedParentPath).TrimEnd('\')
    if ($item.Parent.FullName.TrimEnd('\') -ne $expectedParentFull) {
        throw "Runtime directory escaped the approved parent"
    }
    $socketEntries = @(Get-ChildItem -LiteralPath $sourceFull -Force | Where-Object {
        $_.Name -like "*.sock" -or ($_.Attributes -band [IO.FileAttributes]::ReparsePoint)
    })
    if ($socketEntries.Count -eq 0) { return $false }

    $destination = Join-Path $expectedParentFull ("$BackupPrefix-" + (Get-Date -Format "yyyyMMdd-HHmmss-fff"))
    $destinationFull = [IO.Path]::GetFullPath($destination)
    if ((Split-Path -Parent $destinationFull).TrimEnd('\') -ne $expectedParentFull -or (Test-Path -LiteralPath $destinationFull)) {
        throw "Runtime recovery destination is invalid"
    }
    Move-Item -LiteralPath $sourceFull -Destination $destinationFull
    return $true
}

function Test-DockerPipe {
    return Test-Path -LiteralPath "\\.\pipe\dockerDesktopLinuxEngine"
}

function Test-DockerDesktopReady {
    if (-not (Test-DockerPipe)) { return $false }
    try {
        $desktopStatus = (& docker desktop status 2>$null | Out-String).Trim()
        if ($LASTEXITCODE -ne 0 -or $desktopStatus -notmatch '(?m)^Status\s+running\s*$') {
            return $false
        }
        $serverVersion = (& docker info --format '{{.ServerVersion}}' 2>$null | Out-String).Trim()
        return $LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($serverVersion)
    } catch {
        return $false
    }
}

function Wait-Until([scriptblock]$Condition, [int]$TimeoutSeconds, [int]$IntervalSeconds = 2) {
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds($TimeoutSeconds)
    do {
        if (& $Condition) { return $true }
        Start-Sleep -Seconds $IntervalSeconds
    } while ([DateTimeOffset]::UtcNow -lt $deadline)
    return $false
}

$quarantined = 0
try {
    if (-not $SkipStart -and -not (Test-DockerDesktopReady)) {
        Get-Process -Name "Docker Desktop", "com.docker.backend", "docker-desktop" -ErrorAction SilentlyContinue |
            Stop-Process -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        if (@(Get-Process -Name "Docker Desktop", "com.docker.backend", "docker-desktop" -ErrorAction SilentlyContinue).Count) {
            throw "Docker Desktop did not stop cleanly"
        }
    }

    if ($SkipStart -or -not (Test-DockerDesktopReady)) {
        if (Move-StaleRuntimeDirectory -SourcePath (Join-Path $DockerBasePath "run") -ExpectedParentPath $DockerBasePath -BackupPrefix "run-stale-embe") { $quarantined++ }
        $secretsParent = Split-Path -Parent ([IO.Path]::GetFullPath($SecretsEnginePath))
        if (Move-StaleRuntimeDirectory -SourcePath $SecretsEnginePath -ExpectedParentPath $secretsParent -BackupPrefix "docker-secrets-engine-stale-embe") { $quarantined++ }
    }

    if ($SkipStart) {
        Write-RuntimeStatus "prepared" @{ docker_ready = $false; ollama_ready = $false; runtime_directories_quarantined = $quarantined; error_type = "" }
        exit 0
    }

    if (-not (Test-Path -LiteralPath $DockerDesktopPath -PathType Leaf)) { throw "Docker Desktop executable is unavailable" }
    if (-not (Test-DockerDesktopReady)) {
        Start-Process -FilePath $DockerDesktopPath -WindowStyle Hidden
    }
    if (-not (Wait-Until -Condition { Test-DockerDesktopReady } -TimeoutSeconds 180 -IntervalSeconds 3)) {
        throw "Docker engine did not become ready"
    }

    $ollamaStarter = Join-Path $ProjectRoot "scripts\start-ollama.ps1"
    if (-not (Test-Path -LiteralPath $ollamaStarter -PathType Leaf)) { throw "Ollama starter is unavailable" }
    & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $ollamaStarter
    if ($LASTEXITCODE -ne 0) { throw "Ollama failed to start" }
    $ollamaReady = Wait-Until -Condition {
        try {
            $response = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 2
            return @($response.models | ForEach-Object { [string]$_.name }) -contains "qwen3:8b"
        } catch { return $false }
    } -TimeoutSeconds 45 -IntervalSeconds 2
    if (-not $ollamaReady) { throw "Required Ollama model is unavailable" }

    Write-RuntimeStatus "ready" @{ docker_ready = $true; ollama_ready = $true; runtime_directories_quarantined = $quarantined; error_type = "" }
    [ordered]@{ status = "ready"; docker_ready = $true; ollama_ready = $true; runtime_directories_quarantined = $quarantined } | ConvertTo-Json -Compress
    exit 0
} catch {
    Write-RuntimeStatus "error" @{ docker_ready = (Test-DockerDesktopReady); ollama_ready = $false; runtime_directories_quarantined = $quarantined; error_type = $_.Exception.GetType().Name }
    Write-Error "Local runtime startup failed. See the sanitized status file."
    exit 1
}

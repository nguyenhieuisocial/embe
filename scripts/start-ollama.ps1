[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ollama = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
$models = [Environment]::GetEnvironmentVariable("OLLAMA_MODELS", "User")
$hostSetting = [Environment]::GetEnvironmentVariable("OLLAMA_HOST", "User")

if (-not (Test-Path -LiteralPath $ollama -PathType Leaf)) {
    throw "Ollama executable is unavailable"
}
if ([string]::IsNullOrWhiteSpace($models) -or -not (Test-Path -LiteralPath $models -PathType Container)) {
    throw "Ollama model directory is unavailable"
}

$env:OLLAMA_MODELS = $models
if (-not [string]::IsNullOrWhiteSpace($hostSetting)) {
    $env:OLLAMA_HOST = $hostSetting
}

if (-not (Get-Process ollama -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath $ollama -ArgumentList "serve" -WindowStyle Hidden
}

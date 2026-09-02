param(
    [double]$MinimumFreeGB = 100,
    [switch]$Json
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$localBin = Join-Path $projectRoot "tools\bin"

$requiredTools = @(
    @{ Name = "sops"; Path = Join-Path $localBin "sops.exe"; VersionArgs = @("--version") },
    @{ Name = "age"; Path = Join-Path $localBin "age.exe"; VersionArgs = @("--version") },
    @{ Name = "restic"; Path = Join-Path $localBin "restic.exe"; VersionArgs = @("version") },
    @{ Name = "cloudflared"; Path = Join-Path $localBin "cloudflared.exe"; VersionArgs = @("--version") },
    @{ Name = "typst"; Path = Join-Path $localBin "typst.exe"; VersionArgs = @("--version") },
    @{ Name = "supabase"; Path = Join-Path $localBin "supabase.exe"; VersionArgs = @("--version") }
)

$tools = foreach ($tool in $requiredTools) {
    $installed = Test-Path -LiteralPath $tool.Path
    $version = $null

    if ($installed) {
        $versionOutput = & $tool.Path @($tool.VersionArgs) 2>&1
        $versionExitCode = $LASTEXITCODE
        $version = ($versionOutput | Select-Object -First 1).ToString().Trim()
        $installed = $versionExitCode -eq 0
    }

    [ordered]@{
        name = $tool.Name
        installed = $installed
        version = $version
    }
}

$dockerRunning = $false
$dockerVersion = $null
$dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
if ($dockerCommand) {
    $dockerOutput = docker info --format "{{.ServerVersion}}" 2>$null
    $dockerExitCode = $LASTEXITCODE
    $dockerVersion = $dockerOutput | Select-Object -First 1
    $dockerRunning = $dockerExitCode -eq 0 -and -not [string]::IsNullOrWhiteSpace($dockerVersion)
}

$wslCommand = Get-Command wsl.exe -ErrorAction SilentlyContinue
$wslAvailable = $null -ne $wslCommand

$drive = Get-PSDrive -Name C
$freeGB = [math]::Round($drive.Free / 1GB, 1)
$diskPassed = $freeGB -ge $MinimumFreeGB
$allToolsInstalled = ($tools | Where-Object { -not $_.installed }).Count -eq 0
$ready = $allToolsInstalled -and $dockerRunning -and $wslAvailable -and $diskPassed

$result = [ordered]@{
    ready = $ready
    tools = $tools
    docker = [ordered]@{
        installed = $null -ne $dockerCommand
        running = $dockerRunning
        version = $dockerVersion
    }
    wsl = [ordered]@{
        available = $wslAvailable
    }
    disk = [ordered]@{
        drive = "C:"
        freeGB = $freeGB
        minimumFreeGB = $MinimumFreeGB
        passed = $diskPassed
    }
}

if ($Json) {
    $result | ConvertTo-Json -Depth 5
} else {
    $result
}

if (-not $ready) {
    exit 1
}

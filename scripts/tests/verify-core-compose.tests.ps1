$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$composePath = Join-Path $projectRoot "infra\compose\core.yml"
$mediaComposePath = Join-Path $projectRoot "infra\compose\media.yml"
$envPath = Join-Path $projectRoot "infra\compose\core.example.env"

if (-not (Test-Path -LiteralPath $composePath)) {
    throw "Core Compose file is missing"
}

if (-not (Test-Path -LiteralPath $envPath)) {
    throw "Core Compose example environment is missing"
}

if (-not (Test-Path -LiteralPath $mediaComposePath)) {
    throw "Media Compose file is missing"
}

$runtimeEnvPath = "infra/compose/core.env"
git check-ignore --quiet -- $runtimeEnvPath
if ($LASTEXITCODE -ne 0) {
    throw "Runtime Compose environment must be ignored by Git"
}

git check-ignore --quiet --no-index -- "infra/compose/core.example.env"
if ($LASTEXITCODE -eq 0) {
    throw "Example Compose environment must remain committable"
}

$activeSensitiveAssignments = Get-Content -LiteralPath $envPath |
    Where-Object { $_ -notmatch '^\s*(#|$)' -and $_ -match '^\s*[^=]*(PASSWORD|TOKEN|SECRET|KEY)[^=]*=' }
if (@($activeSensitiveAssignments).Count -ne 0) {
    throw "Example Compose environment must not assign sensitive values"
}

$previousDbPassword = $env:IMMICH_DB_PASSWORD
try {
    $env:IMMICH_DB_PASSWORD = "compose-validation-only"
    $configOutput = docker compose --env-file $envPath -f $composePath -f $mediaComposePath --profile media config --format json 2>&1
    $configExitCode = $LASTEXITCODE
} finally {
    $env:IMMICH_DB_PASSWORD = $previousDbPassword
}

if ($configExitCode -ne 0) {
    throw "docker compose config failed: $($configOutput | Out-String)"
}

$config = ($configOutput | Out-String) | ConvertFrom-Json
$requiredServices = @(
    "babybuddy",
    "memos",
    "grocy",
    "node-red",
    "uptime-kuma",
    "immich-server",
    "immich-machine-learning",
    "immich-postgres",
    "immich-redis"
)

foreach ($serviceName in $requiredServices) {
    $service = $config.services.$serviceName
    if ($null -eq $service) { throw "Missing required service: $serviceName" }
    if ([string]::IsNullOrWhiteSpace($service.image)) { throw "$serviceName must use a published image" }
    if ($service.image -match ":latest$") { throw "$serviceName must pin an image version" }
    if ($service.privileged) { throw "$serviceName must not be privileged" }
    if ($service.restart -ne "unless-stopped") { throw "$serviceName must use restart=unless-stopped" }

    foreach ($port in @($service.ports | Where-Object { $null -ne $_ })) {
        if ($port.host_ip -ne "127.0.0.1") {
            throw "$serviceName exposes a port beyond localhost"
        }
    }

    foreach ($mount in @($service.volumes)) {
        if ($mount.source -eq "/var/run/docker.sock" -or $mount.target -eq "/var/run/docker.sock") {
            throw "$serviceName must not mount the Docker socket"
        }
        if ($mount.type -eq "bind") {
            $normalizedSource = ([System.IO.Path]::GetFullPath($mount.source)).TrimEnd('\')
            $normalizedRoot = ([System.IO.Path]::GetFullPath($projectRoot)).TrimEnd('\') + '\'
            if (-not $normalizedSource.StartsWith($normalizedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
                $isDedicatedMediaMount =
                    $serviceName -eq "immich-server" -and
                    $mount.target -eq "/data" -and
                    [System.IO.Path]::IsPathRooted($normalizedSource) -and
                    [System.IO.Path]::GetPathRoot($normalizedSource) -ne [System.IO.Path]::GetPathRoot($normalizedRoot)
                if ($isDedicatedMediaMount) { continue }
                throw "$serviceName bind mounts a host path outside the project root"
            }
        }
    }
}

foreach ($serviceName in @("babybuddy", "memos", "grocy", "node-red", "uptime-kuma", "immich-server", "immich-machine-learning")) {
    if ($null -eq $config.services.$serviceName.healthcheck) {
        throw "$serviceName must define a healthcheck"
    }
}

foreach ($serviceName in @("immich-server", "immich-machine-learning", "immich-postgres", "immich-redis")) {
    if (@($config.services.$serviceName.profiles) -notcontains "media") {
        throw "$serviceName must require the media profile"
    }
}

$mediaMount = @($config.services."immich-server".volumes) |
    Where-Object { $_.target -eq "/data" } |
    Select-Object -First 1
if ($null -eq $mediaMount -or $mediaMount.type -ne "bind") {
    throw "Immich upload storage must be an explicit bind mount"
}

Write-Output "core compose tests passed"

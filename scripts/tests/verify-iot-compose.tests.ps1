$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$composePath = Join-Path $projectRoot "infra\compose\core.yml"
$envPath = Join-Path $projectRoot "infra\compose\core.example.env"
$i18Test = "iot"
$requiredServices = @("mqtt", "home-assistant")

if (-not (Test-Path -LiteralPath $composePath)) {
    throw "Core Compose file is missing"
}

if (-not (Test-Path -LiteralPath $envPath)) {
    throw "Core compose example env is missing"
}

$mqttConfigPath = Join-Path $projectRoot "infra\compose\mosquitto\mosquitto.conf"
if (-not (Test-Path -LiteralPath $mqttConfigPath)) {
    throw "MQTT config fixture is missing"
}
$mqttConfig = Get-Content -LiteralPath $mqttConfigPath -Raw
if ($mqttConfig -notmatch '(?m)^allow_anonymous false\r?$') {
    throw "MQTT must reject anonymous clients"
}
if ($mqttConfig -notmatch '(?m)^password_file /mosquitto/config/password_file\r?$') {
    throw "MQTT must use the runtime password file"
}

$defaultConfigOutput = docker compose --env-file $envPath -f $composePath config --format json
$defaultExitCode = $LASTEXITCODE
if ($defaultExitCode -ne 0) {
    throw "docker compose config without profile failed: $($defaultConfigOutput | Out-String)"
}
$defaultConfig = ($defaultConfigOutput | Out-String) | ConvertFrom-Json

foreach ($serviceName in $requiredServices) {
    if ($defaultConfig.services.PSObject.Properties.Name -contains $serviceName) {
        throw "Service $serviceName must only appear when profile '$i18Test' is selected"
    }
}

$iotConfigOutput = docker compose --env-file $envPath -f $composePath --profile $i18Test config --format json 2>&1
$iotExitCode = $LASTEXITCODE
if ($iotExitCode -ne 0) {
    throw "docker compose config with '$i18Test' failed: $($iotConfigOutput | Out-String)"
}

$iotConfig = ($iotConfigOutput | Out-String) | ConvertFrom-Json

foreach ($serviceName in $requiredServices) {
    $service = $iotConfig.services.$serviceName
    if ($null -eq $service) {
        throw "Missing required service: $serviceName"
    }

    if ([string]::IsNullOrWhiteSpace($service.image)) {
        throw "$serviceName must use a published image"
    }

    if ($service.image -match ":latest$") {
        throw "$serviceName must not use latest"
    }

    if ($service.image -notmatch '@sha256:[a-f0-9]{64}$') {
        throw "$serviceName image must be pinned by digest"
    }

    if ($service.restart -ne "unless-stopped") {
        throw "$serviceName must use restart=unless-stopped"
    }

    if ($service.privileged) {
        throw "$serviceName must not be privileged"
    }

    if (@($service.profiles) -notcontains $i18Test) {
        throw "$serviceName must declare profile '$i18Test'"
    }

    if ($null -eq $service.healthcheck) {
        throw "$serviceName must define a healthcheck"
    }

    foreach ($port in @($service.ports | Where-Object { $null -ne $_ })) {
        if ($port.host_ip -ne "127.0.0.1") {
            throw "$serviceName exposes a port beyond localhost"
        }
    }

    foreach ($mount in @($service.volumes)) {
        if ($mount.type -eq "bind") {
            $normalizedSource = ([System.IO.Path]::GetFullPath($mount.source)).TrimEnd('\')
            $normalizedRoot = ([System.IO.Path]::GetFullPath($projectRoot)).TrimEnd('\') + '\'
            if (-not $normalizedSource.StartsWith($normalizedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
                throw "$serviceName bind mounts a host path outside project root: $($mount.source)"
            }
        }
    }
}

Write-Output "iot compose tests passed"

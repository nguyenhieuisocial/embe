$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$scriptPath = Join-Path $projectRoot 'scripts\iot\provision-mqtt.ps1'
$temporaryRoot = Join-Path $env:TEMP ("embe-iot-test-" + [guid]::NewGuid().ToString('N'))
$runtimeDirectory = Join-Path $temporaryRoot 'runtime'
$credentialPath = Join-Path $runtimeDirectory 'mqtt.credential.clixml'

try {
    if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
        throw 'MQTT provisioner is missing'
    }

    $source = Get-Content -LiteralPath $scriptPath -Raw
    if ($source -match 'mosquitto_passwd\s+-b') { throw 'Password must not be passed on the command line' }
    if ($source -match 'Write-(Host|Output).*\$plain') { throw 'Plaintext password must never be printed' }
    if ($source -notmatch '--profile\s+iot\s+restart\s+mqtt') {
        throw 'MQTT must restart after credential rotation'
    }

    $docker = Get-Command docker -ErrorAction SilentlyContinue
    $dockerOs = if ($null -ne $docker) { docker info --format '{{.OSType}}' 2>$null } else { '' }
    if ($null -eq $docker -or $LASTEXITCODE -ne 0 -or ([string]$dockerOs).Trim() -ne 'linux') {
        Write-Output 'PASS: MQTT security contract verified; integration requires a running Linux Docker engine'
        exit 0
    }

    & pwsh -NoProfile -File $scriptPath `
        -ProjectRoot $projectRoot `
        -RuntimeDirectory $runtimeDirectory `
        -CredentialPath $credentialPath `
        -SkipComposeStart | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'MQTT provisioner failed' }

    & pwsh -NoProfile -File $scriptPath `
        -ProjectRoot $projectRoot `
        -RuntimeDirectory $runtimeDirectory `
        -CredentialPath $credentialPath `
        -SkipComposeStart | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'MQTT provisioner must rotate an existing credential safely' }

    $passwordFile = Join-Path $runtimeDirectory 'mosquitto-passwordfile'
    if (-not (Test-Path -LiteralPath $credentialPath -PathType Leaf)) { throw 'DPAPI credential was not created' }
    if (-not (Test-Path -LiteralPath $passwordFile -PathType Leaf)) { throw 'Mosquitto password file was not created' }

    $credential = Import-Clixml -LiteralPath $credentialPath
    if ($credential.UserName -ne 'homeassistant') { throw 'Unexpected MQTT username' }
    $password = $credential.GetNetworkCredential().Password
    $passwordFileText = Get-Content -LiteralPath $passwordFile -Raw
    if ($passwordFileText.Contains($password)) { throw 'Plaintext password leaked into the password file' }

    $dockerPath = $runtimeDirectory.Replace('\', '/')
    $metadata = docker run --rm -v "${dockerPath}:/check:ro" `
        eclipse-mosquitto:2.1.2-alpine@sha256:6f8d8a947c506f8a2290ec65cd4bd2bc7cb4d43fb5f6271f861cb013e2ef9797 `
        sh -lc 'stat -c "%a %u %g" /check/mosquitto-passwordfile'
    if ($LASTEXITCODE -ne 0 -or $metadata.Trim() -ne '600 1883 1883') {
        throw "Mosquitto password file ownership is unsafe: $metadata"
    }

} finally {
    if (Test-Path -LiteralPath $temporaryRoot) {
        Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
    }
}

Write-Output 'PASS: MQTT provisioner creates a Docker-readable secret without exposing plaintext'

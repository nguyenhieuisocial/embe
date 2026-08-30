[CmdletBinding()]
param(
    [string]$ProjectRoot = 'C:\EmBe',
    [string]$RuntimeDirectory = '',
    [string]$CredentialPath = '',
    [switch]$SkipComposeStart
)

$ErrorActionPreference = 'Stop'
$image = 'eclipse-mosquitto:2.1.2-alpine@sha256:6f8d8a947c506f8a2290ec65cd4bd2bc7cb4d43fb5f6271f861cb013e2ef9797'

if (-not $RuntimeDirectory) { $RuntimeDirectory = Join-Path $ProjectRoot 'secrets\runtime' }
if (-not $CredentialPath) { $CredentialPath = Join-Path $RuntimeDirectory 'mqtt.credential.clixml' }
New-Item -ItemType Directory -Path $RuntimeDirectory -Force | Out-Null

$alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
$randomBytes = New-Object byte[] 48
[Security.Cryptography.RandomNumberGenerator]::Fill($randomBytes)
$plain = -join ($randomBytes | ForEach-Object { $alphabet[$_ % $alphabet.Length] })
$secure = ConvertTo-SecureString $plain -AsPlainText -Force
$credential = [PSCredential]::new('homeassistant', $secure)
$credential | Export-Clixml -LiteralPath $CredentialPath

$passwordFile = Join-Path $RuntimeDirectory 'mosquitto-passwordfile'
$stagedPasswordFile = "$passwordFile.new"
Remove-Item -LiteralPath $stagedPasswordFile -Force -ErrorAction SilentlyContinue

$dockerRuntime = $RuntimeDirectory.Replace('\', '/')
$processInfo = [Diagnostics.ProcessStartInfo]::new()
$processInfo.FileName = 'docker'
foreach ($argument in @(
    'run', '--rm', '-i', '-v', "${dockerRuntime}:/mosquitto/config", $image,
    'mosquitto_passwd', '-c', '/mosquitto/config/mosquitto-passwordfile.new', 'homeassistant'
)) { $null = $processInfo.ArgumentList.Add($argument) }
$processInfo.UseShellExecute = $false
$processInfo.RedirectStandardInput = $true
$processInfo.RedirectStandardOutput = $true
$processInfo.RedirectStandardError = $true
$processInfo.CreateNoWindow = $true
$process = [Diagnostics.Process]::new()
$process.StartInfo = $processInfo
$null = $process.Start()
$process.StandardInput.WriteLine($plain)
$process.StandardInput.WriteLine($plain)
$process.StandardInput.Close()
$null = $process.StandardOutput.ReadToEnd()
$null = $process.StandardError.ReadToEnd()
$process.WaitForExit()
$plain = $null
$secure.Dispose()
if ($process.ExitCode -ne 0) { throw 'Unable to create the Mosquitto password file' }

$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
foreach ($path in @($CredentialPath, $stagedPasswordFile)) {
    & icacls.exe $path /inheritance:r /grant:r "${currentUser}:(R,W)" 'SYSTEM:(F)' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Unable to restrict the MQTT credential file' }
}

& docker run --rm -v "${dockerRuntime}:/check" $image `
    sh -lc 'chown 1883:1883 /check/mosquitto-passwordfile.new && chmod 600 /check/mosquitto-passwordfile.new && mv -f /check/mosquitto-passwordfile.new /check/mosquitto-passwordfile'
if ($LASTEXITCODE -ne 0) { throw 'Unable to assign the MQTT password file to the Mosquitto service account' }
& icacls.exe $passwordFile /inheritance:r /grant:r "${currentUser}:(R,W)" 'SYSTEM:(F)' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Unable to restrict the MQTT password file' }
& docker run --rm -v "${dockerRuntime}:/check" $image `
    sh -lc 'chown 1883:1883 /check/mosquitto-passwordfile && chmod 600 /check/mosquitto-passwordfile'
if ($LASTEXITCODE -ne 0) { throw 'Unable to preserve MQTT password file ownership' }

if (-not $SkipComposeStart) {
    $composeRoot = Join-Path $ProjectRoot 'infra\compose'
    & docker compose `
        --env-file (Join-Path $composeRoot 'core.example.env') `
        -f (Join-Path $composeRoot 'core.yml') `
        --profile iot up -d mqtt home-assistant | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Unable to start the IoT services' }
    & docker compose `
        --env-file (Join-Path $composeRoot 'core.example.env') `
        -f (Join-Path $composeRoot 'core.yml') `
        --profile iot restart mqtt | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Unable to reload the MQTT credential' }

    $deadline = (Get-Date).AddMinutes(3)
    do {
        $mqttHealth = docker inspect embe-mqtt-1 --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>$null
        $homeAssistantHealth = docker inspect embe-home-assistant-1 --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>$null
        if ($mqttHealth -eq 'healthy' -and $homeAssistantHealth -eq 'healthy') { break }
        Start-Sleep -Seconds 3
    } while ((Get-Date) -lt $deadline)
    if ($mqttHealth -ne 'healthy' -or $homeAssistantHealth -ne 'healthy') {
        throw 'IoT services did not become healthy'
    }
}

[ordered]@{
    status = 'ready'
    mqtt_password_file = Test-Path -LiteralPath $passwordFile
    credential_protected = Test-Path -LiteralPath $CredentialPath
    services_started = -not [bool]$SkipComposeStart
} | ConvertTo-Json -Compress

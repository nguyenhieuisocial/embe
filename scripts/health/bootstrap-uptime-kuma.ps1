[CmdletBinding()]
param(
    [string]$ProjectRoot = "C:\EmBe",
    [string]$CredentialPath = "",
    [switch]$AllowInitialSetup
)

$ErrorActionPreference = "Stop"
if ($CredentialPath) {
    $credential = Import-Clixml -LiteralPath $CredentialPath
} else {
    $credential = Get-Credential -Message "Tạo tài khoản quản trị riêng cho Uptime Kuma"
}
if (-not $credential) { throw "Credential is required" }

$script = Join-Path $ProjectRoot "scripts\health\uptime-kuma-socket.js"
$containerScript = "/app/embe-uptime-kuma-socket.js"
$statusPath = Join-Path $ProjectRoot "data\status\uptime-kuma-bootstrap.json"
try {
    docker cp $script "embe-uptime-kuma-1:$containerScript" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Unable to stage the Uptime Kuma adapter" }
    $payload = @{
        username = $credential.UserName
        password = $credential.GetNetworkCredential().Password
        allowInitialSetup = [bool]$AllowInitialSetup
    } | ConvertTo-Json -Compress
    $processInfo = [Diagnostics.ProcessStartInfo]::new()
    $processInfo.FileName = "docker"
    $processInfo.Arguments = "exec -i embe-uptime-kuma-1 node $containerScript"
    $processInfo.UseShellExecute = $false
    $processInfo.RedirectStandardInput = $true
    $processInfo.RedirectStandardOutput = $true
    $processInfo.RedirectStandardError = $true
    $processInfo.CreateNoWindow = $true
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $processInfo
    $null = $process.Start()
    $encodedPayload = [Convert]::ToBase64String([Text.UTF8Encoding]::new($false).GetBytes($payload))
    $payloadBytes = [Text.Encoding]::ASCII.GetBytes($encodedPayload)
    $process.StandardInput.BaseStream.Write($payloadBytes, 0, $payloadBytes.Length)
    $process.StandardInput.BaseStream.Close()
    $json = $process.StandardOutput.ReadToEnd()
    $adapterError = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) {
        $safeCode = "unknown"
        if ($adapterError -match '"code":"([A-Z0-9_ -]+)"') { $safeCode = $Matches[1] }
        if ($safeCode -eq "unknown") {
            $safeDiagnostic = $adapterError.Replace($credential.UserName, "[redacted]").Replace($credential.GetNetworkCredential().Password, "[redacted]")
            $safeDiagnostic = (($safeDiagnostic -split "`r?`n") | Where-Object { $_ } | Select-Object -First 1)
            throw "Uptime Kuma bootstrap failed ($safeDiagnostic)"
        }
        throw "Uptime Kuma bootstrap failed ($safeCode)"
    }
    $result = $json | ConvertFrom-Json
    $status = [ordered]@{
        schema_version = 1
        status = [string]$result.status
        created_count = [int]$result.createdCount
        existing_count = [int]$result.existingCount
        monitor_count = [int]$result.monitorCount
        configured_at_utc = (Get-Date).ToUniversalTime().ToString("o")
        privacy = "No credential, response body, or family content is stored."
    }
    New-Item -ItemType Directory -Path (Split-Path -Parent $statusPath) -Force | Out-Null
    [IO.File]::WriteAllText("$statusPath.tmp", ($status | ConvertTo-Json -Depth 3), [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath "$statusPath.tmp" -Destination $statusPath -Force
    $status | ConvertTo-Json -Compress
} finally {
    $payload = $null
    docker exec embe-uptime-kuma-1 rm -f $containerScript 2>$null | Out-Null
}

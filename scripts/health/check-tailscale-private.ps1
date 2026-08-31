[CmdletBinding()]
param(
    [string]$ProjectRoot = "C:\EmBe",
    [string]$OutputPath = "",
    [string]$FixturePath = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
if (-not $OutputPath) { $OutputPath = Join-Path $ProjectRoot "data\health\tailscale-private.json" }

function Test-PrivateEndpoint([string]$Uri) {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -TimeoutSec 8 -MaximumRedirection 5
        return [int]$response.StatusCode
    } catch {
        return 0
    }
}

$codes = [ordered]@{ immich = 0; memos = 0; babybuddy = 0 }
if ($FixturePath) {
    $fixture = Get-Content -LiteralPath $FixturePath -Raw | ConvertFrom-Json
    $codes.immich = [int]$fixture.immich_status_code
    $codes.memos = [int]$fixture.memos_status_code
    $codes.babybuddy = [int]$fixture.babybuddy_status_code
} else {
    $tailscalePath = "C:\Program Files\Tailscale\tailscale.exe"
    if (Test-Path -LiteralPath $tailscalePath -PathType Leaf) {
        try {
            $tailscaleStatus = (& $tailscalePath status --json 2>$null) | ConvertFrom-Json
            $dnsName = ([string]$tailscaleStatus.Self.DNSName).TrimEnd('.')
            if ([string]$tailscaleStatus.BackendState -eq "Running" -and $dnsName) {
                $codes.immich = Test-PrivateEndpoint "https://$dnsName/"
                $codes.memos = Test-PrivateEndpoint "https://${dnsName}:8443/"
                $codes.babybuddy = Test-PrivateEndpoint "https://${dnsName}:10000/"
            }
        } catch {
            # The persisted report below contains only status codes, never private routing details.
        }
    }
}

$passed = $codes.immich -eq 200 -and $codes.memos -eq 200 -and $codes.babybuddy -eq 200
$report = [ordered]@{
    schema_version = 1
    generated_at = [DateTimeOffset]::UtcNow.ToString("o")
    status = $(if ($passed) { "pass" } else { "critical" })
    immich_status_code = $codes.immich
    memos_status_code = $codes.memos
    babybuddy_status_code = $codes.babybuddy
    privacy = "No private URL, device name, token, response body, or family content is included."
}

[IO.Directory]::CreateDirectory((Split-Path $OutputPath -Parent)) | Out-Null
$temporary = "$OutputPath.tmp"
[IO.File]::WriteAllText($temporary, ($report | ConvertTo-Json -Depth 3), [Text.UTF8Encoding]::new($false))
Move-Item -LiteralPath $temporary -Destination $OutputPath -Force
$report | ConvertTo-Json -Compress
if (-not $passed) { exit 2 }
exit 0

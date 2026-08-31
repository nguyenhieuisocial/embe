[CmdletBinding()]
param([string]$ProjectRoot = "C:\EmBe")

$ErrorActionPreference = "Stop"
$credentialPath = Join-Path $ProjectRoot "secrets\immich-family.credential.xml"
$portalEnvPath = Join-Path $ProjectRoot "secrets\runtime\portal-sync.env"
$publisherEnvPath = Join-Path $ProjectRoot "secrets\runtime\media-publisher.env"
$workerEnvPath = Join-Path $ProjectRoot "secrets\runtime\photo-inbox-worker.env"

foreach ($path in @($credentialPath, $portalEnvPath, $publisherEnvPath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required private configuration is missing" }
}

function Read-Env([string]$Path) {
    $values = @{}
    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($line -match '^\s*([^#=]+)=(.*)$') { $values[$matches[1].Trim()] = $matches[2].Trim() }
    }
    return $values
}

$portal = Read-Env $portalEnvPath
$publisher = Read-Env $publisherEnvPath
$credential = Import-Clixml -LiteralPath $credentialPath
$password = $credential.GetNetworkCredential().Password
$baseUrl = $publisher.IMMICH_BASE_URL.TrimEnd('/')
$loginBody = @{ email = $credential.UserName; password = $password } | ConvertTo-Json -Compress
$login = Invoke-RestMethod -Method Post -Uri "$baseUrl/api/auth/login" -ContentType "application/json" -Body $loginBody
if (-not $login.accessToken) { throw "Immich authentication failed" }

$headers = @{ Authorization = "Bearer $($login.accessToken)"; Accept = "application/json" }
$keyBody = @{
    name = "EmBe photo inbox worker"
    permissions = @("asset.upload", "asset.update", "albumAsset.create")
} | ConvertTo-Json -Compress
$created = Invoke-RestMethod -Method Post -Uri "$baseUrl/api/api-keys" -Headers $headers -ContentType "application/json" -Body $keyBody
if (-not $created.secret) { throw "Immich did not create the restricted upload credential" }

$required = @("SUPABASE_URL", "SUPABASE_SECRET_KEY")
foreach ($key in $required) { if (-not $portal[$key]) { throw "Portal storage configuration is incomplete" } }
if (-not $publisher.IMMICH_ALBUM_IDS) { throw "The curated Immich album is missing" }
$albumId = ($publisher.IMMICH_ALBUM_IDS -split ',')[0].Trim()

$lines = @(
    "SUPABASE_URL=$($portal.SUPABASE_URL)",
    "SUPABASE_SECRET_KEY=$($portal.SUPABASE_SECRET_KEY)",
    "IMMICH_BASE_URL=$baseUrl",
    "IMMICH_UPLOAD_API_KEY=$($created.secret)",
    "IMMICH_ALBUM_ID=$albumId"
)
$directory = Split-Path -Parent $workerEnvPath
New-Item -ItemType Directory -Path $directory -Force | Out-Null
$temporary = "$workerEnvPath.tmp"
[IO.File]::WriteAllLines($temporary, $lines, [Text.UTF8Encoding]::new($false))
Move-Item -LiteralPath $temporary -Destination $workerEnvPath -Force
& icacls.exe $workerEnvPath /inheritance:r /grant:r "${env:USERNAME}:(R)" "SYSTEM:(F)" "BUILTIN\Administrators:(F)" | Out-Null

$logoutBody = @{ } | ConvertTo-Json -Compress
try { Invoke-RestMethod -Method Post -Uri "$baseUrl/api/auth/logout" -Headers $headers -ContentType "application/json" -Body $logoutBody | Out-Null } catch { }
Write-Output "Photo inbox worker credential provisioned."


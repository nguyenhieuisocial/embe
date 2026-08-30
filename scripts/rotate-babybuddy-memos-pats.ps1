[CmdletBinding()]
param(
    [string]$ProjectRoot = "C:\EmBe",
    [switch]$Force
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$adminSecret = Join-Path $ProjectRoot "secrets\admin\portal-data.env"
$bridgeSecret = Join-Path $ProjectRoot "secrets\runtime\babybuddy-memos-sync\sync.env"
$portalSecret = Join-Path $ProjectRoot "secrets\runtime\portal-sync.env"
foreach ($path in @($adminSecret, $bridgeSecret, $portalSecret)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Credential rotation dependency is unavailable" }
}

function Read-Env([string]$Path) {
    $values = @{}
    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($line -match '^([^#=]+)=(.*)$') { $values[$matches[1]] = $matches[2] }
    }
    return $values
}

function Save-Env([hashtable]$Values, [string[]]$Keys, [string]$Path) {
    $lines = foreach ($key in $Keys) {
        if (-not $Values.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($Values[$key])) {
            throw "Credential rotation output is incomplete"
        }
        "$key=$($Values[$key])"
    }
    $temporary = "$Path.tmp"
    try {
        [IO.File]::Create($temporary).Dispose()
        Set-Acl -LiteralPath $temporary -AclObject (Get-Acl -LiteralPath $Path)
        [IO.File]::WriteAllLines($temporary, $lines, [Text.UTF8Encoding]::new($false))
        Move-Item -LiteralPath $temporary -Destination $Path -Force
    } finally {
        if (Test-Path -LiteralPath $temporary -PathType Leaf) { Remove-Item -LiteralPath $temporary -Force }
    }
}

$admin = Read-Env $adminSecret
$bridge = Read-Env $bridgeSecret
$portal = Read-Env $portalSecret
if (-not $Force -and $bridge.MEMOS_PAT_ROTATION_DUE_AT) {
    $due = [DateTimeOffset]::Parse($bridge.MEMOS_PAT_ROTATION_DUE_AT)
    if ($due -gt (Get-Date).ToUniversalTime().AddDays(14)) {
        [ordered]@{ status = "ready"; rotated = $false; reason = "not_due" } | ConvertTo-Json -Compress
        exit 0
    }
}

$baseUrl = $admin.MEMOS_BASE_URL.TrimEnd('/')
$serviceUser = "embe-babybuddy"
$adminHeaders = @{ Authorization = "Bearer $($admin.MEMOS_SYNC_PAT)" }
$passwordBytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($passwordBytes)
$temporaryPassword = [Convert]::ToBase64String($passwordBytes)
$serviceUserBody = [ordered]@{
    name = "users/$serviceUser"
    role = "USER"
    username = $serviceUser
    displayName = "EmBe BabyBuddy Bridge"
    password = $temporaryPassword
    state = "NORMAL"
} | ConvertTo-Json
Invoke-RestMethod -Uri "$baseUrl/api/v1/users/$serviceUser`?updateMask=password" -Headers $adminHeaders -Method Patch -ContentType "application/json" -Body $serviceUserBody | Out-Null
$signIn = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/signin" -Method Post -ContentType "application/json" -Body (@{
    passwordCredentials = @{ username = $serviceUser; password = $temporaryPassword }
} | ConvertTo-Json -Depth 3)
$sessionHeaders = @{ Authorization = "Bearer $($signIn.accessToken)" }
$oldTokens = @((Invoke-RestMethod -Uri "$baseUrl/api/v1/users/$serviceUser/personalAccessTokens?pageSize=1000" -Headers $sessionHeaders).personalAccessTokens)

function New-Pat([string]$Description) {
    $created = Invoke-RestMethod -Uri "$baseUrl/api/v1/users/$serviceUser/personalAccessTokens" -Headers $sessionHeaders -Method Post -ContentType "application/json" -Body (@{
        description = $Description
        expiresInDays = 90
    } | ConvertTo-Json)
    if ([string]::IsNullOrWhiteSpace($created.token)) { throw "Memos did not return a replacement credential" }
    $identity = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/me" -Headers @{ Authorization = "Bearer $($created.token)" }
    if ($identity.user.name -ne "users/$serviceUser" -or $identity.user.role -ne "USER") {
        throw "Replacement credential failed identity verification"
    }
    return $created.token
}

$bridgePat = New-Pat "BabyBuddy milestone bridge"
$portalPat = New-Pat "BabyBuddy portal read"
$dueAt = (Get-Date).ToUniversalTime().AddDays(90).ToString("o")
$bridge.MEMOS_SYNC_PAT = $bridgePat
$bridge.MEMOS_PAT_ROTATION_DUE_AT = $dueAt
$portal.MEMOS_BABYBUDDY_PORTAL_PAT = $portalPat
Save-Env $bridge @(
    "BABYBUDDY_BASE_URL", "BABYBUDDY_TOKEN", "BABYBUDDY_TOKEN_CREATED_AT",
    "BABYBUDDY_TOKEN_ROTATION_DUE_AT", "MEMOS_BASE_URL", "MEMOS_USER_NAME",
    "MEMOS_SYNC_PAT", "MEMOS_PAT_ROTATION_DUE_AT", "SYNC_LEDGER"
) $bridgeSecret
Save-Env $portal @(
    "MEMOS_BASE_URL", "MEMOS_PORTAL_PAT", "SUPABASE_URL", "SUPABASE_SECRET_KEY",
    "MEMOS_BABYBUDDY_PORTAL_PAT"
) $portalSecret

$pending = 0
foreach ($oldToken in $oldTokens) {
    try {
        Invoke-RestMethod -Uri "$baseUrl/api/v1/$($oldToken.name)" -Headers @{ Authorization = "Bearer $bridgePat" } -Method Delete | Out-Null
    } catch {
        $pending++
    }
}
[ordered]@{ status = "ready"; rotated = $true; old_credentials_pending = $pending } | ConvertTo-Json -Compress

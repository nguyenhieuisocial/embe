param(
    [string]$ProjectRoot = "C:\EmBe",
    [string]$MemosBaseUrl = "http://127.0.0.1:5230",
    [string]$SupabaseProjectRef = "tpqqzowhndbkmkckpbgv",
    [switch]$RotateOnly,
    [switch]$ForceRotate
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$secretDirectory = Join-Path $ProjectRoot "secrets"
$adminSecretDirectory = Join-Path $secretDirectory "admin"
$secretPath = Join-Path $adminSecretDirectory "portal-data.env"
$runtimeSecretDirectory = Join-Path $secretDirectory "runtime"
$syncSecretPath = Join-Path $runtimeSecretDirectory "portal-sync.env"
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$projectOwnerIdentity = (Get-Acl -LiteralPath $ProjectRoot).Owner
if ($RotateOnly) {
    foreach ($requiredPath in @($secretPath, $runtimeSecretDirectory, $syncSecretPath)) {
        if (-not (Test-Path -LiteralPath $requiredPath)) { throw "Rotation dependency is missing: $requiredPath" }
    }
} else {
    New-Item -ItemType Directory -Path $secretDirectory -Force | Out-Null
    & icacls.exe $secretDirectory /inheritance:r /grant:r "${identity}:(OI)(CI)(F)" "SYSTEM:(OI)(CI)(F)" "BUILTIN\Administrators:(OI)(CI)(F)" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Unable to restrict the integration secret directory" }
    New-Item -ItemType Directory -Path $adminSecretDirectory -Force | Out-Null
    New-Item -ItemType Directory -Path $runtimeSecretDirectory -Force | Out-Null
}

function New-RandomSecret([int]$Length = 40) {
    $alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#%+-_"
    $bytes = New-Object byte[] $Length
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
    return -join ($bytes | ForEach-Object { $alphabet[$_ % $alphabet.Length] })
}

function Read-EnvFile([string]$Path) {
    $values = @{}
    if (Test-Path -LiteralPath $Path) {
        foreach ($line in Get-Content -LiteralPath $Path) {
            if ($line -match '^([^#=]+)=(.*)$') { $values[$matches[1]] = $matches[2] }
        }
    }
    return $values
}

function Save-EnvFile([hashtable]$Values, [string]$Path) {
    $orderedKeys = @(
        "PROVISIONING_STATUS",
        "MEMOS_BASE_URL",
        "MEMOS_ADMIN_USERNAME",
        "MEMOS_ADMIN_PASSWORD",
        "MEMOS_SYNC_PAT",
        "MEMOS_PORTAL_PAT",
        "MEMOS_VAULT_EXPORT_PAT",
        "MEMOS_PAT_ROTATE_AFTER",
        "MEMOS_PAT_PENDING_REVOKE",
        "SUPABASE_PROJECT_REF",
        "SUPABASE_URL",
        "SUPABASE_SECRET_KEY"
    )
    $lines = foreach ($key in $orderedKeys) {
        if ($Values.ContainsKey($key)) { "$key=$($Values[$key])" }
    }
    $temporary = "$Path.tmp"
    try {
        [IO.File]::WriteAllLines($temporary, $lines, [Text.UTF8Encoding]::new($false))
        Move-Item -LiteralPath $temporary -Destination $Path -Force
        $grants = @("${identity}:(F)", "${projectOwnerIdentity}:(F)", "SYSTEM:(F)", "BUILTIN\Administrators:(F)") | Select-Object -Unique
        & icacls.exe $Path /inheritance:r /grant:r $grants | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Unable to restrict integration secret ACL" }
    } finally {
        if (Test-Path -LiteralPath $temporary -PathType Leaf) {
            Remove-Item -LiteralPath $temporary -Force
        }
    }
}

function Save-SyncEnvFile([hashtable]$Values, [string]$Path) {
    $lines = @(
    foreach ($key in @("MEMOS_BASE_URL", "MEMOS_PORTAL_PAT", "SUPABASE_URL", "SUPABASE_SECRET_KEY")) {
        if (-not $Values.ContainsKey($key) -or [string]::IsNullOrWhiteSpace([string]$Values[$key])) {
            throw "Sync runtime setting is missing: $key"
        }
        "$key=$($Values[$key])"
    })
    $current = Read-EnvFile $Path
    if ($current.ContainsKey("MEMOS_BABYBUDDY_PORTAL_PAT") -and -not [string]::IsNullOrWhiteSpace($current.MEMOS_BABYBUDDY_PORTAL_PAT)) {
        $lines += "MEMOS_BABYBUDDY_PORTAL_PAT=$($current.MEMOS_BABYBUDDY_PORTAL_PAT)"
    }
    $temporary = "$Path.tmp"
    try {
        [IO.File]::WriteAllLines($temporary, $lines, [Text.UTF8Encoding]::new($false))
        Move-Item -LiteralPath $temporary -Destination $Path -Force
    } finally {
        if (Test-Path -LiteralPath $temporary -PathType Leaf) {
            Remove-Item -LiteralPath $temporary -Force
        }
    }
}

function Invoke-MemosJson([string]$Method, [string]$Path, [object]$Body, [string]$Token = "") {
    $headers = @{}
    if ($Token) { $headers.Authorization = "Bearer $Token" }
    $parameters = @{
        Uri = "$MemosBaseUrl$Path"
        Method = $Method
        Headers = $headers
        ContentType = "application/json; charset=utf-8"
    }
    if ($null -ne $Body) {
        $json = $Body | ConvertTo-Json -Depth 8 -Compress
        $parameters.Body = [Text.Encoding]::UTF8.GetBytes($json)
    }
    return Invoke-RestMethod @parameters
}

$values = Read-EnvFile $secretPath
if (-not $values.ContainsKey("MEMOS_ADMIN_USERNAME")) { $values.MEMOS_ADMIN_USERNAME = "embe-admin" }
if (-not $values.ContainsKey("MEMOS_ADMIN_PASSWORD")) { $values.MEMOS_ADMIN_PASSWORD = New-RandomSecret 48 }
$values.PROVISIONING_STATUS = "pending"
$values.MEMOS_BASE_URL = $MemosBaseUrl
$values.SUPABASE_PROJECT_REF = $SupabaseProjectRef
$values.SUPABASE_URL = "https://$SupabaseProjectRef.supabase.co"
Save-EnvFile $values $secretPath

try {
    $signInBody = @{
        passwordCredentials = @{
            username = $values.MEMOS_ADMIN_USERNAME
            password = $values.MEMOS_ADMIN_PASSWORD
        }
    }
    try {
        $session = Invoke-MemosJson "POST" "/api/v1/auth/signin" $signInBody
    } catch {
        $createBody = @{
            role = "ADMIN"
            username = $values.MEMOS_ADMIN_USERNAME
            displayName = "Mẹ Ngân & Ba Hiếu"
            password = $values.MEMOS_ADMIN_PASSWORD
            state = "NORMAL"
        }
        Invoke-MemosJson "POST" "/api/v1/users?requestId=embe-first-admin" $createBody | Out-Null
        $session = Invoke-MemosJson "POST" "/api/v1/auth/signin" $signInBody
    }

    $userName = [string]$session.user.name
    $accessToken = [string]$session.accessToken
    if ([string]::IsNullOrWhiteSpace($userName) -or [string]::IsNullOrWhiteSpace($accessToken)) {
        throw "Memos sign-in did not return an authenticated user"
    }

    $tokenDefinitions = [ordered]@{
        MEMOS_SYNC_PAT = "BabyBuddy sync"
        MEMOS_PORTAL_PAT = "Portal read model"
        MEMOS_VAULT_EXPORT_PAT = "Obsidian vault export"
    }
    $rotationDateMissing = -not $values.ContainsKey("MEMOS_PAT_ROTATE_AFTER")
    $rotateTokens = [bool]$ForceRotate
    if (-not $rotationDateMissing -and -not $ForceRotate) {
        try {
            $rotateTokens = [DateTimeOffset]::Parse($values.MEMOS_PAT_ROTATE_AFTER) -le [DateTimeOffset]::UtcNow
        } catch {
            $rotateTokens = $true
        }
    }
    $pendingTokenNames = @()
    if ($values.ContainsKey("MEMOS_PAT_PENDING_REVOKE") -and -not [string]::IsNullOrWhiteSpace($values.MEMOS_PAT_PENDING_REVOKE)) {
        $pendingTokenNames = @($values.MEMOS_PAT_PENDING_REVOKE.Split(';') | Where-Object { $_ })
    }
    if ($rotateTokens -or $pendingTokenNames.Count -gt 0) {
        $listedTokens = Invoke-MemosJson "GET" "/api/v1/$userName/personalAccessTokens" $null $accessToken
        $existingTokenNames = @($listedTokens.personalAccessTokens | ForEach-Object { [string]$_.name })
        $pendingTokenNames = @($pendingTokenNames | Where-Object { $existingTokenNames -contains $_ })
    }
    if ($rotateTokens) {
        $descriptions = @($tokenDefinitions.Values)
        $oldTokenNames = @($listedTokens.personalAccessTokens | Where-Object {
            $descriptions -contains [string]$_.description
        } | ForEach-Object { [string]$_.name })
        $pendingTokenNames = @($pendingTokenNames + $oldTokenNames | Select-Object -Unique)
    }
    foreach ($entry in $tokenDefinitions.GetEnumerator()) {
        if ($rotateTokens -or -not $values.ContainsKey($entry.Key) -or [string]::IsNullOrWhiteSpace($values[$entry.Key])) {
            $response = Invoke-MemosJson "POST" "/api/v1/$userName/personalAccessTokens" @{
                parent = $userName
                description = $entry.Value
                expiresInDays = 365
            } $accessToken
            if ([string]::IsNullOrWhiteSpace([string]$response.token)) {
                throw "Memos did not return the $($entry.Key) token"
            }
            $values[$entry.Key] = [string]$response.token
        }
    }
    foreach ($entry in $tokenDefinitions.GetEnumerator()) {
        Invoke-MemosJson "GET" "/api/v1/memos?pageSize=1" $null ([string]$values[$entry.Key]) | Out-Null
    }
    if ($rotateTokens -or $rotationDateMissing) {
        $values.MEMOS_PAT_ROTATE_AFTER = [DateTimeOffset]::UtcNow.AddDays(330).ToString("o")
    }

    if (
        -not $values.ContainsKey("SUPABASE_SECRET_KEY") -or
        [string]::IsNullOrWhiteSpace($values.SUPABASE_SECRET_KEY) -or
        -not $values.SUPABASE_SECRET_KEY.StartsWith("sb_secret_")
    ) {
        $keyJson = npx -y supabase projects api-keys --project-ref $SupabaseProjectRef --reveal --output json
        if ($LASTEXITCODE -ne 0) { throw "Unable to retrieve the scoped Supabase server key" }
        $parsedKeys = $keyJson | ConvertFrom-Json
        $secretKey = $parsedKeys | Where-Object {
            $_.type -eq "secret" -and ($_.PSObject.Properties.Name -notcontains "disabled" -or -not $_.disabled)
        } | Select-Object -First 1
        if ($null -eq $secretKey -or [string]::IsNullOrWhiteSpace([string]$secretKey.api_key)) {
            throw "Supabase project does not have an active secret key"
        }
        $values.SUPABASE_SECRET_KEY = [string]$secretKey.api_key
    }

    $values.PROVISIONING_STATUS = "ready"
    $values.MEMOS_PAT_PENDING_REVOKE = $pendingTokenNames -join ';'
    Save-EnvFile $values $secretPath
    Save-SyncEnvFile $values $syncSecretPath
    foreach ($tokenName in @($pendingTokenNames)) {
        Invoke-MemosJson "DELETE" "/api/v1/$tokenName" $null $accessToken | Out-Null
        $pendingTokenNames = @($pendingTokenNames | Where-Object { $_ -ne $tokenName })
        $values.MEMOS_PAT_PENDING_REVOKE = $pendingTokenNames -join ';'
        Save-EnvFile $values $secretPath
    }
    [ordered]@{
        status = "ready"
        memos_user = $userName
        tokens = $tokenDefinitions.Keys.Count
        supabase_project = $SupabaseProjectRef
        secret_file_acl_restricted = $true
        pat_rotation_due = $values.MEMOS_PAT_ROTATE_AFTER
    } | ConvertTo-Json -Compress
} catch {
    Save-EnvFile $values $secretPath
    throw
}

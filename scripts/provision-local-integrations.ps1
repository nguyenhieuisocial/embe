param(
    [string]$ProjectRoot = "C:\EmBe",
    [string]$MemosBaseUrl = "http://127.0.0.1:5230",
    [string]$SupabaseProjectRef = "tpqqzowhndbkmkckpbgv"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$secretPath = Join-Path $ProjectRoot "secrets\portal-data.env"
$secretDirectory = Split-Path -Parent $secretPath
New-Item -ItemType Directory -Path $secretDirectory -Force | Out-Null
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $secretDirectory /inheritance:r /grant:r "${identity}:(OI)(CI)(F)" "SYSTEM:(OI)(CI)(F)" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Unable to restrict the integration secret directory" }

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
        & icacls.exe $Path /inheritance:r /grant:r "${identity}:(F)" "SYSTEM:(F)" | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Unable to restrict integration secret ACL" }
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
    $rotateTokens = $false
    if (-not $rotationDateMissing) {
        try {
            $rotateTokens = [DateTimeOffset]::Parse($values.MEMOS_PAT_ROTATE_AFTER) -le [DateTimeOffset]::UtcNow
        } catch {
            $rotateTokens = $true
        }
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
    Save-EnvFile $values $secretPath
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

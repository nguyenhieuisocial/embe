[CmdletBinding()]
param(
    [string]$ProjectRoot = "C:\EmBe",
    [string]$BaseUrl = "http://127.0.0.1:2283",
    [string]$DatabaseContainerName = "embe-immich-postgres-1",
    [string]$KeyName = "EmBe Portal Publisher",
    [string]$FamilyEmail = "family@hieu.asia",
    [string]$FamilyName = "Gia đình Ngân & Hiếu"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function New-StrongPassword {
    $bytes = [Security.Cryptography.RandomNumberGenerator]::GetBytes(18)
    return ([Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "A").Replace("/", "B") + "!8a")
}

function Save-Credential([string]$Path, [string]$UserName, [string]$Password) {
    $secure = ConvertTo-SecureString $Password -AsPlainText -Force
    $credential = [Management.Automation.PSCredential]::new($UserName, $secure)
    [IO.Directory]::CreateDirectory((Split-Path $Path -Parent)) | Out-Null
    $credential | Export-Clixml -LiteralPath $Path -Force
}

function Invoke-ImmichSql([string]$Sql) {
    $null = & docker exec $DatabaseContainerName sh -lc `
        'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "$1"' sh $Sql
    if ($LASTEXITCODE -ne 0) { throw "Immich permission transaction failed" }
}

$publisherEnvPath = Join-Path $ProjectRoot "secrets\runtime\media-publisher.env"
$apiKey = $null
foreach ($line in Get-Content -LiteralPath $publisherEnvPath) {
    if ($line -match '^IMMICH_API_KEY=(.+)$') { $apiKey = $matches[1] }
}
if (-not $apiKey) { throw "Immich publisher API key is missing" }
$adminHeaders = @{ "x-api-key" = $apiKey }

$familyCredentialPath = Join-Path $ProjectRoot "secrets\immich-family.credential.xml"
if (Test-Path -LiteralPath $familyCredentialPath -PathType Leaf) {
    $familyCredential = Import-Clixml -LiteralPath $familyCredentialPath
    $familyPassword = $familyCredential.GetNetworkCredential().Password
} else {
    $familyPassword = New-StrongPassword
    Save-Credential $familyCredentialPath $FamilyEmail $familyPassword
    $familyCredential = Import-Clixml -LiteralPath $familyCredentialPath
}

$minimumPermissions = @("asset.download", "asset.read", "asset.view")
$grantSql = "UPDATE api_key SET permissions=ARRAY['asset.download','asset.read','asset.view','adminUser.create','adminUser.read','adminUser.update'] WHERE name='$KeyName';"
$revokeSql = "UPDATE api_key SET permissions=ARRAY['asset.download','asset.read','asset.view'] WHERE name='$KeyName';"
$createdNow = $false
try {
    Invoke-ImmichSql $grantSql
    $users = @(Invoke-RestMethod -Uri "$BaseUrl/api/admin/users" -Headers $adminHeaders -Method Get)
    $familyUser = @($users | Where-Object { [string]$_.email -ieq $FamilyEmail } | Select-Object -First 1)
    $body = @{
        email = $FamilyEmail
        password = $familyPassword
        name = $FamilyName
        isAdmin = $false
        shouldChangePassword = $false
    }
    if ($familyUser.Count -eq 0) {
        $null = Invoke-RestMethod -Uri "$BaseUrl/api/admin/users" -Headers $adminHeaders -Method Post -ContentType "application/json" -Body ($body | ConvertTo-Json)
        $createdNow = $true
    } else {
        $familyUserId = [string]$familyUser[0].id
        $null = Invoke-RestMethod -Uri "$BaseUrl/api/admin/users/$familyUserId" -Headers $adminHeaders -Method Put -ContentType "application/json" -Body ($body | ConvertTo-Json)
    }
} finally {
    Invoke-ImmichSql $revokeSql
}

$keyInfo = Invoke-RestMethod -Uri "$BaseUrl/api/api-keys/me" -Headers $adminHeaders -Method Get
$remainingPermissions = @($keyInfo.permissions | Sort-Object)
if (Compare-Object $minimumPermissions $remainingPermissions) {
    throw "Immich publisher key did not return to least privilege"
}

$familyLogin = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method Post -ContentType "application/json" -Body (@{
    email = $familyCredential.UserName
    password = $familyCredential.GetNetworkCredential().Password
} | ConvertTo-Json)
if (-not $familyLogin.accessToken -or [bool]$familyLogin.isAdmin -or [bool]$familyLogin.shouldChangePassword) {
    throw "Immich family login verification failed"
}
try { Invoke-RestMethod -Uri "$BaseUrl/api/auth/logout" -Headers @{ Authorization = "Bearer $($familyLogin.accessToken)" } -Method Post | Out-Null } catch { }

[ordered]@{
    schema_version = 1
    generated_at = [DateTimeOffset]::UtcNow.ToString("o")
    status = "ready"
    created_now = $createdNow
    login_verified = $true
    admin = $false
    credential_protected = $true
    publisher_least_privilege = $true
    privacy = "No email, password, token, user ID, or family content is included."
} | ConvertTo-Json -Compress

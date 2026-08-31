param(
    [string]$ProjectRoot = "C:\EmBe",
    [string]$BaseUrl = "http://127.0.0.1:2283",
    [string]$AlbumName = "Em Bé",
    [string]$KeyName = "EmBe Portal Publisher",
    [PSCredential]$AdminCredential
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$uri = [Uri]$BaseUrl
if ($uri.Scheme -notin @("http", "https") -or $uri.Host -notin @("127.0.0.1", "localhost") -or -not [string]::IsNullOrEmpty($uri.UserInfo)) {
    throw "Immich provisioning is restricted to the local server"
}
$BaseUrl = $BaseUrl.TrimEnd('/')
$runtimeDirectory = Join-Path $ProjectRoot "secrets\runtime"
$runtimeSecret = Join-Path $runtimeDirectory "media-publisher.env"
$requiredPermissions = @("asset.read", "asset.view")

function Read-EnvFile([string]$Path) {
    $values = @{}
    if (Test-Path -LiteralPath $Path -PathType Leaf) {
        foreach ($line in Get-Content -LiteralPath $Path) {
            if ($line -match '^([^#=]+)=(.*)$') { $values[$matches[1]] = $matches[2] }
        }
    }
    return $values
}

function Test-PublisherCredential([hashtable]$Values) {
    foreach ($key in @("IMMICH_API_KEY", "IMMICH_ALBUM_IDS")) {
        if (-not $Values.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($Values[$key])) { return $false }
    }
    try {
        $keyHeaders = @{ "x-api-key" = $Values.IMMICH_API_KEY }
        $keyInfo = Invoke-RestMethod -Uri "$BaseUrl/api/api-keys/me" -Headers $keyHeaders -Method Get
        $actual = @($keyInfo.permissions | Sort-Object)
        $expected = @($requiredPermissions | Sort-Object)
        if (@(Compare-Object $actual $expected).Count -ne 0) { return $false }
        $albumIds = @($Values.IMMICH_ALBUM_IDS.Split(',') | Where-Object { $_ })
        $parsedAlbumId = [Guid]::Empty
        if ($albumIds.Count -ne 1 -or -not [Guid]::TryParse($albumIds[0], [ref]$parsedAlbumId)) { return $false }
        $searchBody = @{
            albumIds = $albumIds
            type = "IMAGE"
            size = 1
            page = 1
            withExif = $false
            withPeople = $false
            withStacked = $false
        } | ConvertTo-Json
        Invoke-RestMethod -Uri "$BaseUrl/api/search/metadata" -Headers $keyHeaders -Method Post -ContentType "application/json" -Body $searchBody | Out-Null
        return $true
    } catch {
        return $false
    }
}

$existingValues = Read-EnvFile $runtimeSecret
if (Test-PublisherCredential $existingValues) {
    [ordered]@{
        status = "ready"
        album = "configured"
        credential = "verified"
        permissions = $requiredPermissions
    } | ConvertTo-Json -Compress
    exit 0
}

if ($null -eq $AdminCredential) { throw "Immich administrator credential is required for first-time provisioning" }

$loginBody = @{
    email = $AdminCredential.UserName
    password = $AdminCredential.GetNetworkCredential().Password
} | ConvertTo-Json
$login = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method Post -ContentType "application/json" -Body $loginBody
if (-not $login.isAdmin -or [string]::IsNullOrWhiteSpace($login.accessToken)) { throw "Immich administrator login failed" }
$adminHeaders = @{ Authorization = "Bearer $($login.accessToken)" }

try {
    $onboarding = Invoke-RestMethod -Uri "$BaseUrl/api/system-metadata/admin-onboarding" -Headers $adminHeaders -Method Get
    if (-not $onboarding.isOnboarded) {
        Invoke-RestMethod -Uri "$BaseUrl/api/system-metadata/admin-onboarding" -Headers $adminHeaders -Method Post -ContentType "application/json" -Body (@{ isOnboarded = $true } | ConvertTo-Json) | Out-Null
    }

    $albumPayload = Invoke-RestMethod -Uri "$BaseUrl/api/albums" -Headers $adminHeaders -Method Get
    $albums = @()
    foreach ($item in $albumPayload) { $albums += $item }
    $matchingAlbums = @($albums | Where-Object { $null -ne $_ -and $null -ne $_.PSObject.Properties['albumName'] -and $_.albumName -ceq $AlbumName })
    if ($matchingAlbums.Count -gt 1) { throw "More than one curated Immich album has the configured name" }
    if ($matchingAlbums.Count -eq 0) {
        $album = Invoke-RestMethod -Uri "$BaseUrl/api/albums" -Headers $adminHeaders -Method Post -ContentType "application/json" -Body (@{
            albumName = "Em Bé"
            description = "Album chọn lọc để hiển thị trên cổng gia đình EmBe."
        } | ConvertTo-Json)
    } else {
        $album = $matchingAlbums[0]
    }
    if ([string]::IsNullOrWhiteSpace($album.id)) { throw "Immich did not return the curated album ID" }

    $keyPayload = Invoke-RestMethod -Uri "$BaseUrl/api/api-keys" -Headers $adminHeaders -Method Get
    $keys = @()
    foreach ($item in $keyPayload) { $keys += $item }
    $oldKeys = @($keys | Where-Object { $null -ne $_ -and $null -ne $_.PSObject.Properties['name'] -and $_.name -ceq $KeyName })
    $created = Invoke-RestMethod -Uri "$BaseUrl/api/api-keys" -Headers $adminHeaders -Method Post -ContentType "application/json" -Body (@{
        name = $KeyName
        permissions = $requiredPermissions
    } | ConvertTo-Json)
    $secret = $created.secret
    if ([string]::IsNullOrWhiteSpace($secret)) { throw "Immich did not return the publisher credential" }

    $keyHeaders = @{ "x-api-key" = $secret }
    $keyInfo = Invoke-RestMethod -Uri "$BaseUrl/api/api-keys/me" -Headers $keyHeaders -Method Get
    if (@(Compare-Object @($keyInfo.permissions | Sort-Object) @($requiredPermissions | Sort-Object)).Count -ne 0) {
        throw "Immich publisher credential has unexpected permissions"
    }
    $searchBody = @{
        albumIds = @($album.id)
        type = "IMAGE"
        size = 1
        page = 1
        withExif = $false
        withPeople = $false
        withStacked = $false
    } | ConvertTo-Json
    $search = Invoke-RestMethod -Uri "$BaseUrl/api/search/metadata" -Headers $keyHeaders -Method Post -ContentType "application/json" -Body $searchBody
    $sampleAssets = @($search.assets.items)
    if ($sampleAssets.Count -gt 0) {
        Invoke-WebRequest -Uri "$BaseUrl/api/assets/$($sampleAssets[0].id)/thumbnail?size=preview" -Headers $keyHeaders -Method Get -UseBasicParsing | Out-Null
    }

    New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $temporary = "$runtimeSecret.tmp"
    $lines = @(
        "# Dedicated read-only Immich publisher credential.",
        "EMBE_MEDIA_PUBLISHER_ENABLED=true",
        "IMMICH_BASE_URL=$BaseUrl",
        "IMMICH_API_KEY=$secret",
        "IMMICH_ALBUM_IDS=$($album.id)"
    )
    try {
        [IO.File]::Create($temporary).Dispose()
        $grants = @("${identity}:(F)", "SYSTEM:(F)", "BUILTIN\Administrators:(F)")
        if (Get-LocalUser -Name "EmBePortalSyncSvc" -ErrorAction SilentlyContinue) {
            $grants += "${env:COMPUTERNAME}\EmBePortalSyncSvc:(R)"
        }
        if (Get-LocalUser -Name "EmBeCredentialSvc" -ErrorAction SilentlyContinue) {
            $grants += "${env:COMPUTERNAME}\EmBeCredentialSvc:(M)"
        }
        & icacls.exe $temporary /inheritance:r /grant:r $grants | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Unable to restrict the Immich publisher credential" }
        [IO.File]::WriteAllLines($temporary, $lines, [Text.UTF8Encoding]::new($false))
        Move-Item -LiteralPath $temporary -Destination $runtimeSecret -Force
        & icacls.exe $runtimeSecret /inheritance:r /grant:r $grants | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Unable to restrict the Immich publisher credential" }
    } finally {
        if (Test-Path -LiteralPath $temporary -PathType Leaf) { Remove-Item -LiteralPath $temporary -Force }
    }

    foreach ($oldKey in $oldKeys) {
        Invoke-RestMethod -Uri "$BaseUrl/api/api-keys/$($oldKey.id)" -Headers $adminHeaders -Method Delete | Out-Null
    }

    [ordered]@{
        status = "ready"
        album = if ($matchingAlbums.Count -eq 0) { "created" } else { "reused" }
        credential = "created"
        permissions = $requiredPermissions
        previous_credentials_revoked = $oldKeys.Count
    } | ConvertTo-Json -Compress
} finally {
    try { Invoke-RestMethod -Uri "$BaseUrl/api/auth/logout" -Headers $adminHeaders -Method Post | Out-Null } catch { }
}

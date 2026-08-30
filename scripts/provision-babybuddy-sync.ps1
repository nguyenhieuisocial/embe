param(
    [string]$ProjectRoot = "C:\EmBe",
    [string]$ContainerName = "embe-babybuddy-1",
    [switch]$ForceRotate
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$adminSecret = Join-Path $ProjectRoot "secrets\admin\portal-data.env"
$runtimeDirectory = Join-Path $ProjectRoot "secrets\runtime\babybuddy-memos-sync"
$runtimeSecret = Join-Path $runtimeDirectory "sync.env"
$ledgerDirectory = Join-Path $ProjectRoot "data\appdata\sync-daemon"
if (-not (Test-Path -LiteralPath $adminSecret -PathType Leaf)) {
    throw "Memos integration secret is unavailable"
}

$values = @{}
foreach ($line in Get-Content -LiteralPath $adminSecret) {
    if ($line -match '^([^#=]+)=(.*)$') { $values[$matches[1]] = $matches[2] }
}
if (-not $values.ContainsKey("MEMOS_SYNC_PAT") -or [string]::IsNullOrWhiteSpace($values.MEMOS_SYNC_PAT)) {
    throw "Memos sync credential is unavailable"
}

$memosBaseUrl = $values.MEMOS_BASE_URL.TrimEnd('/')
$adminHeaders = @{ Authorization = "Bearer $($values.MEMOS_SYNC_PAT)" }
$memosServiceUser = "embe-babybuddy"
$users = (Invoke-RestMethod -Uri "$memosBaseUrl/api/v1/users?pageSize=1000" -Headers $adminHeaders).users
$existingServiceUser = @($users | Where-Object { $_.username -eq $memosServiceUser })
$passwordBytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($passwordBytes)
$temporaryPassword = [Convert]::ToBase64String($passwordBytes)
$serviceUserBody = [ordered]@{
    name = "users/$memosServiceUser"
    role = "USER"
    username = $memosServiceUser
    displayName = "EmBe BabyBuddy Bridge"
    password = $temporaryPassword
    state = "NORMAL"
} | ConvertTo-Json
if ($existingServiceUser.Count -eq 0) {
    Invoke-RestMethod -Uri "$memosBaseUrl/api/v1/users?userId=$memosServiceUser&requestId=embe-babybuddy-service-v1" -Headers $adminHeaders -Method Post -ContentType "application/json" -Body $serviceUserBody | Out-Null
} elseif ($existingServiceUser.Count -eq 1 -and $existingServiceUser[0].role -eq "USER") {
    Invoke-RestMethod -Uri "$memosBaseUrl/api/v1/users/$memosServiceUser`?updateMask=password" -Headers $adminHeaders -Method Patch -ContentType "application/json" -Body $serviceUserBody | Out-Null
} else {
    throw "The dedicated Memos service identity is invalid"
}
$signIn = Invoke-RestMethod -Uri "$memosBaseUrl/api/v1/auth/signin" -Method Post -ContentType "application/json" -Body (@{
    passwordCredentials = @{ username = $memosServiceUser; password = $temporaryPassword }
} | ConvertTo-Json -Depth 3)
$serviceHeaders = @{ Authorization = "Bearer $($signIn.accessToken)" }
$oldMemosTokens = @((Invoke-RestMethod -Uri "$memosBaseUrl/api/v1/users/$memosServiceUser/personalAccessTokens?pageSize=1000" -Headers $serviceHeaders).personalAccessTokens)
$createdMemosToken = Invoke-RestMethod -Uri "$memosBaseUrl/api/v1/users/$memosServiceUser/personalAccessTokens" -Headers $serviceHeaders -Method Post -ContentType "application/json" -Body (@{
    description = "BabyBuddy milestone bridge"
    expiresInDays = 90
} | ConvertTo-Json)
$memosServicePat = $createdMemosToken.token
if ([string]::IsNullOrWhiteSpace($memosServicePat)) { throw "Memos did not return the service credential" }
$serviceIdentityCheck = Invoke-RestMethod -Uri "$memosBaseUrl/api/v1/auth/me" -Headers @{ Authorization = "Bearer $memosServicePat" }
if ($serviceIdentityCheck.user.name -ne "users/$memosServiceUser" -or $serviceIdentityCheck.user.role -ne "USER") {
    throw "The Memos service credential failed identity verification"
}

$container = docker inspect $ContainerName --format '{{.State.Running}}' 2>$null
if ($LASTEXITCODE -ne 0 -or $container -ne "true") { throw "BabyBuddy is not running" }
$rotationFlag = if ($ForceRotate) { "1" } else { "0" }
$tokenOutput = docker exec --user abc -e DJANGO_SETTINGS_MODULE=babybuddy.settings.base -e EMBE_FORCE_ROTATE=$rotationFlag $ContainerName sh -lc 'cd /app/www/public && /lsiopy/bin/python3 manage.py shell -c "import os; from django.contrib.auth import get_user_model; from django.contrib.auth.models import Permission; from rest_framework.authtoken.models import Token; U=get_user_model(); u,_=U.objects.get_or_create(username=\"embe-sync\",defaults={\"is_active\":True,\"is_staff\":False,\"is_superuser\":False}); u.is_active=True; u.is_staff=False; u.is_superuser=False; u.set_unusable_password(); u.save(); p=Permission.objects.filter(codename__in=[\"view_note\",\"view_child\",\"view_tag\"],content_type__app_label__in=[\"core\",\"taggit\"]); assert p.count() == 3; u.user_permissions.set(p); old=Token.objects.filter(user=u); old.delete() if os.environ.get(\"EMBE_FORCE_ROTATE\")==\"1\" else None; t=Token.objects.get_or_create(user=u)[0]; print(f\"EMBE_TOKEN={t.key}|{t.created.isoformat()}\")"'
if ($LASTEXITCODE -ne 0) { throw "Unable to provision the BabyBuddy API credential" }
$matches = [regex]::Matches(($tokenOutput -join "`n"), '(?im)^EMBE_TOKEN=([a-f0-9]{40})\|([^\r\n]+)$')
if ($matches.Count -ne 1) { throw "BabyBuddy returned an invalid API credential" }
$babyBuddyToken = $matches[0].Groups[1].Value
$tokenCreatedAt = ([DateTimeOffset]::Parse($matches[0].Groups[2].Value)).ToUniversalTime().ToString("o")

$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$serviceIdentity = "${env:COMPUTERNAME}\EmBeBridgeSvc"

New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
$runtimeGrants = @("${identity}:(OI)(CI)(F)", "SYSTEM:(OI)(CI)(F)", "BUILTIN\Administrators:(OI)(CI)(F)")
if (Get-LocalUser -Name "EmBeBridgeSvc" -ErrorAction SilentlyContinue) {
    $runtimeGrants += "${serviceIdentity}:(OI)(CI)(R)"
}
& icacls.exe $runtimeDirectory /inheritance:r /grant:r $runtimeGrants | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Unable to restrict the BabyBuddy runtime directory" }

New-Item -ItemType Directory -Path $ledgerDirectory -Force | Out-Null
$ledgerGrants = @("${identity}:(OI)(CI)(F)", "SYSTEM:(OI)(CI)(F)", "BUILTIN\Administrators:(OI)(CI)(F)")
if (Get-LocalUser -Name "EmBeBridgeSvc" -ErrorAction SilentlyContinue) {
    $ledgerGrants += "${serviceIdentity}:(OI)(CI)(M)"
}
& icacls.exe $ledgerDirectory /inheritance:r /grant:r $ledgerGrants | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Unable to restrict the BabyBuddy sync ledger" }

$ledgerPath = Join-Path $ledgerDirectory "ledger.sqlite3"
$rotationDueAt = ([DateTimeOffset]::Parse($tokenCreatedAt)).AddDays(90).ToString("o")
$memosRotationDueAt = (Get-Date).ToUniversalTime().AddDays(90).ToString("o")
$lines = @(
    "BABYBUDDY_BASE_URL=http://127.0.0.1:8000",
    "BABYBUDDY_TOKEN=$babyBuddyToken",
    "BABYBUDDY_TOKEN_CREATED_AT=$tokenCreatedAt",
    "BABYBUDDY_TOKEN_ROTATION_DUE_AT=$rotationDueAt",
    "MEMOS_BASE_URL=$memosBaseUrl",
    "MEMOS_USER_NAME=users/$memosServiceUser",
    "MEMOS_SYNC_PAT=$memosServicePat",
    "MEMOS_PAT_ROTATION_DUE_AT=$memosRotationDueAt",
    "SYNC_LEDGER=$ledgerPath"
)
$temporary = "$runtimeSecret.tmp"
try {
    [IO.File]::Create($temporary).Dispose()
    $fileGrants = @("${identity}:(F)", "SYSTEM:(F)", "BUILTIN\Administrators:(F)")
    if (Get-LocalUser -Name "EmBeBridgeSvc" -ErrorAction SilentlyContinue) {
        $fileGrants += "${serviceIdentity}:(R)"
    }
    & icacls.exe $temporary /inheritance:r /grant:r $fileGrants | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Unable to restrict the temporary BabyBuddy sync credential" }
    [IO.File]::WriteAllLines($temporary, $lines, [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temporary -Destination $runtimeSecret -Force
    $grants = @("${identity}:(F)", "SYSTEM:(F)", "BUILTIN\Administrators:(F)")
    if (Get-LocalUser -Name "EmBeBridgeSvc" -ErrorAction SilentlyContinue) {
        $grants += "${serviceIdentity}:(R)"
    }
    & icacls.exe $runtimeSecret /inheritance:r /grant:r $grants | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Unable to restrict the BabyBuddy sync credential" }
} finally {
    if (Test-Path -LiteralPath $temporary -PathType Leaf) {
        Remove-Item -LiteralPath $temporary -Force
    }
}

$pendingMemosTokenRevocations = 0
foreach ($oldToken in $oldMemosTokens) {
    try {
        Invoke-RestMethod -Uri "$memosBaseUrl/api/v1/$($oldToken.name)" -Headers @{ Authorization = "Bearer $memosServicePat" } -Method Delete | Out-Null
    } catch {
        $pendingMemosTokenRevocations++
    }
}

[ordered]@{
    status = "ready"
    babybuddy_api = "reachable"
    memos_credential = "separate"
    runtime_secret_acl_restricted = $true
    memos_service_identity = "dedicated_user"
    old_credentials_pending = $pendingMemosTokenRevocations
} | ConvertTo-Json -Compress

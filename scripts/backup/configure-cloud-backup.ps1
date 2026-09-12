param([string]$ProjectRoot = 'C:\EmBe')
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$projectRef = 'tpqqzowhndbkmkckpbgv'
function Read-EnvFile([string]$Path) {
    $values = @{}
    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($line -match '^([A-Z0-9_]+)=(.*)$') { $values[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'") }
    }
    return $values
}
$config = Read-EnvFile (Join-Path $ProjectRoot 'secrets/supabase-backup.env')
if ($config.SUPABASE_PROJECT_REF -ne $projectRef) { throw 'Wrong project' }
$credentials = Import-Clixml (Join-Path $ProjectRoot 'secrets/cloud-backup.credential.xml')
$storage = Read-EnvFile (Join-Path $ProjectRoot 'infra/compose/storage-poc.env')
$token = ([Net.NetworkCredential]::new('', $credentials.Token)).Password
$password = ([Net.NetworkCredential]::new('', $credentials.Password)).Password
if ($token -notmatch '^[a-f0-9]{64}$' -or $password -notmatch '^[a-f0-9]{64}$') { throw 'Invalid credential' }
$tempPath = Join-Path $ProjectRoot ('secrets/cloud-edge-' + [guid]::NewGuid().ToString('N') + '.env')
try {
    $lines = @(
        "EMBE_CLOUD_BACKUP_TOKEN=$token",
        "EMBE_BACKUP_R2_ACCOUNT=$($storage.EMBE_R2_ACCOUNT_ID)",
        "EMBE_BACKUP_R2_ACCESS_KEY=$($storage.EMBE_R2_ACCESS_KEY_ID)",
        "EMBE_BACKUP_R2_SECRET_KEY=$($storage.EMBE_R2_SECRET_ACCESS_KEY)"
    )
    [IO.File]::WriteAllLines($tempPath, $lines, [Text.UTF8Encoding]::new($false))
    $env:SUPABASE_ACCESS_TOKEN = $config.SUPABASE_ACCESS_TOKEN
    & (Join-Path $ProjectRoot 'tools/bin/supabase.exe') secrets set --project-ref $projectRef --env-file $tempPath
    if ($LASTEXITCODE -ne 0) { throw 'Could not configure Edge secrets' }
    $password | gh secret set EMBE_CLOUD_BACKUP_DB_PASSWORD --repo nguyenhieuisocial/embe
    if ($LASTEXITCODE -ne 0) { throw 'Could not configure database credential' }
    $token | gh secret set EMBE_CLOUD_BACKUP_TOKEN --repo nguyenhieuisocial/embe
    if ($LASTEXITCODE -ne 0) { throw 'Could not configure upload credential' }
    Write-Output 'Cloud credentials configured; no R2 or management key sent to GitHub.'
} finally {
    if (Test-Path -LiteralPath $tempPath) { Remove-Item -LiteralPath $tempPath }
    Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
    $lines = $null; $token = $null; $password = $null; $storage = $null; $config = $null
}

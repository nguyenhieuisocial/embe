param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$runner = Join-Path $projectRoot "scripts\backup\export-supabase-read-model.ps1"
$runnerSource = Get-Content -LiteralPath $runner -Raw
if (-not $runnerSource.Contains('Move-Item -LiteralPath $temporary -Destination $statusPath -Force')) {
    throw "Supabase export status must be replaced atomically"
}
$testRoot = Join-Path $env:TEMP ("embe-supabase-backup-" + [guid]::NewGuid().ToString("N"))
$token = "token-must-not-leak"

try {
    $output = Join-Path $testRoot "exports\backup-staging\session"
    $secretDirectory = Join-Path $testRoot "secrets"
    $toolDirectory = Join-Path $testRoot "tools\bin"
    New-Item -ItemType Directory -Path $output, $secretDirectory, $toolDirectory -Force | Out-Null

    $config = Join-Path $secretDirectory "supabase-backup.env"
    @(
        "SUPABASE_PROJECT_REF=test-project-ref"
        "SUPABASE_ACCESS_TOKEN=$token"
    ) | Set-Content -LiteralPath $config -Encoding UTF8

    $currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    & icacls $secretDirectory /inheritance:r /grant:r "*${currentSid}:(OI)(CI)F" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Unable to protect test secret directory" }

    $fakeCli = Join-Path $toolDirectory "supabase.ps1"
    @'
param([Parameter(ValueFromRemainingArguments = $true)] [string[]]$Arguments)
$log = [Environment]::GetEnvironmentVariable("EMBE_FAKE_SUPABASE_LOG", "Process")
if (-not $env:SUPABASE_ACCESS_TOKEN) { exit 11 }
Write-Output $env:SUPABASE_ACCESS_TOKEN
$Arguments | ConvertTo-Json -Compress | Add-Content -LiteralPath $log
$fileIndex = [Array]::IndexOf($Arguments, "--file")
if ($fileIndex -lt 0 -or $fileIndex -ge ($Arguments.Count - 1)) { exit 12 }
$content = if ($Arguments -contains "--data-only") { "COPY portal_read_model.test FROM stdin;" } else { "CREATE SCHEMA portal_read_model;" }
Set-Content -LiteralPath $Arguments[$fileIndex + 1] -Value $content -Encoding UTF8
exit 0
'@ | Set-Content -LiteralPath $fakeCli -Encoding UTF8

    $logPath = Join-Path $testRoot "cli-calls.jsonl"
    $env:EMBE_FAKE_SUPABASE_LOG = $logPath
    $raw = & powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $runner `
        -ProjectRoot $testRoot -OutputDirectory $output -ConfigFile $config -SupabaseCliPath $fakeCli 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Supabase exporter failed: $raw" }
    if (($raw | Out-String) -match [regex]::Escape($token)) {
        throw "Supabase exporter leaked a secret"
    }

    $result = ($raw | Out-String).Trim() | ConvertFrom-Json
    if ($result.status -ne "ok" -or @($result.artifacts).Count -ne 2) { throw "Unexpected exporter result" }
    $exportStatusPath = Join-Path $testRoot "exports\backup-manifests\supabase-export-run-status-v2.json"
    $exportStatus = Get-Content -LiteralPath $exportStatusPath -Raw | ConvertFrom-Json
    if ($exportStatus.status -ne "ok" -or $exportStatus.phase -ne "complete") {
        throw "Successful Supabase export status is invalid"
    }
    foreach ($name in @("supabase-portal-schema.sql", "supabase-portal-data.sql")) {
        $artifact = @($result.artifacts | Where-Object name -eq $name)
        if ($artifact.Count -ne 1 -or $artifact[0].size_bytes -le 0 -or $artifact[0].sha256 -notmatch '^[a-f0-9]{64}$') {
            throw "Missing valid artifact metadata for $name"
        }
        if (-not (Test-Path -LiteralPath (Join-Path $output $name) -PathType Leaf)) { throw "Missing dump: $name" }
    }

    # Keep each decoded JSON argument array as one call under both Windows
    # PowerShell and PowerShell 7 (which otherwise enumerates the array).
    $calls = @(Get-Content -LiteralPath $logPath | ForEach-Object { ,($_ | ConvertFrom-Json) })
    if ($calls.Count -ne 2) {
        $rawCalls = Get-Content -LiteralPath $logPath -Raw
        throw "Expected exactly two Supabase CLI calls, got $($calls.Count). Raw log: $rawCalls"
    }
    foreach ($call in $calls) {
        if ($call -notcontains "portal_read_model" -or $call -notcontains "--project-ref") { throw "Dump is not bounded to portal_read_model/project ref" }
        $joined = $call -join " "
        if ($joined.Contains($token)) { throw "Secret appeared in CLI arguments" }
    }
    if (@($calls | Where-Object { $_ -contains "--data-only" }).Count -ne 1) { throw "Expected one data-only dump" }

    $outside = Join-Path $testRoot "outside"
    New-Item -ItemType Directory -Path $outside | Out-Null
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        & powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $runner `
            -ProjectRoot $testRoot -OutputDirectory $outside -ConfigFile $config -SupabaseCliPath $fakeCli 2>$null | Out-Null
        $outsideExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($outsideExitCode -eq 0) { throw "Exporter accepted staging outside the approved root" }

    & icacls $config /grant "*S-1-1-0:R" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Unable to create insecure ACL fixture" }
    try {
        $ErrorActionPreference = "Continue"
        & powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $runner `
            -ProjectRoot $testRoot -OutputDirectory $output -ConfigFile $config -SupabaseCliPath $fakeCli 2>$null | Out-Null
        $aclExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($aclExitCode -eq 0) { throw "Exporter accepted a broadly readable secret file" }

    Write-Output "PASS: Supabase exporter is bounded, secret-safe, and emits verified schema/data dumps"
} finally {
    Remove-Item Env:EMBE_FAKE_SUPABASE_LOG -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $testRoot) {
        $resolved = [IO.Path]::GetFullPath($testRoot)
        $temp = [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') + '\'
        if (-not ($resolved + '\').StartsWith($temp, [StringComparison]::OrdinalIgnoreCase)) { throw "Refusing to clean outside TEMP" }
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}

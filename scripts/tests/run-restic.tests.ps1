param()

$ErrorActionPreference = "Stop"

$testRoot = Join-Path $env:TEMP ("embe-backup-test-" + [Guid]::NewGuid().ToString("N"))
$scriptRoot = Join-Path (Split-Path -Parent $PSScriptRoot) "backup"
$runScript = Join-Path $scriptRoot "run-restic.ps1"

$failed = 0
$total = 0

if (-not (Test-Path -LiteralPath $runScript)) {
    throw "run-restic.ps1 is missing: $runScript"
}

function Assert-Equal {
    param([string]$Name, $Expected, $Actual)
    $script:total++
    if ($Expected -ne $Actual) {
        Write-Error "$Name expected '$Expected' got '$Actual'"
        $script:failed++
    } else {
        Write-Host "PASS: $Name" -ForegroundColor Green
    }
}

function Invoke-RunRestic {
    param(
        [string]$Repo,
        [string]$PasswordFile,
        [string]$CodePath,
        [string]$VaultPath,
        [string]$AppDataPath,
        [string]$Manifest
    )

    $output = & powershell -NoProfile -ExecutionPolicy Bypass -File $runScript `
        -Repository $Repo `
        -PasswordFile $PasswordFile `
        -CodeConfigPath $CodePath `
        -VaultPath $VaultPath `
        -AppDataPath $AppDataPath `
        -ManifestPath $Manifest `
        -ResticPath (Join-Path $testRoot "restic.ps1") `
        -Tag "test"

    [pscustomobject]@{
        ExitCode = $LASTEXITCODE
        Output = $output
    }
}

function Invoke-RunResticWithDefaultBinary {
    param(
        [string]$Repo,
        [string]$PasswordFile,
        [string]$CodePath,
        [string]$VaultPath,
        [string]$AppDataPath,
        [string]$Manifest
    )

    $output = & powershell -NoProfile -ExecutionPolicy Bypass -File $runScript `
        -Repository $Repo `
        -PasswordFile $PasswordFile `
        -CodeConfigPath $CodePath `
        -VaultPath $VaultPath `
        -AppDataPath $AppDataPath `
        -ManifestPath $Manifest `
        -Tag "test-default-binary"

    [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = $output }
}

try {
    New-Item -ItemType Directory -Path $testRoot -Force | Out-Null

    $fakeRestic = @'
param([Parameter(ValueFromRemainingArguments = $true)] [string[]]$Args)
$snapshotId = "snap-$(New-Guid | Select-Object -ExpandProperty Guid)"

if ($Args.Count -eq 0) { exit 1 }
if ($Args -contains "init") { exit 0 }
if ($Args -contains "backup") {
    $payload = @{ summary = @{ snapshot_id = $snapshotId; files = 3; total_size = 3 } }
    $payload | ConvertTo-Json -Compress
    exit 0
}
exit 0
'@
    Set-Content -LiteralPath (Join-Path $testRoot "restic.ps1") -Value $fakeRestic -Encoding UTF8

    $code = Join-Path $testRoot "code"
    $vault = Join-Path $testRoot "vault"
    $app = Join-Path $testRoot "appdata"
    $exports = Join-Path $testRoot "exports"
    $repo = Join-Path $testRoot "repo"
    $manifest = Join-Path $exports "manifest.json"
    $passwordFile = Join-Path $testRoot "restic-password.txt"

    New-Item -ItemType Directory -Path $code, $vault, $app, $exports, $repo | Out-Null
    Set-Content -Path (Join-Path $code "app.txt") -Value "hello-code"
    Set-Content -Path (Join-Path $vault "note.md") -Value "# vault"
    Set-Content -Path (Join-Path $app "media.bin") -Value "abc123"
    Set-Content -LiteralPath $passwordFile -Value "secret" -NoNewline

    $missingPassword = Invoke-RunRestic -Repo $repo -PasswordFile (Join-Path $testRoot "missing-password.txt") -CodePath $code -VaultPath $vault -AppDataPath $app -Manifest $manifest
    Assert-Equal "run-restic fails when password file is missing" 1 $missingPassword.ExitCode

    $missingRepo = Invoke-RunRestic -Repo "" -PasswordFile $passwordFile -CodePath $code -VaultPath $vault -AppDataPath $app -Manifest $manifest
    Assert-Equal "run-restic fails when repository is missing" 1 $missingRepo.ExitCode

    $success = Invoke-RunRestic -Repo $repo -PasswordFile $passwordFile -CodePath $code -VaultPath $vault -AppDataPath $app -Manifest $manifest
    Assert-Equal "run-restic succeeds with valid inputs" 0 $success.ExitCode
    if (-not (Test-Path -LiteralPath $manifest)) { throw "manifest not created" }

    $data = Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
    Assert-Equal "manifest has code source" "code" $data.sources[0].label
    Assert-Equal "manifest has vault source" "vault" $data.sources[1].label
    Assert-Equal "manifest has appdata source" "appdata" $data.sources[2].label
    Assert-Equal "manifest has snapshot id" $true ([string]::IsNullOrWhiteSpace($data.snapshot_id) -ne $true)
    Assert-Equal "code source file count" 1 $data.sources[0].file_count
    Assert-Equal "vault source file count" 1 $data.sources[1].file_count
    Assert-Equal "appdata source file count" 1 $data.sources[2].file_count

    $defaultBinary = Invoke-RunResticWithDefaultBinary `
        -Repo (Join-Path $testRoot "real-restic-repo") `
        -PasswordFile $passwordFile `
        -CodePath $code `
        -VaultPath $vault `
        -AppDataPath $app `
        -Manifest (Join-Path $exports "real-restic-manifest.json")
    Assert-Equal "default restic binary path works" 0 $defaultBinary.ExitCode
} finally {
    if (Test-Path -LiteralPath $testRoot) {
        $resolvedTestRoot = [System.IO.Path]::GetFullPath($testRoot).TrimEnd('\') + '\'
        $resolvedTempRoot = [System.IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') + '\'
        if (-not $resolvedTestRoot.StartsWith($resolvedTempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to clean path outside temp: $resolvedTestRoot"
        }
        Remove-Item -LiteralPath $resolvedTestRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}

if ($failed -gt 0) {
    throw "$failed of $total assertions failed."
}

Write-Output "PASS: run-restic tests passed"

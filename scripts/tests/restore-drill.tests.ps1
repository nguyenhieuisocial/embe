param()

$ErrorActionPreference = "Stop"

$testRoot = Join-Path $env:TEMP ("embe-restore-drill-" + [Guid]::NewGuid().ToString("N"))
$scriptRoot = Join-Path (Split-Path -Parent $PSScriptRoot) "backup"
$restoreScript = Join-Path $scriptRoot "restore-drill.ps1"
$backupScript = Join-Path $scriptRoot "run-restic.ps1"

$failed = 0
$total = 0

if (-not (Test-Path -LiteralPath $restoreScript)) {
    throw "restore-drill.ps1 is missing: $restoreScript"
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

function Invoke-RestoreDrill {
    param(
        [string]$ManifestPath,
        [string]$PasswordFile,
        [string]$RestoreRoot,
        [string]$FakeRestic,
        [switch]$AllowR2
    )

    $arguments = @(
        "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $restoreScript,
        "-ManifestPath", $ManifestPath, "-PasswordFile", $PasswordFile,
        "-RestoreRoot", $RestoreRoot
    )
    if (-not [string]::IsNullOrWhiteSpace($FakeRestic)) { $arguments += @("-ResticPath", $FakeRestic) }
    if ($AllowR2) { $arguments += "-AllowR2Repository" }
    $output = & powershell @arguments

    [pscustomobject]@{
        ExitCode = $LASTEXITCODE
        Output = $output
    }
}

try {
    New-Item -ItemType Directory -Path $testRoot -Force | Out-Null

    $source = Join-Path $testRoot "source"
    $restoreRoot = Join-Path $testRoot "restore"
    $manifestPath = Join-Path $testRoot "manifest.json"
    $passwordFile = Join-Path $testRoot "restic-password.txt"
    $fakeRepo = Join-Path $testRoot "fake-repo"
    New-Item -ItemType Directory -Path $source, $restoreRoot, $fakeRepo | Out-Null

    $sourceCode = Join-Path $source "code"
    $sourceVault = Join-Path $source "vault"
    $sourceApp = Join-Path $source "appdata"
    New-Item -ItemType Directory -Path $sourceCode, $sourceVault, $sourceApp | Out-Null

    $codeFile = Join-Path $sourceCode "a.txt"
    $vaultFile = Join-Path $sourceVault "b.md"
    $appFile = Join-Path $sourceApp "c.dat"
    Set-Content -Path $codeFile -Value "abc"
    Set-Content -Path $vaultFile -Value "xyz"
    Set-Content -Path $appFile -Value "media"

    $codeHash = (Get-FileHash -LiteralPath $codeFile -Algorithm SHA256).Hash.ToLowerInvariant()
    $vaultHash = (Get-FileHash -LiteralPath $vaultFile -Algorithm SHA256).Hash.ToLowerInvariant()
    $appHash = (Get-FileHash -LiteralPath $appFile -Algorithm SHA256).Hash.ToLowerInvariant()

    $manifest = [ordered]@{
        snapshot_id = "snap-drill-1"
        repository = $fakeRepo
        sources = @(
            [ordered]@{
                label = "code"
                source_path = $sourceCode
                files = @(
                    [ordered]@{ name = "a.txt"; sha256 = $codeHash; relative_path = "a.txt" }
                )
            },
            [ordered]@{
                label = "vault"
                source_path = $sourceVault
                files = @(
                    [ordered]@{ name = "b.md"; sha256 = $vaultHash; relative_path = "b.md" }
                )
            },
            [ordered]@{
                label = "appdata"
                source_path = $sourceApp
                files = @(
                    [ordered]@{ name = "c.dat"; sha256 = $appHash; relative_path = "c.dat" }
                )
            }
        )
    } | ConvertTo-Json -Depth 12
    Set-Content -LiteralPath $manifestPath -Value $manifest -Encoding UTF8
    Set-Content -LiteralPath $passwordFile -Value "secret" -NoNewline

    $fakeRestic = @"
param([Parameter(ValueFromRemainingArguments = `$true)] [string[]]`$Args)
if (`$Args.Count -lt 1) { exit 1 }
if (`$Args[0] -ne "restore") { exit 0 }

`$sourceRoot = [Environment]::GetEnvironmentVariable("FAKE_RESTORE_SOURCE", [System.EnvironmentVariableTarget]::Process)
if (-not `$sourceRoot) { exit 1 }

`$targetIndex = [Array]::IndexOf(`$Args, "--target")
if (`$targetIndex -lt 0 -or `$targetIndex -ge (`$Args.Count - 1)) { exit 1 }
`$target = `$Args[`$targetIndex + 1]

if (-not (Test-Path -LiteralPath `$target)) { New-Item -ItemType Directory -Path `$target -Force | Out-Null }
`$label = Split-Path -Leaf `$target
`$source = Join-Path `$sourceRoot `$label
Get-ChildItem -LiteralPath `$source -Force | Copy-Item -Destination `$target -Recurse -Force
Write-Output '{`"message`":`"restore-ok`"}'
exit 0
"@
    $fakeResticPath = Join-Path $testRoot "restic.ps1"
    Set-Content -LiteralPath $fakeResticPath -Value $fakeRestic -Encoding UTF8
    $env:FAKE_RESTORE_SOURCE = $source

    $ok = Invoke-RestoreDrill -ManifestPath $manifestPath -PasswordFile $passwordFile -RestoreRoot $restoreRoot -FakeRestic $fakeResticPath
    Assert-Equal "restore-drill succeeds with matching checksums" 0 $ok.ExitCode

    $okOutput = $ok.Output | ConvertFrom-Json
    Assert-Equal "restore-drill status is pass" "pass" $okOutput.status

    $badManifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $badManifest.sources[0].files[0].sha256 = "deadbeef"
    $badManifestPath = Join-Path $testRoot "manifest-bad.json"
    $badManifest | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $badManifestPath -Encoding UTF8

    $bad = Invoke-RestoreDrill -ManifestPath $badManifestPath -PasswordFile $passwordFile -RestoreRoot (Join-Path $testRoot "restore-bad") -FakeRestic $fakeResticPath
    Assert-Equal "restore-drill fails on checksum mismatch" 1 $bad.ExitCode

    $remoteManifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $remoteManifest.repository = "s3:https://example.invalid/embe"
    $remoteManifestPath = Join-Path $testRoot "manifest-remote.json"
    $remoteManifest | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $remoteManifestPath -Encoding UTF8
    $remote = Invoke-RestoreDrill -ManifestPath $remoteManifestPath -PasswordFile $passwordFile -RestoreRoot (Join-Path $testRoot "restore-remote") -FakeRestic $fakeResticPath
    Assert-Equal "bounded restore drill rejects remote repository" 1 $remote.ExitCode

    $remoteManifest.repository = "s3:https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com/embe-backup/restic-critical"
    $remoteManifest | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $remoteManifestPath -Encoding UTF8
    $remoteAllowed = Invoke-RestoreDrill -ManifestPath $remoteManifestPath -PasswordFile $passwordFile -RestoreRoot (Join-Path $testRoot "restore-r2") -FakeRestic $fakeResticPath -AllowR2
    Assert-Equal "approved R2 restore requires and accepts explicit switch" 0 $remoteAllowed.ExitCode

    $realRepo = Join-Path $testRoot "real-repo"
    $realManifest = Join-Path $testRoot "real-manifest.json"
    $null = & powershell -NoProfile -ExecutionPolicy Bypass -File $backupScript `
        -Repository $realRepo `
        -PasswordFile $passwordFile `
        -CodeConfigPath $sourceCode `
        -VaultPath $sourceVault `
        -AppDataPath $sourceApp `
        -ManifestPath $realManifest `
        -Tag "real-restore-drill"
    Assert-Equal "real restic backup for restore drill succeeds" 0 $LASTEXITCODE

    $realRestore = Invoke-RestoreDrill `
        -ManifestPath $realManifest `
        -PasswordFile $passwordFile `
        -RestoreRoot (Join-Path $testRoot "real-restore") `
        -FakeRestic ""
    Assert-Equal "real restic restore drill succeeds" 0 $realRestore.ExitCode
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

Write-Output "PASS: restore-drill tests passed"

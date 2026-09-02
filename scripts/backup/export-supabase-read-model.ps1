param(
    [string]$ProjectRoot = "C:\EmBe",
    [Parameter(Mandatory = $true)]
    [string]$OutputDirectory,
    [string]$ConfigFile,
    [string]$SupabaseCliPath
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ([string]::IsNullOrWhiteSpace($ConfigFile)) {
    $ConfigFile = Join-Path $ProjectRoot "secrets\supabase-backup.env"
}
if ([string]::IsNullOrWhiteSpace($SupabaseCliPath)) {
    $SupabaseCliPath = Join-Path $ProjectRoot "tools\bin\supabase.exe"
}

function Assert-ChildPath {
    param([string]$Path, [string]$Parent, [string]$Description)

    $resolvedPath = [IO.Path]::GetFullPath($Path).TrimEnd('\')
    $resolvedParent = [IO.Path]::GetFullPath($Parent).TrimEnd('\') + '\'
    if (-not ($resolvedPath + '\').StartsWith($resolvedParent, [StringComparison]::OrdinalIgnoreCase)) {
        throw "$Description is outside its approved directory."
    }
}

function Assert-PrivateAcl {
    param([string]$Path)

    $broadSids = @("S-1-1-0", "S-1-5-11", "S-1-5-32-545", "S-1-5-32-546")
    foreach ($candidate in @($Path, (Split-Path -Parent $Path))) {
        $acl = Get-Acl -LiteralPath $candidate
        $rules = $acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])
        foreach ($rule in $rules) {
            if ($rule.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow -and
                $broadSids -contains $rule.IdentityReference.Value) {
                throw "Supabase backup secret ACL grants access to a broad identity."
            }
        }
    }
}

function Invoke-SupabaseDump {
    param([string[]]$Arguments)

    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        if ([IO.Path]::GetExtension($SupabaseCliPath) -ieq ".ps1") {
            $null = & powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $SupabaseCliPath @Arguments 2>&1
        } else {
            $null = & $SupabaseCliPath @Arguments 2>&1
        }
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($exitCode -ne 0) {
        throw "Supabase CLI dump failed with exit code $exitCode."
    }
}

$stagingRoot = Join-Path $ProjectRoot "exports\backup-staging"
$secretsRoot = Join-Path $ProjectRoot "secrets"
foreach ($requiredDirectory in @($ProjectRoot, $stagingRoot, $secretsRoot, $OutputDirectory)) {
    if (-not (Test-Path -LiteralPath $requiredDirectory -PathType Container)) {
        throw "Required directory is missing: $requiredDirectory"
    }
}
foreach ($requiredFile in @($ConfigFile, $SupabaseCliPath)) {
    if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
        throw "Required file is missing: $requiredFile"
    }
}
Assert-ChildPath -Path $OutputDirectory -Parent $stagingRoot -Description "Supabase dump output"
Assert-ChildPath -Path $ConfigFile -Parent $secretsRoot -Description "Supabase backup config"
Assert-PrivateAcl -Path $ConfigFile

$settings = @{}
foreach ($line in Get-Content -LiteralPath $ConfigFile) {
    $trimmed = $line.Trim()
    if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith("#")) { continue }
    $parts = $trimmed -split "=", 2
    if ($parts.Count -ne 2 -or [string]::IsNullOrWhiteSpace($parts[0])) {
        throw "Supabase backup config contains an invalid line."
    }
    $settings[$parts[0].Trim()] = $parts[1]
}
foreach ($name in @("SUPABASE_PROJECT_REF", "SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD")) {
    if (-not $settings.ContainsKey($name) -or [string]::IsNullOrWhiteSpace([string]$settings[$name])) {
        throw "Supabase backup config is missing required setting: $name"
    }
}

$previousToken = [Environment]::GetEnvironmentVariable("SUPABASE_ACCESS_TOKEN", "Process")
$previousPassword = [Environment]::GetEnvironmentVariable("SUPABASE_DB_PASSWORD", "Process")
$schemaPath = Join-Path $OutputDirectory "supabase-portal-schema.sql"
$dataPath = Join-Path $OutputDirectory "supabase-portal-data.sql"
try {
    [Environment]::SetEnvironmentVariable("SUPABASE_ACCESS_TOKEN", [string]$settings.SUPABASE_ACCESS_TOKEN, "Process")
    [Environment]::SetEnvironmentVariable("SUPABASE_DB_PASSWORD", [string]$settings.SUPABASE_DB_PASSWORD, "Process")

    Invoke-SupabaseDump -Arguments @(
        "db", "dump", "--project-ref", [string]$settings.SUPABASE_PROJECT_REF,
        "--schema", "portal_read_model", "--file", $schemaPath
    )
    Invoke-SupabaseDump -Arguments @(
        "db", "dump", "--project-ref", [string]$settings.SUPABASE_PROJECT_REF,
        "--schema", "portal_read_model", "--data-only", "--use-copy", "--file", $dataPath
    )
} finally {
    [Environment]::SetEnvironmentVariable("SUPABASE_ACCESS_TOKEN", $previousToken, "Process")
    [Environment]::SetEnvironmentVariable("SUPABASE_DB_PASSWORD", $previousPassword, "Process")
}

$entries = foreach ($path in @($schemaPath, $dataPath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf) -or (Get-Item -LiteralPath $path).Length -eq 0) {
        throw "Supabase CLI did not create a non-empty required dump."
    }
    [ordered]@{
        name = Split-Path -Leaf $path
        size_bytes = (Get-Item -LiteralPath $path).Length
        sha256 = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
    }
}

[ordered]@{ status = "ok"; artifacts = @($entries) } | ConvertTo-Json -Depth 6 -Compress

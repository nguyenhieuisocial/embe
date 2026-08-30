[CmdletBinding()]
param(
    [string]$ProjectRoot = "C:\EmBe",
    [switch]$AllowInitialSetup
)

$ErrorActionPreference = "Stop"
$credential = Get-Credential -Message "Tạo tài khoản quản trị riêng cho Uptime Kuma"
if (-not $credential) { throw "Credential is required" }

$python = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$script = Join-Path $ProjectRoot "scripts\health\bootstrap_uptime_kuma.py"
$env:EMBE_KUMA_USERNAME = $credential.UserName
$env:EMBE_KUMA_PASSWORD = $credential.GetNetworkCredential().Password
try {
    $arguments = @($script)
    if ($AllowInitialSetup) { $arguments += "--allow-initial-setup" }
    & $python @arguments
    if ($LASTEXITCODE -ne 0) { throw "Uptime Kuma bootstrap failed" }
} finally {
    Remove-Item Env:EMBE_KUMA_USERNAME -ErrorAction SilentlyContinue
    Remove-Item Env:EMBE_KUMA_PASSWORD -ErrorAction SilentlyContinue
}

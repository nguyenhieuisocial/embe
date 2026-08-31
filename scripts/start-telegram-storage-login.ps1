param([string]$ProjectRoot = "C:\EmBe")

$ErrorActionPreference = "Stop"
$transcriptPath = Join-Path $ProjectRoot "data\status\telegram-login-transcript.txt"
New-Item -ItemType Directory -Path (Split-Path $transcriptPath) -Force | Out-Null
Start-Transcript -LiteralPath $transcriptPath -Force | Out-Null

try {
$envFile = Join-Path $ProjectRoot "secrets\telegram-poc.env"
foreach ($line in Get-Content -LiteralPath $envFile) {
    if ($line -match '^([^#=]+)=(.*)$') {
        [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
    }
}
$env:PYTHONPATH = Join-Path $ProjectRoot "services\storage-poc\src"
& (Join-Path $ProjectRoot ".venv\Scripts\python.exe") `
    (Join-Path $ProjectRoot "services\storage-poc\scripts\create_dedicated_dpapi_session.py") `
    --qr

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nHoàn tất. Quay lại Codex và nhắn: xong Telegram" -ForegroundColor Green
} else {
    Write-Host "`nĐăng nhập chưa hoàn tất. Giữ cửa sổ này và báo lỗi hiển thị cho Codex." -ForegroundColor Yellow
}
} finally {
    Stop-Transcript | Out-Null
}

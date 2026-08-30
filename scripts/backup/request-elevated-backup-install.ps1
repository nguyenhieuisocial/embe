$ErrorActionPreference = "Stop"

$installer = Join-Path $PSScriptRoot "install-scheduled-backup.ps1"
$arguments = @(
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$installer`"",
    "-ProjectRoot", "`"C:\EmBe`"",
    "-VerifyNow"
) -join " "

Write-Host "Windows sap hien hop thoai xac nhan. Hay bam Yes mot lan." -ForegroundColor Yellow
$process = Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments -Wait -PassThru
if ($process.ExitCode -ne 0) {
    Write-Host "Chua hoan tat. Ma loi: $($process.ExitCode). Codex se tu kiem tra bao cao." -ForegroundColor Red
    exit $process.ExitCode
}

Write-Host "Da hoan tat lich backup va kiem tra tu dong." -ForegroundColor Green
Start-Sleep -Seconds 5

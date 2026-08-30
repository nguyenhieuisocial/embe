[CmdletBinding()]
param(
    [string]$ProjectRoot = "C:\EmBe",
    [string]$OutputPath = "",
    [string]$FixturePath = "",
    [double]$BackupMaxAgeHours = 8,
    [double]$RestoreMaxAgeDays = 35,
    [double]$PdfMaxAgeDays = 35,
    [string]$RequiredOllamaModel = "qwen3:8b",
    [string]$PortalUrl = "https://embe.hieu.asia"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not $OutputPath) { $OutputPath = Join-Path $ProjectRoot "data\status\system-health.json" }
$now = [DateTimeOffset]::UtcNow
$checks = [Collections.Generic.List[object]]::new()

function Add-Check([string]$Id, [string]$Status, [string]$Summary, [hashtable]$Evidence = @{}) {
    $checks.Add([ordered]@{ id = $Id; status = $Status; summary = $Summary; evidence = $Evidence })
}

function Convert-ToDateTimeOffset([object]$Value) {
    if ($Value -is [DateTimeOffset]) { return $Value }
    if ($Value -is [DateTime]) { return [DateTimeOffset]::new($Value) }
    return [DateTimeOffset]::Parse(
        [string]$Value,
        [Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::RoundtripKind
    )
}

function Get-AgeHours([object]$Value) {
    return ($now - (Convert-ToDateTimeOffset $Value)).TotalHours
}

function Test-HttpEndpoint([string]$Uri) {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -TimeoutSec 8 -MaximumRedirection 5
        return [pscustomobject]@{ reachable = $true; status_code = [int]$response.StatusCode }
    } catch {
        $statusCode = 0
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
            $statusCode = [int]$_.Exception.Response.StatusCode
        }
        return [pscustomobject]@{ reachable = $false; status_code = $statusCode }
    }
}

function Test-UptimeKumaEndpoint() {
    $http = Test-HttpEndpoint "http://127.0.0.1:3001/"
    $ready = $false
    if ($http.reachable) {
        try {
            $handshake = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3001/socket.io/?EIO=4&transport=polling" -TimeoutSec 8
            $ready = [int]$handshake.StatusCode -eq 200 -and [string]$handshake.Content -match '^0\{'
        } catch {
            # A setup page can return HTTP 200 while the actual monitoring socket is unavailable.
        }
    }
    return [pscustomobject]@{ reachable = [bool]$http.reachable; status_code = [int]$http.status_code; ready = [bool]$ready }
}

if ($FixturePath) {
    $fixture = Get-Content -LiteralPath $FixturePath -Raw | ConvertFrom-Json
    if ($fixture.now_utc) { $now = Convert-ToDateTimeOffset $fixture.now_utc }
    $diskFreePercent = [double]$fixture.disk_free_percent
    $containers = @($fixture.containers)
    $portalStatus = $fixture.portal_sync
    $bridgeStatus = $fixture.babybuddy_sync
    $backupCreated = $fixture.backup_created_utc
    $restoreStatus = [string]$fixture.restore.status
    $restoreVerified = $fixture.restore.verified_at
    $integrityStatus = [string]$fixture.integrity.status
    $integrityChecked = $fixture.integrity.checked_at
    $deadletters = [int]$fixture.deadletters
    $smartHealthy = [bool]$fixture.smart_healthy
    $serviceInstallReady = [bool]$fixture.service_install_ready
    $portalPublic = $fixture.endpoints.portal_public
    $nodeRed = $fixture.endpoints.node_red
    $uptimeKuma = $fixture.endpoints.uptime_kuma
    $ollama = $fixture.endpoints.ollama
    $mcpRuntimeReady = [bool]$fixture.mcp_runtime_ready
    $pdfReport = $fixture.pdf_report
} else {
    $driveName = ([IO.Path]::GetPathRoot($ProjectRoot)).TrimEnd(':', '\')
    $drive = Get-PSDrive -Name $driveName
    $diskFreePercent = 100 * $drive.Free / ($drive.Used + $drive.Free)

    $containers = @()
    $containerLines = docker ps -a --format '{{.Names}}|{{.Status}}' 2>$null
    if ($LASTEXITCODE -eq 0) {
        $containers = @($containerLines | ForEach-Object {
            $parts = $_ -split '\|', 2
            [pscustomobject]@{ name = $parts[0]; status = $parts[1] }
        })
    }

    $portalPath = Join-Path $ProjectRoot "data\status\portal-sync.json"
    $bridgePath = Join-Path $ProjectRoot "data\status\babybuddy-memos-sync.json"
    $portalStatus = if (Test-Path $portalPath) { Get-Content $portalPath -Raw | ConvertFrom-Json } else { $null }
    $bridgeStatus = if (Test-Path $bridgePath) { Get-Content $bridgePath -Raw | ConvertFrom-Json } else { $null }

    $latestManifest = Get-ChildItem (Join-Path $ProjectRoot "exports\backup-manifests") -Filter "*.json" -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
    $backupCreated = if ($latestManifest) { (Get-Content $latestManifest.FullName -Raw | ConvertFrom-Json).created_utc } else { "" }
    $restorePath = Join-Path $ProjectRoot "exports\r2-restore-report.json"
    $restore = if (Test-Path $restorePath) { Get-Content $restorePath -Raw | ConvertFrom-Json } else { $null }
    $restoreStatus = if ($restore) { [string]$restore.status } else { "missing" }
    $restoreVerified = if ($restore) { $restore.verified_at } else { "" }
    $integrityPath = Join-Path $ProjectRoot "data\status\restic-check.json"
    $integrity = if (Test-Path $integrityPath) { Get-Content $integrityPath -Raw | ConvertFrom-Json } else { $null }
    $integrityStatus = if ($integrity) { [string]$integrity.status } else { "missing" }
    $integrityChecked = if ($integrity) { $integrity.checked_at } else { "" }

    $deadletters = 0
    $ledgerPath = Join-Path $ProjectRoot "data\appdata\sync-daemon\ledger.sqlite3"
    $python = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
    if ((Test-Path $ledgerPath) -and (Test-Path $python)) {
        $queryScript = "import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); print(c.execute('SELECT COUNT(*) FROM deadletters').fetchone()[0])"
        $queryResult = & $python -c $queryScript $ledgerPath
        if ($LASTEXITCODE -ne 0) { throw "Unable to read the sanitized sync failure count" }
        $deadletters = [int]$queryResult
    }

    $physicalDisks = @(Get-PhysicalDisk -ErrorAction SilentlyContinue)
    $smartHealthy = $physicalDisks.Count -gt 0 -and @($physicalDisks | Where-Object HealthStatus -ne "Healthy").Count -eq 0

    $installPath = Join-Path $ProjectRoot "data\status\portal-service-install.json"
    $serviceInstallReady = $false
    if (Test-Path $installPath) {
        $install = Get-Content $installPath -Raw | ConvertFrom-Json
        $serviceInstallReady = $install.status -eq "ready"
    }
    if ($serviceInstallReady) {
        $expectedTasks = @(
            "EmBe Critical R2 Backup",
            "EmBe Restic Integrity Check",
            "EmBe Infrastructure Health Audit"
        )
        $installedTasks = @($expectedTasks | ForEach-Object {
            Get-ScheduledTask -TaskName $_ -ErrorAction SilentlyContinue
        })
        $serviceInstallReady = $installedTasks.Count -eq $expectedTasks.Count -and
            @($installedTasks | Where-Object {
                $_.Principal.UserId -notmatch 'EmBeBackupSvc$' -or
                [string]$_.Principal.LogonType -ne "Password" -or
                [string]$_.Principal.RunLevel -ne "Limited"
            }).Count -eq 0
    }

    $portalPublic = Test-HttpEndpoint $PortalUrl
    $nodeRed = Test-HttpEndpoint "http://127.0.0.1:1880/"
    $uptimeKuma = Test-UptimeKumaEndpoint

    $ollama = [pscustomobject]@{ reachable = $false; required_model_present = $false }
    try {
        $ollamaResponse = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 8
        $modelNames = @($ollamaResponse.models | ForEach-Object { [string]$_.name })
        $ollama = [pscustomobject]@{
            reachable = $true
            required_model_present = $modelNames -contains $RequiredOllamaModel
        }
    } catch {
        # Only availability is reported; response bodies and endpoint errors are intentionally omitted.
    }

    $mcpRuntimeReady = $false
    $mcpPython = Join-Path $ProjectRoot "services\mcp-readonly\.venv\Scripts\python.exe"
    $mcpSource = Join-Path $ProjectRoot "services\mcp-readonly\src"
    if ((Test-Path -LiteralPath $mcpPython -PathType Leaf) -and (Test-Path -LiteralPath $mcpSource -PathType Container)) {
        $mcpProbe = "import sys; sys.path.insert(0, sys.argv[1]); from embe_mcp.server import mcp; assert mcp is not None"
        $null = & $mcpPython -c $mcpProbe $mcpSource 2>$null
        $mcpRuntimeReady = $LASTEXITCODE -eq 0
    }

    $pdfReport = [pscustomobject]@{
        status = "missing"
        generated_at_utc = ""
        output_exists = $false
        checksum_matches = $false
    }
    $pdfStatusPath = Join-Path $ProjectRoot "data\status\monthly-report.json"
    if (Test-Path -LiteralPath $pdfStatusPath -PathType Leaf) {
        $status = Get-Content -LiteralPath $pdfStatusPath -Raw | ConvertFrom-Json
        $pdfPath = if ([string]$status.month -match '^\d{4}-(0[1-9]|1[0-2])$') {
            Join-Path $ProjectRoot ("output\pdf\embe-monthly-{0}.pdf" -f [string]$status.month)
        } else { "" }
        $outputExists = $pdfPath -and (Test-Path -LiteralPath $pdfPath -PathType Leaf)
        $checksumMatches = $false
        if ($outputExists -and [string]$status.pdf_sha256 -match '^[a-fA-F0-9]{64}$') {
            $checksumMatches = (Get-FileHash -LiteralPath $pdfPath -Algorithm SHA256).Hash -eq [string]$status.pdf_sha256
        }
        $pdfReport = [pscustomobject]@{
            status = [string]$status.status
            generated_at_utc = [string]$status.generated_at_utc
            output_exists = [bool]$outputExists
            checksum_matches = [bool]$checksumMatches
        }
    }
}

$diskStatus = if ($diskFreePercent -lt 15) { "critical" } elseif ($diskFreePercent -lt 25) { "warning" } else { "pass" }
Add-Check "disk_headroom" $diskStatus "Dung lượng trống của ổ hệ thống" @{ free_percent = [math]::Round($diskFreePercent, 2); warning_below = 25; critical_below = 15 }

$expectedContainers = @(
    "embe-babybuddy-1", "embe-memos-1", "embe-grocy-1", "embe-node-red-1", "embe-uptime-kuma-1",
    "compose-immich-server-1", "compose-immich-postgres-1", "compose-immich-redis-1", "compose-immich-machine-learning-1"
)
$containerFailures = @()
foreach ($name in $expectedContainers) {
    $item = @($containers | Where-Object { $_.name -eq $name }) | Select-Object -First 1
    if (-not $item -or -not ([string]$item.status).StartsWith("Up")) { $containerFailures += $name }
}
Add-Check "containers" $(if ($containerFailures.Count) { "critical" } else { "pass" }) "Các dịch vụ lõi đang chạy" @{ expected = $expectedContainers.Count; failed_count = $containerFailures.Count; failed_services = $containerFailures }
Add-Check "disk_health" $(if ($smartHealthy) { "pass" } else { "critical" }) "Tình trạng sức khỏe thiết bị lưu trữ" @{}

$portalHealthy = $null -ne $portalStatus -and $portalStatus.status -eq "ok" -and $portalStatus.last_success_at
$portalAge = if ($portalHealthy) { Get-AgeHours $portalStatus.last_success_at } else { [double]::PositiveInfinity }
Add-Check "portal_sync" $(if ($portalHealthy -and $portalAge -le 0.25) { "pass" } else { "critical" }) "Đồng bộ Portal gần nhất" @{ age_minutes = if ([double]::IsInfinity($portalAge)) { $null } else { [math]::Round($portalAge * 60, 1) }; maximum_minutes = 15 }

$bridgeHealthy = $null -ne $bridgeStatus -and $bridgeStatus.healthy -eq $true -and $bridgeStatus.time
$bridgeAge = if ($bridgeHealthy) { Get-AgeHours $bridgeStatus.time } else { [double]::PositiveInfinity }
Add-Check "babybuddy_sync" $(if ($bridgeHealthy -and $bridgeAge -le (5 / 60)) { "pass" } else { "critical" }) "Đồng bộ BabyBuddy gần nhất" @{ age_minutes = if ([double]::IsInfinity($bridgeAge)) { $null } else { [math]::Round($bridgeAge * 60, 1) }; maximum_minutes = 5 }

$backupAge = if ($backupCreated) { Get-AgeHours $backupCreated } else { [double]::PositiveInfinity }
Add-Check "backup_freshness" $(if ($backupAge -le $BackupMaxAgeHours) { "pass" } else { "critical" }) "Backup dữ liệu có cấu trúc gần nhất" @{ age_hours = if ([double]::IsInfinity($backupAge)) { $null } else { [math]::Round($backupAge, 2) }; maximum_hours = $BackupMaxAgeHours }

$restoreAge = if ($restoreVerified) { Get-AgeHours $restoreVerified } else { [double]::PositiveInfinity }
$restorePass = $restoreStatus -eq "pass" -and $restoreAge -le ($RestoreMaxAgeDays * 24)
Add-Check "restore_drill" $(if ($restorePass) { "pass" } else { "critical" }) "Lần phục hồi kiểm chứng gần nhất" @{ age_days = if ([double]::IsInfinity($restoreAge)) { $null } else { [math]::Round($restoreAge / 24, 2) }; maximum_days = $RestoreMaxAgeDays }

$integrityAge = if ($integrityChecked) { Get-AgeHours $integrityChecked } else { [double]::PositiveInfinity }
$integrityPass = $integrityStatus -eq "pass" -and $integrityAge -le (8 * 24)
Add-Check "restic_integrity" $(if ($integrityPass) { "pass" } else { "critical" }) "Kiểm tra toàn vẹn repository gần nhất" @{ age_days = if ([double]::IsInfinity($integrityAge)) { $null } else { [math]::Round($integrityAge / 24, 2) }; maximum_days = 8 }

Add-Check "sync_deadletters" $(if ($deadletters -eq 0) { "pass" } else { "critical" }) "Sự kiện đồng bộ cần xử lý" @{ count = $deadletters }
Add-Check "service_accounts" $(if ($serviceInstallReady) { "pass" } else { "critical" }) "Các tác vụ nền đã được cài và kiểm chứng" @{}

$portalPublicPass = [bool]$portalPublic.reachable -and [int]$portalPublic.status_code -ge 200 -and [int]$portalPublic.status_code -lt 400
Add-Check "portal_public" $(if ($portalPublicPass) { "pass" } else { "critical" }) "Cổng gia đình truy cập được từ Internet" @{ reachable = [bool]$portalPublic.reachable; status_code = [int]$portalPublic.status_code }

$nodeRedPass = [bool]$nodeRed.reachable -and [int]$nodeRed.status_code -ge 200 -and [int]$nodeRed.status_code -lt 400
Add-Check "node_red" $(if ($nodeRedPass) { "pass" } else { "critical" }) "Bộ điều phối tự động hóa nội bộ đang phản hồi" @{ reachable = [bool]$nodeRed.reachable; status_code = [int]$nodeRed.status_code }

$uptimeKumaPass = [bool]$uptimeKuma.reachable -and [bool]$uptimeKuma.ready -and [int]$uptimeKuma.status_code -ge 200 -and [int]$uptimeKuma.status_code -lt 400
Add-Check "uptime_kuma" $(if ($uptimeKumaPass) { "pass" } else { "critical" }) "Bảng giám sát nội bộ đang phản hồi" @{ reachable = [bool]$uptimeKuma.reachable; status_code = [int]$uptimeKuma.status_code; ready = [bool]$uptimeKuma.ready }

$ollamaPass = [bool]$ollama.reachable -and [bool]$ollama.required_model_present
Add-Check "ollama" $(if ($ollamaPass) { "pass" } else { "critical" }) "AI cục bộ và mô hình được duyệt đã sẵn sàng" @{ reachable = [bool]$ollama.reachable; required_model_present = [bool]$ollama.required_model_present }

Add-Check "mcp_runtime" $(if ($mcpRuntimeReady) { "pass" } else { "critical" }) "Lớp truy vấn AI chỉ đọc khởi tạo được" @{ runtime_ready = [bool]$mcpRuntimeReady }

$pdfAge = if ($pdfReport.generated_at_utc) { Get-AgeHours $pdfReport.generated_at_utc } else { [double]::PositiveInfinity }
$pdfPass = [string]$pdfReport.status -eq "ok" -and [bool]$pdfReport.output_exists -and [bool]$pdfReport.checksum_matches -and $pdfAge -le ($PdfMaxAgeDays * 24)
Add-Check "monthly_pdf" $(if ($pdfPass) { "pass" } else { "critical" }) "Sách gia đình tháng gần nhất đã tạo và còn nguyên vẹn" @{ age_days = if ([double]::IsInfinity($pdfAge)) { $null } else { [math]::Round($pdfAge / 24, 2) }; maximum_days = $PdfMaxAgeDays; output_exists = [bool]$pdfReport.output_exists; checksum_matches = [bool]$pdfReport.checksum_matches }

$overall = if (@($checks | Where-Object status -eq "critical").Count) { "critical" } elseif (@($checks | Where-Object status -eq "warning").Count) { "warning" } else { "pass" }
$report = [ordered]@{
    schema_version = 1
    generated_at = $now.ToString("o")
    status = $overall
    privacy = "No note, photo, token, URL query, or family content is included."
    checks = $checks
}

$outputDirectory = Split-Path $OutputPath -Parent
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$temporary = "$OutputPath.tmp"
[IO.File]::WriteAllText($temporary, ($report | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
Move-Item $temporary $OutputPath -Force
$report | ConvertTo-Json -Depth 8 -Compress
if ($overall -eq "critical") { exit 2 }
if ($overall -eq "warning") { exit 1 }
exit 0

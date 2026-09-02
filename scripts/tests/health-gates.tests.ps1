param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$scriptEngine = (Get-Process -Id $PID).Path
$healthSource = Get-Content -LiteralPath (Join-Path $projectRoot "scripts\health\health-audit.ps1") -Raw
if (-not $healthSource.Contains('PSObject.Properties["Response"]')) {
    throw "HTTP health errors must tolerate exceptions without a Response property"
}
foreach ($mcpContract in @("embe_mcp.health_probe", "family-analytics.sqlite3")) {
    if (-not $healthSource.Contains($mcpContract)) {
        throw "MCP health must execute a real read-only database probe: $mcpContract"
    }
}
foreach ($evidence in @('backup-service-install.json', 'portal-service-install.json')) {
    if (-not $healthSource.Contains($evidence)) {
        throw "Service-account health must use privileged installer evidence: $evidence"
    }
}
foreach ($taskName in @(
    'EmBe Critical R2 Backup',
    'EmBe Restic Integrity Check',
    'EmBe Infrastructure Health Audit',
    'EmBe Portal Timeline Sync',
    'EmBe Integration Credential Rotation',
    'EmBe BabyBuddy Memos Sync'
)) {
    if (-not $healthSource.Contains($taskName)) {
        throw "Service-account health must verify the live scheduled task: $taskName"
    }
}
if (-not $healthSource.Contains('System32\Tasks') -or -not $healthSource.Contains('UnauthorizedAccessException')) {
    throw "Service-account health must distinguish an ACL-hidden task from a deleted task"
}
if (-not $healthSource.Contains("'^\d{8}T\d{6}Z\.json$'")) {
    throw "Backup freshness must ignore status JSON files beside Restic manifests"
}
foreach ($immichAccountContract in @('compose-immich-postgres-1', 'NOT "isAdmin"', 'NOT "shouldChangePassword"', '"deletedAt" IS NULL')) {
    if (-not $healthSource.Contains($immichAccountContract)) {
        throw "Immich family-account health must have a secret-free database fallback: $immichAccountContract"
    }
}
if ($healthSource.Contains('SELECT email')) {
    throw "Immich family-account health must never read or expose account email addresses"
}
$testRoot = Join-Path $env:TEMP ("embe-health-gates-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory $testRoot | Out-Null

function Write-Fixture([string]$Path, [double]$DiskPercent, [double]$BackupAgeHours) {
    $now = [DateTimeOffset]::Parse("2026-08-30T12:00:00Z")
    $containers = @(
        "embe-babybuddy-1", "embe-memos-1", "embe-grocy-1", "embe-node-red-1", "embe-uptime-kuma-1",
        "embe-mqtt-1", "embe-home-assistant-1",
        "compose-immich-server-1", "compose-immich-postgres-1", "compose-immich-redis-1", "compose-immich-machine-learning-1"
    ) | ForEach-Object { @{ name = $_; status = "Up 1 hour (healthy)" } }
    $fixture = [ordered]@{
        now_utc = $now.ToString("o")
        disk_free_percent = $DiskPercent
        disk_maintenance = @{ status = "pass"; generated_at = $now.AddHours(-1).ToString("o") }
        disk_maintenance_task_ready = $true
        containers = $containers
        portal_sync = @{ status = "ok"; last_success_at = $now.AddMinutes(-5).ToString("o"); journal_inbox = @{ dead_letters = 0 } }
        media_publisher = @{ status = "disabled"; last_attempt_at = $now.AddMinutes(-5).ToString("o") }
        babybuddy_sync = @{ healthy = $true; time = $now.AddMinutes(-2).ToString("o") }
        analytics_ingest = @{ status = "skipped"; reason = "all_sources_disabled"; updated_at = $now.AddMinutes(-5).ToString("o") }
        inventory_worker = @{ status = "ok"; last_success_at = $now.AddMinutes(-2).ToString("o"); queue = @{ pending = 0; processing = 0; dead_letters = 0 } }
        inventory_task_ready = $true
        procurement_worker = @{ status = "ok"; last_success_at = $now.AddMinutes(-2).ToString("o"); queue = @{ pending = 0; processing = 0; dead_letters = 0 } }
        procurement_task_ready = $true
        assistant_worker = @{ status = "ok"; last_success_at = $now.AddMinutes(-2).ToString("o"); queue = @{ pending = 0; processing = 0; dead_letters = 0 } }
        assistant_task_ready = $true
        shell_leak_guard_task_ready = $true
        shell_leak_guard_last_result = 0
        backup_created_utc = $now.AddHours(-$BackupAgeHours).ToString("o")
        backup_last_status = "ok"
        restore = @{ status = "pass"; verified_at = $now.AddDays(-1).ToString("o") }
        integrity = @{ status = "pass"; checked_at = $now.AddDays(-1).ToString("o") }
        deadletters = 0
        smart_healthy = $true
        service_install_ready = $true
        service_tasks_ready = $true
        immich_family_account_ready = $true
        endpoints = @{
            portal_public = @{ reachable = $true; status_code = 200 }
            node_red = @{ reachable = $true; status_code = 200 }
            uptime_kuma = @{ reachable = $true; status_code = 200; ready = $true }
            ollama = @{ reachable = $true; required_model_present = $true }
            tailscale_private = @{ immich_status_code = 200; memos_status_code = 200; babybuddy_status_code = 200; grocy_status_code = 200 }
        }
        uptime_monitoring = @{ active = 7; healthy = 7; stale = 0 }
        mcp_runtime_ready = $true
        memos_mcp = @{ status = "pass"; tool_count = 20; contract_valid = $true }
        telegram_poc_disabled = $true
        telegram_secondary = @{
            status = "pass"
            generated_at = $now.AddMinutes(-5).ToString("o")
            archive = @{ status = "ok"; seen = 0; archived = 0; reused = 0; rejected = 0 }
            worker = @{ status = "ok"; provider_ready = $true; shard_count = 2; account_tier = "standard"; completed = 0; retried = 0; failed = 0 }
        }
        telegram_live_smoke = @{
            status = "pass"
            generated_at = $now.AddDays(-1).ToString("o")
            provider_ready = $true
            shard_count = 2
            checksum_matches = $true
            range_matches = $true
            stat_matches = $true
            deleted = $true
        }
        pdf_report = @{
            status = "ok"
            generated_at_utc = $now.AddDays(-1).ToString("o")
            output_exists = $true
            checksum_matches = $true
            source_mode = "curated_memos"
            source_event_count = 0
        }
    }
    $fixture | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $Path -Encoding utf8
}

try {
    $healthyFixture = Join-Path $testRoot "healthy.json"
    $criticalFixture = Join-Path $testRoot "critical.json"
    Write-Fixture $healthyFixture 40 2
    Write-Fixture $criticalFixture 10 12

    $healthyReport = Join-Path $testRoot "healthy-report.json"
    $healthyOutput = & $scriptEngine -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot "scripts\health\health-audit.ps1") -ProjectRoot $projectRoot -FixturePath $healthyFixture -OutputPath $healthyReport 2>&1
    if ($LASTEXITCODE -ne 0) {
        $failedReport = if (Test-Path -LiteralPath $healthyReport) { Get-Content -LiteralPath $healthyReport -Raw } else { $healthyOutput | Out-String }
        throw "Healthy fixture must pass: $failedReport"
    }
    $healthy = Get-Content $healthyReport -Raw | ConvertFrom-Json
    if ($healthy.status -ne "pass") { throw "Healthy report is invalid" }
    $containerCheck = @($healthy.checks | Where-Object id -eq "containers")[0]
    if ($containerCheck.evidence.expected -ne 11) { throw "Health audit must cover the two IoT containers" }
    foreach ($id in @("disk_maintenance", "media_publisher", "analytics_ingest", "inventory_worker", "procurement_worker", "local_assistant", "shell_leak_guard", "immich_family_account", "portal_public", "node_red", "uptime_kuma", "uptime_monitors", "ollama", "tailscale_private", "mcp_runtime", "memos_mcp", "telegram_poc_disabled", "telegram_secondary", "telegram_live_smoke", "monthly_pdf")) {
        $check = @($healthy.checks | Where-Object id -eq $id)
        if ($check.Count -ne 1 -or $check[0].status -ne "pass") { throw "Healthy report is missing passing check: $id" }
    }
    $monthlyCheck = @($healthy.checks | Where-Object id -eq "monthly_pdf")[0]
    if ([double]$monthlyCheck.evidence.age_days -ne 1.0) { throw "UTC monthly report age must not drift by the local timezone offset" }
    $serialized = Get-Content $healthyReport -Raw
    foreach ($sensitiveKey in @("token", "password", "family_content", "response_body")) {
        if ($serialized -match ('"' + [regex]::Escape($sensitiveKey) + '"\s*:')) { throw "Health report exposes forbidden field: $sensitiveKey" }
    }

    $pwshReport = Join-Path $testRoot "healthy-report-pwsh.json"
    $null = & $scriptEngine -NoProfile -File (Join-Path $projectRoot "scripts\health\health-audit.ps1") -ProjectRoot $projectRoot -FixturePath $healthyFixture -OutputPath $pwshReport
    if ($LASTEXITCODE -ne 0) { throw "Healthy fixture must pass under PowerShell 7" }

    $criticalReport = Join-Path $testRoot "critical-report.json"
    $null = & $scriptEngine -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot "scripts\health\health-audit.ps1") -ProjectRoot $projectRoot -FixturePath $criticalFixture -OutputPath $criticalReport
    if ($LASTEXITCODE -ne 2) { throw "Critical fixture must block" }
    $critical = Get-Content $criticalReport -Raw | ConvertFrom-Json
    if ($critical.status -ne "critical") { throw "Critical report is invalid" }
    if (@($critical.checks | Where-Object id -eq "disk_headroom")[0].status -ne "critical") { throw "Disk gate did not block" }
    if (@($critical.checks | Where-Object id -eq "backup_freshness")[0].status -ne "critical") { throw "Backup gate did not block" }

    $failedBackupFixture = Join-Path $testRoot "failed-backup.json"
    Write-Fixture $failedBackupFixture 40 2
    $failedBackup = Get-Content $failedBackupFixture -Raw | ConvertFrom-Json
    $failedBackup.backup_last_status = "failed"
    $failedBackup | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $failedBackupFixture -Encoding utf8
    $failedBackupReport = Join-Path $testRoot "failed-backup-report.json"
    $null = & $scriptEngine -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot "scripts\health\health-audit.ps1") -ProjectRoot $projectRoot -FixturePath $failedBackupFixture -OutputPath $failedBackupReport
    if ($LASTEXITCODE -ne 2) { throw "A failed latest backup run must block health" }
    $failedBackupHealth = Get-Content $failedBackupReport -Raw | ConvertFrom-Json
    if (@($failedBackupHealth.checks | Where-Object id -eq "backup_freshness")[0].status -ne "critical") { throw "Failed backup status did not block" }

    $missingDiskTaskFixture = Join-Path $testRoot "missing-disk-task.json"
    Write-Fixture $missingDiskTaskFixture 40 2
    $missingDiskTask = Get-Content $missingDiskTaskFixture -Raw | ConvertFrom-Json
    $missingDiskTask.disk_maintenance_task_ready = $false
    $missingDiskTask | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $missingDiskTaskFixture -Encoding utf8
    $missingDiskTaskReport = Join-Path $testRoot "missing-disk-task-report.json"
    $null = & $scriptEngine -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot "scripts\health\health-audit.ps1") -ProjectRoot $projectRoot -FixturePath $missingDiskTaskFixture -OutputPath $missingDiskTaskReport
    if ($LASTEXITCODE -ne 2) { throw "A missing disk maintenance task must block health" }
    $missingDiskTaskHealth = Get-Content $missingDiskTaskReport -Raw | ConvertFrom-Json
    if (@($missingDiskTaskHealth.checks | Where-Object id -eq "disk_maintenance")[0].status -ne "critical") { throw "Disk maintenance gate did not block" }

    $downMonitorFixture = Join-Path $testRoot "down-monitor.json"
    Write-Fixture $downMonitorFixture 40 2
    $downMonitor = Get-Content $downMonitorFixture -Raw | ConvertFrom-Json
    $downMonitor.uptime_monitoring.healthy = 6
    $downMonitor | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $downMonitorFixture -Encoding utf8
    $downMonitorReport = Join-Path $testRoot "down-monitor-report.json"
    $null = & $scriptEngine -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot "scripts\health\health-audit.ps1") -ProjectRoot $projectRoot -FixturePath $downMonitorFixture -OutputPath $downMonitorReport
    if ($LASTEXITCODE -ne 2) { throw "A failed Uptime Kuma monitor must block health" }

    $staleAnalyticsFixture = Join-Path $testRoot "stale-analytics.json"
    Write-Fixture $staleAnalyticsFixture 40 2
    $staleAnalytics = Get-Content $staleAnalyticsFixture -Raw | ConvertFrom-Json
    $staleAnalytics.analytics_ingest.updated_at = ([DateTimeOffset]::Parse("2026-08-30T12:00:00Z")).AddMinutes(-31).ToString("o")
    $staleAnalytics | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $staleAnalyticsFixture -Encoding utf8
    $staleAnalyticsReport = Join-Path $testRoot "stale-analytics-report.json"
    $null = & $scriptEngine -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot "scripts\health\health-audit.ps1") -ProjectRoot $projectRoot -FixturePath $staleAnalyticsFixture -OutputPath $staleAnalyticsReport
    if ($LASTEXITCODE -ne 2) { throw "A stale analytics job must block health" }
    $staleAnalyticsHealth = Get-Content $staleAnalyticsReport -Raw | ConvertFrom-Json
    if (@($staleAnalyticsHealth.checks | Where-Object id -eq "analytics_ingest")[0].status -ne "critical") { throw "Stale analytics gate did not block" }

    $staleInventoryFixture = Join-Path $testRoot "stale-inventory.json"
    Write-Fixture $staleInventoryFixture 40 2
    $staleInventory = Get-Content $staleInventoryFixture -Raw | ConvertFrom-Json
    $staleInventory.inventory_worker.last_success_at = ([DateTimeOffset]::Parse("2026-08-30T12:00:00Z")).AddMinutes(-11).ToString("o")
    $staleInventory | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $staleInventoryFixture -Encoding utf8
    $staleInventoryReport = Join-Path $testRoot "stale-inventory-report.json"
    $null = & $scriptEngine -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot "scripts\health\health-audit.ps1") -ProjectRoot $projectRoot -FixturePath $staleInventoryFixture -OutputPath $staleInventoryReport
    if ($LASTEXITCODE -ne 2) { throw "A stale inventory worker must block health" }

    $staleAssistantFixture = Join-Path $testRoot "stale-assistant.json"
    Write-Fixture $staleAssistantFixture 40 2
    $staleAssistant = Get-Content $staleAssistantFixture -Raw | ConvertFrom-Json
    $staleAssistant.assistant_worker.last_success_at = ([DateTimeOffset]::Parse("2026-08-30T12:00:00Z")).AddMinutes(-11).ToString("o")
    $staleAssistant | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $staleAssistantFixture -Encoding utf8
    $staleAssistantReport = Join-Path $testRoot "stale-assistant-report.json"
    $null = & $scriptEngine -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot "scripts\health\health-audit.ps1") -ProjectRoot $projectRoot -FixturePath $staleAssistantFixture -OutputPath $staleAssistantReport
    if ($LASTEXITCODE -ne 2) { throw "A stale local assistant worker must block health" }

    $telegramFixture = Join-Path $testRoot "telegram-poc-enabled.json"
    Write-Fixture $telegramFixture 40 2
    $telegramEnabled = Get-Content $telegramFixture -Raw | ConvertFrom-Json
    $telegramEnabled.telegram_poc_disabled = $false
    $telegramEnabled | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $telegramFixture -Encoding utf8
    $telegramReport = Join-Path $testRoot "telegram-poc-enabled-report.json"
    $null = & $scriptEngine -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot "scripts\health\health-audit.ps1") -ProjectRoot $projectRoot -FixturePath $telegramFixture -OutputPath $telegramReport
    if ($LASTEXITCODE -ne 2) { throw "An enabled Telegram storage PoC must block production health" }
    $telegramHealth = Get-Content $telegramReport -Raw | ConvertFrom-Json
    if (@($telegramHealth.checks | Where-Object id -eq "telegram_poc_disabled")[0].status -ne "critical") { throw "Telegram PoC safety gate did not block" }
    $telegramDirectCheck = @($healthy.checks | Where-Object id -eq "telegram_poc_disabled")[0]
    if ($telegramDirectCheck.summary -ne "Kết nối Telegram trực tiếp từ Linux bị khóa đúng thiết kế") { throw "Telegram direct-provider health label is misleading" }
    if (-not [bool]$telegramDirectCheck.evidence.direct_provider_disabled) { throw "Telegram direct-provider evidence is missing" }

    $telegramSessionFixture = Join-Path $testRoot "telegram-session-unavailable.json"
    Write-Fixture $telegramSessionFixture 40 2
    $telegramSession = Get-Content $telegramSessionFixture -Raw | ConvertFrom-Json
    $telegramSession.telegram_secondary.worker.provider_ready = $false
    $telegramSession | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $telegramSessionFixture -Encoding utf8
    $telegramSessionReport = Join-Path $testRoot "telegram-session-unavailable-report.json"
    $null = & $scriptEngine -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot "scripts\health\health-audit.ps1") -ProjectRoot $projectRoot -FixturePath $telegramSessionFixture -OutputPath $telegramSessionReport
    if ($LASTEXITCODE -ne 2) { throw "An unavailable Telegram session must block health" }
    $telegramSessionHealth = Get-Content $telegramSessionReport -Raw | ConvertFrom-Json
    if (@($telegramSessionHealth.checks | Where-Object id -eq "telegram_secondary")[0].status -ne "critical") { throw "Telegram session health did not block" }

    $telegramWorkerNullFixture = Join-Path $testRoot "telegram-worker-null.json"
    Write-Fixture $telegramWorkerNullFixture 40 2
    $telegramWorkerNull = Get-Content $telegramWorkerNullFixture -Raw | ConvertFrom-Json
    $telegramWorkerNull.telegram_secondary.status = "critical"
    $telegramWorkerNull.telegram_secondary.archive = @{ status = "error"; error_type = "FileExistsError" }
    $telegramWorkerNull.telegram_secondary.worker = $null
    $telegramWorkerNull | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $telegramWorkerNullFixture -Encoding utf8
    $telegramWorkerNullReport = Join-Path $testRoot "telegram-worker-null-report.json"
    $null = & $scriptEngine -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot "scripts\health\health-audit.ps1") -ProjectRoot $projectRoot -FixturePath $telegramWorkerNullFixture -OutputPath $telegramWorkerNullReport
    if ($LASTEXITCODE -ne 2) { throw "A missing Telegram worker must produce a critical report without crashing" }
    if (-not (Test-Path -LiteralPath $telegramWorkerNullReport)) { throw "A missing Telegram worker must still produce a health report" }

    $telegramSmokeFixture = Join-Path $testRoot "telegram-smoke-stale.json"
    Write-Fixture $telegramSmokeFixture 40 2
    $telegramSmoke = Get-Content $telegramSmokeFixture -Raw | ConvertFrom-Json
    $telegramSmoke.telegram_live_smoke.generated_at = ([DateTimeOffset]::Parse("2026-08-30T12:00:00Z")).AddDays(-36).ToString("o")
    $telegramSmoke | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $telegramSmokeFixture -Encoding utf8
    $telegramSmokeReport = Join-Path $testRoot "telegram-smoke-stale-report.json"
    $null = & $scriptEngine -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot "scripts\health\health-audit.ps1") -ProjectRoot $projectRoot -FixturePath $telegramSmokeFixture -OutputPath $telegramSmokeReport
    if ($LASTEXITCODE -ne 2) { throw "A stale Telegram live smoke must block health" }
    $telegramSmokeHealth = Get-Content $telegramSmokeReport -Raw | ConvertFrom-Json
    if (@($telegramSmokeHealth.checks | Where-Object id -eq "telegram_live_smoke")[0].status -ne "critical") { throw "Telegram live smoke health did not block" }

    $missingServiceTaskFixture = Join-Path $testRoot "missing-service-task.json"
    Write-Fixture $missingServiceTaskFixture 40 2
    $missingServiceTask = Get-Content $missingServiceTaskFixture -Raw | ConvertFrom-Json
    $missingServiceTask.service_tasks_ready = $false
    $missingServiceTask | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $missingServiceTaskFixture -Encoding utf8
    $missingServiceTaskReport = Join-Path $testRoot "missing-service-task-report.json"
    $null = & $scriptEngine -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot "scripts\health\health-audit.ps1") -ProjectRoot $projectRoot -FixturePath $missingServiceTaskFixture -OutputPath $missingServiceTaskReport
    if ($LASTEXITCODE -ne 2) { throw "A missing service task must block health" }
    $missingServiceTaskHealth = Get-Content $missingServiceTaskReport -Raw | ConvertFrom-Json
    if (@($missingServiceTaskHealth.checks | Where-Object id -eq "service_accounts")[0].status -ne "critical") { throw "Missing service task gate did not block" }

    $missingFamilyAccountFixture = Join-Path $testRoot "missing-family-account.json"
    Write-Fixture $missingFamilyAccountFixture 40 2
    $missingFamilyAccount = Get-Content $missingFamilyAccountFixture -Raw | ConvertFrom-Json
    $missingFamilyAccount.immich_family_account_ready = $false
    $missingFamilyAccount | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $missingFamilyAccountFixture -Encoding utf8
    $missingFamilyAccountReport = Join-Path $testRoot "missing-family-account-report.json"
    $null = & $scriptEngine -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot "scripts\health\health-audit.ps1") -ProjectRoot $projectRoot -FixturePath $missingFamilyAccountFixture -OutputPath $missingFamilyAccountReport
    if ($LASTEXITCODE -ne 2) { throw "A missing Immich family account must block health" }
    $missingFamilyAccountHealth = Get-Content $missingFamilyAccountReport -Raw | ConvertFrom-Json
    if (@($missingFamilyAccountHealth.checks | Where-Object id -eq "immich_family_account")[0].status -ne "critical") { throw "Immich family account gate did not block" }

    $journalFixture = Join-Path $testRoot "journal-deadletter.json"
    Write-Fixture $journalFixture 40 2
    $journalBlocked = Get-Content $journalFixture -Raw | ConvertFrom-Json
    $journalBlocked.portal_sync.journal_inbox.dead_letters = 1
    $journalBlocked | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $journalFixture -Encoding utf8
    $journalReport = Join-Path $testRoot "journal-deadletter-report.json"
    $null = & $scriptEngine -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot "scripts\health\health-audit.ps1") -ProjectRoot $projectRoot -FixturePath $journalFixture -OutputPath $journalReport
    if ($LASTEXITCODE -ne 2) { throw "A stuck portal journal must block health" }

    $mediaFixture = Join-Path $testRoot "media-publisher-error.json"
    Write-Fixture $mediaFixture 40 2
    $mediaBlocked = Get-Content $mediaFixture -Raw | ConvertFrom-Json
    $mediaBlocked.media_publisher.status = "error"
    $mediaBlocked | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $mediaFixture -Encoding utf8
    $mediaReport = Join-Path $testRoot "media-publisher-error-report.json"
    $null = & $scriptEngine -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot "scripts\health\health-audit.ps1") -ProjectRoot $projectRoot -FixturePath $mediaFixture -OutputPath $mediaReport
    if ($LASTEXITCODE -ne 2) { throw "A failed media publisher must block health" }
    $mediaHealth = Get-Content $mediaReport -Raw | ConvertFrom-Json
    if (@($mediaHealth.checks | Where-Object id -eq "media_publisher")[0].status -ne "critical") { throw "Media publisher gate did not block" }

    $enabledMediaFixture = Join-Path $testRoot "media-publisher-enabled.json"
    Write-Fixture $enabledMediaFixture 40 2
    $enabledMedia = Get-Content $enabledMediaFixture -Raw | ConvertFrom-Json
    $enabledMedia.media_publisher.status = "ok"
    $enabledMedia | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $enabledMediaFixture -Encoding utf8
    $enabledMediaReport = Join-Path $testRoot "media-publisher-enabled-report.json"
    $null = & $scriptEngine -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot "scripts\health\health-audit.ps1") -ProjectRoot $projectRoot -FixturePath $enabledMediaFixture -OutputPath $enabledMediaReport
    if ($LASTEXITCODE -ne 0) { throw "A fresh enabled media publisher must pass health" }

    $enabledMedia.media_publisher.last_attempt_at = ([DateTimeOffset]::Parse("2026-08-30T12:00:00Z")).AddMinutes(-30).ToString("o")
    $enabledMedia | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $enabledMediaFixture -Encoding utf8
    $null = & $scriptEngine -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot "scripts\health\health-audit.ps1") -ProjectRoot $projectRoot -FixturePath $enabledMediaFixture -OutputPath $enabledMediaReport
    if ($LASTEXITCODE -ne 2) { throw "A stale enabled media publisher must block health" }

    $dependencyFixture = Join-Path $testRoot "dependency-critical.json"
    Write-Fixture $dependencyFixture 40 2
    $dependency = Get-Content $dependencyFixture -Raw | ConvertFrom-Json
    $dependency.endpoints.portal_public.reachable = $false
    $dependency.endpoints.portal_public.status_code = 503
    $dependency.endpoints.uptime_kuma.ready = $false
    $dependency.endpoints.ollama.required_model_present = $false
    $dependency.endpoints.tailscale_private.memos_status_code = 503
    $dependency.mcp_runtime_ready = $false
    $dependency.memos_mcp.contract_valid = $false
    $dependency.pdf_report.checksum_matches = $false
    $dependency | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $dependencyFixture -Encoding utf8
    $dependencyReport = Join-Path $testRoot "dependency-report.json"
    $null = & $scriptEngine -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot "scripts\health\health-audit.ps1") -ProjectRoot $projectRoot -FixturePath $dependencyFixture -OutputPath $dependencyReport
    if ($LASTEXITCODE -ne 2) { throw "Unavailable dependencies must block" }
    $dependencyHealth = Get-Content $dependencyReport -Raw | ConvertFrom-Json
    foreach ($id in @("portal_public", "uptime_kuma", "ollama", "tailscale_private", "mcp_runtime", "memos_mcp", "monthly_pdf")) {
        if (@($dependencyHealth.checks | Where-Object id -eq $id)[0].status -ne "critical") { throw "Dependency gate did not block: $id" }
    }

    $samplePdfFixture = Join-Path $testRoot "sample-pdf.json"
    Write-Fixture $samplePdfFixture 40 2
    $samplePdf = Get-Content $samplePdfFixture -Raw | ConvertFrom-Json
    $samplePdf.pdf_report.source_mode = "provided_snapshot"
    $samplePdf | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $samplePdfFixture -Encoding utf8
    $samplePdfReport = Join-Path $testRoot "sample-pdf-report.json"
    $null = & $scriptEngine -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot "scripts\health\health-audit.ps1") -ProjectRoot $projectRoot -FixturePath $samplePdfFixture -OutputPath $samplePdfReport
    if ($LASTEXITCODE -ne 2) { throw "A layout fixture must not satisfy production monthly PDF health" }

    $null = & $scriptEngine -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot "scripts\update\preflight-update.ps1") -ProjectRoot $projectRoot -HealthFixture $healthyFixture -HealthOutputPath (Join-Path $testRoot "preflight-health-pass.json") -OutputPath (Join-Path $testRoot "preflight-pass.json") -SkipContractTests
    if ($LASTEXITCODE -ne 0) { throw "Healthy update preflight must pass" }

    $null = & $scriptEngine -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot "scripts\update\preflight-update.ps1") -ProjectRoot $projectRoot -HealthFixture $criticalFixture -HealthOutputPath (Join-Path $testRoot "preflight-health-blocked.json") -OutputPath (Join-Path $testRoot "preflight-blocked.json") -SkipContractTests
    if ($LASTEXITCODE -ne 2) { throw "Critical update preflight must block" }

    $drills = Join-Path $testRoot "failure-drills.json"
    @{
        host_restart = @{ status = "pass" }
        network_interruption = @{ status = "pass" }
        token_rotation = @{ status = "pass" }
        backup_restore = @{ status = "pass" }
        cloudflare_lan_fallback = @{ status = "pass" }
    } | ConvertTo-Json -Depth 4 | Set-Content $drills
    $goLivePass = Join-Path $testRoot "go-live-pass.json"
    $null = & $scriptEngine -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot "scripts\health\go-live-gate.ps1") -ProjectRoot $projectRoot -HealthReport $healthyReport -DrillEvidence $drills -OutputPath $goLivePass
    if ($LASTEXITCODE -ne 0) { throw "Complete go-live evidence must pass" }
    $goLive = Get-Content $goLivePass -Raw | ConvertFrom-Json
    if (@($goLive.gates | Where-Object id -eq "encrypted_offsite_backup")[0].status -ne "pass") { throw "Encrypted offsite backup must satisfy the backup gate" }
    if (@($goLive.gates | Where-Object id -eq "third_copy_separate_device").Count -ne 0) { throw "A physical USB or NAS must not remain a go-live gate" }

    if (@($goLive.gates | Where-Object id -eq "operational_drills")[0].status -ne "pass") { throw "Operational drills must satisfy the go-live gate" }

    $null = & $scriptEngine -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot "scripts\health\go-live-gate.ps1") -ProjectRoot $projectRoot -HealthReport $healthyReport -DrillEvidence (Join-Path $testRoot "missing-drills.json") -OutputPath (Join-Path $testRoot "go-live-blocked.json")
    if ($LASTEXITCODE -ne 2) { throw "Missing operational drill evidence must block" }

    $badBackupReport = Join-Path $testRoot "bad-backup-health.json"
    $badBackup = Get-Content $healthyReport -Raw | ConvertFrom-Json
    @($badBackup.checks | Where-Object id -eq "restic_integrity")[0].status = "critical"
    $badBackup | ConvertTo-Json -Depth 8 | Set-Content $badBackupReport
    $null = & $scriptEngine -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot "scripts\health\go-live-gate.ps1") -ProjectRoot $projectRoot -HealthReport $badBackupReport -DrillEvidence $drills -OutputPath (Join-Path $testRoot "go-live-backup-blocked.json")
    if ($LASTEXITCODE -ne 2) { throw "A failed encrypted offsite backup check must block" }

    Write-Output "PASS: health, update, and go-live gates fail closed"
} finally {
    if (Test-Path $testRoot) { Remove-Item $testRoot -Recurse -Force }
}
exit 0

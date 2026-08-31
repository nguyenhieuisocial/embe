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
        containers = $containers
        portal_sync = @{ status = "ok"; last_success_at = $now.AddMinutes(-5).ToString("o"); journal_inbox = @{ dead_letters = 0 } }
        media_publisher = @{ status = "disabled"; last_attempt_at = $now.AddMinutes(-5).ToString("o") }
        babybuddy_sync = @{ healthy = $true; time = $now.AddMinutes(-2).ToString("o") }
        analytics_ingest = @{ status = "skipped"; reason = "all_sources_disabled"; updated_at = $now.AddMinutes(-5).ToString("o") }
        backup_created_utc = $now.AddHours(-$BackupAgeHours).ToString("o")
        restore = @{ status = "pass"; verified_at = $now.AddDays(-1).ToString("o") }
        integrity = @{ status = "pass"; checked_at = $now.AddDays(-1).ToString("o") }
        deadletters = 0
        smart_healthy = $true
        service_install_ready = $true
        service_tasks_ready = $true
        endpoints = @{
            portal_public = @{ reachable = $true; status_code = 200 }
            node_red = @{ reachable = $true; status_code = 200 }
            uptime_kuma = @{ reachable = $true; status_code = 200; ready = $true }
            ollama = @{ reachable = $true; required_model_present = $true }
            tailscale_private = @{ immich_status_code = 200; memos_status_code = 200; babybuddy_status_code = 200 }
        }
        uptime_monitoring = @{ active = 7; healthy = 7; stale = 0 }
        mcp_runtime_ready = $true
        telegram_poc_disabled = $true
        telegram_secondary = @{ status = "pass"; generated_at = $now.AddMinutes(-5).ToString("o") }
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
    $null = & $scriptEngine -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot "scripts\health\health-audit.ps1") -ProjectRoot $projectRoot -FixturePath $healthyFixture -OutputPath $healthyReport
    if ($LASTEXITCODE -ne 0) { throw "Healthy fixture must pass" }
    $healthy = Get-Content $healthyReport -Raw | ConvertFrom-Json
    if ($healthy.status -ne "pass") { throw "Healthy report is invalid" }
    $containerCheck = @($healthy.checks | Where-Object id -eq "containers")[0]
    if ($containerCheck.evidence.expected -ne 11) { throw "Health audit must cover the two IoT containers" }
    foreach ($id in @("media_publisher", "analytics_ingest", "portal_public", "node_red", "uptime_kuma", "uptime_monitors", "ollama", "tailscale_private", "mcp_runtime", "telegram_poc_disabled", "telegram_secondary", "monthly_pdf")) {
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
    $dependency.pdf_report.checksum_matches = $false
    $dependency | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $dependencyFixture -Encoding utf8
    $dependencyReport = Join-Path $testRoot "dependency-report.json"
    $null = & $scriptEngine -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot "scripts\health\health-audit.ps1") -ProjectRoot $projectRoot -FixturePath $dependencyFixture -OutputPath $dependencyReport
    if ($LASTEXITCODE -ne 2) { throw "Unavailable dependencies must block" }
    $dependencyHealth = Get-Content $dependencyReport -Raw | ConvertFrom-Json
    foreach ($id in @("portal_public", "uptime_kuma", "ollama", "tailscale_private", "mcp_runtime", "monthly_pdf")) {
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

    $soak = Join-Path $testRoot "soak.json"
    @{ status = "pass"; duration_days = 7 } | ConvertTo-Json | Set-Content $soak
    $goLivePass = Join-Path $testRoot "go-live-pass.json"
    $null = & $scriptEngine -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot "scripts\health\go-live-gate.ps1") -ProjectRoot $projectRoot -HealthReport $healthyReport -SoakEvidence $soak -OutputPath $goLivePass
    if ($LASTEXITCODE -ne 0) { throw "Complete go-live evidence must pass" }
    $goLive = Get-Content $goLivePass -Raw | ConvertFrom-Json
    if (@($goLive.gates | Where-Object id -eq "encrypted_offsite_backup")[0].status -ne "pass") { throw "Encrypted offsite backup must satisfy the backup gate" }
    if (@($goLive.gates | Where-Object id -eq "third_copy_separate_device").Count -ne 0) { throw "A physical USB or NAS must not remain a go-live gate" }

    $null = & $scriptEngine -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot "scripts\health\go-live-gate.ps1") -ProjectRoot $projectRoot -HealthReport $healthyReport -OutputPath (Join-Path $testRoot "go-live-blocked.json")
    if ($LASTEXITCODE -ne 2) { throw "Missing soak evidence must block" }

    $badBackupReport = Join-Path $testRoot "bad-backup-health.json"
    $badBackup = Get-Content $healthyReport -Raw | ConvertFrom-Json
    @($badBackup.checks | Where-Object id -eq "restic_integrity")[0].status = "critical"
    $badBackup | ConvertTo-Json -Depth 8 | Set-Content $badBackupReport
    $null = & $scriptEngine -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot "scripts\health\go-live-gate.ps1") -ProjectRoot $projectRoot -HealthReport $badBackupReport -SoakEvidence $soak -OutputPath (Join-Path $testRoot "go-live-backup-blocked.json")
    if ($LASTEXITCODE -ne 2) { throw "A failed encrypted offsite backup check must block" }

    $drills = Join-Path $testRoot "failure-drills.json"
    @{
        host_restart = @{ status = "pass" }
        network_interruption = @{ status = "pass" }
        token_rotation = @{ status = "pass" }
        backup_restore = @{ status = "pass" }
        cloudflare_lan_fallback = @{ status = "pass" }
    } | ConvertTo-Json -Depth 4 | Set-Content $drills
    $soakState = Join-Path $testRoot "soak-state.json"
    $recorder = Join-Path $projectRoot "scripts\health\record-soak.ps1"
    $null = & $scriptEngine -NoProfile -ExecutionPolicy Bypass -File $recorder -HealthReport $healthyReport -DrillEvidence $drills -OutputPath $soakState -NowUtc "2026-08-30T12:00:00Z"
    if ($LASTEXITCODE -ne 0) { throw "The first healthy soak sample must be recorded" }
    $collecting = Get-Content $soakState -Raw | ConvertFrom-Json
    if ($collecting.status -ne "collecting" -or $collecting.duration_days -ne 0) { throw "Soak must start in collecting state" }

    $null = & $scriptEngine -NoProfile -ExecutionPolicy Bypass -File $recorder -HealthReport $healthyReport -DrillEvidence $drills -OutputPath $soakState -NowUtc "2026-09-06T12:00:00Z"
    if ($LASTEXITCODE -ne 0) { throw "Seven healthy days must produce soak evidence" }
    $completedSoak = Get-Content $soakState -Raw | ConvertFrom-Json
    if ($completedSoak.status -ne "pass" -or $completedSoak.duration_days -lt 7) { throw "Seven-day soak did not pass" }

    $null = & $scriptEngine -NoProfile -ExecutionPolicy Bypass -File $recorder -HealthReport $criticalReport -DrillEvidence $drills -OutputPath $soakState -NowUtc "2026-09-06T12:05:00Z"
    if ($LASTEXITCODE -ne 0) { throw "A failed sample must be recorded without hiding the failure" }
    $resetSoak = Get-Content $soakState -Raw | ConvertFrom-Json
    if ($resetSoak.status -ne "collecting" -or $resetSoak.started_at) { throw "A failed health sample must reset consecutive soak time" }

    Write-Output "PASS: health, update, and go-live gates fail closed"
} finally {
    if (Test-Path $testRoot) { Remove-Item $testRoot -Recurse -Force }
}

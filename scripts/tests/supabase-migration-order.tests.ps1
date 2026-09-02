param()

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$bootstrap = Join-Path $root "supabase\migrations\20260901094833_bootstrap_maternal_health_dependencies.sql"
$care = Join-Path $root "supabase\migrations\20260901143000_add_private_pregnancy_care.sql"
$deferredCare = Join-Path $root "supabase\migrations\20260901144500_add_care_reminder_times.sql"
$deferredLifecycle = Join-Path $root "supabase\migrations\20260901195000_add_baby_sex_for_growth.sql"

if (-not (Test-Path -LiteralPath $bootstrap -PathType Leaf)) { throw "Missing clean-replay bootstrap migration" }
$bootstrapSql = Get-Content -LiteralPath $bootstrap -Raw
$careSql = Get-Content -LiteralPath $care -Raw

foreach ($table in @("pregnancy_wellness_profile", "iphone_health_device", "iphone_health_daily")) {
    if ($bootstrapSql -notmatch "CREATE TABLE IF NOT EXISTS portal_read_model\.$table") {
        throw "Bootstrap does not create $table before it is extended"
    }
    if ($careSql -notmatch "CREATE TABLE IF NOT EXISTS portal_read_model\.$table") {
        throw "Later migration is not replay-safe for $table"
    }
}

$deferredCareSql = Get-Content -LiteralPath $deferredCare -Raw
if ($deferredCareSql -notmatch "ADD COLUMN IF NOT EXISTS reminder_times") {
    throw "Care reminder migration is not deferred and replay-safe"
}
if ($deferredCareSql -notmatch "CREATE OR REPLACE FUNCTION public\.embe_save_pregnancy_care_plan") {
    throw "Care reminder function cannot be safely reapplied to an existing remote database"
}
if ($deferredCareSql -notmatch "SELECT reminder_day\.day AS reminder_day") {
    throw "Care reminder push query does not expose the reminder_day column it reads"
}
$deferredLifecycleSql = Get-Content -LiteralPath $deferredLifecycle -Raw
if ($deferredLifecycleSql -notmatch "ADD COLUMN IF NOT EXISTS baby_sex") {
    throw "Baby sex migration is not deferred and replay-safe"
}
if ($deferredLifecycleSql -notmatch "CREATE OR REPLACE FUNCTION public\.embe_save_family_lifecycle") {
    throw "Family lifecycle function cannot be safely reapplied to an existing remote database"
}

Write-Output "PASS: Supabase maternal-health migrations are clean-replay compatible"

$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$taskMigration = Join-Path $taskRoot 'supabase/migrations/20260909064255_allow_self_reported_medication_intake.sql'
$taskContainer = $null
# Isolated synthetic database: no network, host ports, mounts or family data.
try {
  $taskContainer = (docker run --detach --rm --network none --memory 256m --cpus 1 --tmpfs /var/lib/postgresql/data -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine).Trim()
  if ($LASTEXITCODE -ne 0 -or $taskContainer -notmatch '^[a-f0-9]{64}$') { throw 'Could not create isolated test database' }
  $taskReady = $false
  for ($taskAttempt=0; $taskAttempt -lt 30; $taskAttempt++) {
    docker exec $taskContainer pg_isready -U postgres *> $null
    if ($LASTEXITCODE -eq 0) { $taskReady = $true; break }
    Start-Sleep -Milliseconds 300
  }
  if (-not $taskReady) { throw 'Isolated database did not start' }
  $taskSetup = @'
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA portal_read_model;
CREATE TABLE portal_read_model.pregnancy_care_plan (
  id uuid PRIMARY KEY, times_per_day smallint NOT NULL, active boolean NOT NULL,
  confirmed_by_clinician boolean NOT NULL, entry_source text NOT NULL,
  dose_display text NOT NULL DEFAULT 'Unchanged dose', instructions text NOT NULL DEFAULT 'Unchanged instructions'
);
CREATE TABLE portal_read_model.pregnancy_care_intake (
  plan_id uuid REFERENCES portal_read_model.pregnancy_care_plan, day date NOT NULL,
  slot smallint NOT NULL, status text NOT NULL, reason text, taken_at timestamptz,
  PRIMARY KEY(plan_id,day,slot)
);
CREATE TABLE portal_read_model.pregnancy_check (day date,task_id text,PRIMARY KEY(day,task_id));
CREATE FUNCTION portal_read_model.complete_linked_daily_action(p_day date,p_task_id text)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  INSERT INTO portal_read_model.pregnancy_check VALUES(p_day,p_task_id) ON CONFLICT DO NOTHING;
$$;
INSERT INTO portal_read_model.pregnancy_care_plan(id,times_per_day,active,confirmed_by_clinician,entry_source) VALUES
  ('11111111-1111-4111-8111-111111111111',2,true,false,'clinician_plan'),
  ('22222222-2222-4222-8222-222222222222',1,false,false,'clinician_plan'),
  ('33333333-3333-4333-8333-333333333333',1,true,true,'clinician_plan'),
  ('44444444-4444-4444-8444-444444444444',1,true,false,'self_purchased');
'@
  $taskAssertions = @'
DO $$
DECLARE target uuid := '11111111-1111-4111-8111-111111111111'; p record; before_plan jsonb; after_plan jsonb;
BEGIN
  SELECT to_jsonb(plan) INTO before_plan FROM portal_read_model.pregnancy_care_plan plan WHERE id=target;
  PERFORM public.embe_record_pregnancy_care_intake(target,DATE '2026-09-09',1::smallint,'taken','');
  PERFORM public.embe_record_pregnancy_care_intake(target,DATE '2026-09-09',1::smallint,'taken','');
  ASSERT (SELECT count(*) FROM portal_read_model.pregnancy_care_intake)=1, 'Repeated tap created duplicate';
  ASSERT NOT EXISTS(SELECT 1 FROM portal_read_model.pregnancy_check), 'Completed too early';
  PERFORM public.embe_record_pregnancy_care_intake(target,DATE '2026-09-09',2::smallint,'deferred','Later');
  PERFORM public.embe_record_pregnancy_care_intake(target,DATE '2026-09-09',2::smallint,'skipped','Not used');
  ASSERT (SELECT status FROM portal_read_model.pregnancy_care_intake WHERE plan_id=target AND slot=2)='skipped';
  ASSERT NOT EXISTS(SELECT 1 FROM portal_read_model.pregnancy_check), 'Skipped dose counted as taken';
  PERFORM public.embe_record_pregnancy_care_intake(target,DATE '2026-09-09',2::smallint,'taken','');
  PERFORM public.embe_record_pregnancy_care_intake('33333333-3333-4333-8333-333333333333',DATE '2026-09-09',1::smallint,'taken','');
  ASSERT NOT EXISTS(SELECT 1 FROM portal_read_model.pregnancy_check), 'Self purchased dose omitted';
  PERFORM public.embe_record_pregnancy_care_intake('44444444-4444-4444-8444-444444444444',DATE '2026-09-09',1::smallint,'taken','');
  ASSERT (SELECT count(*) FROM portal_read_model.pregnancy_check WHERE day=DATE '2026-09-09' AND task_id='supplements')=1;
  ASSERT NOT EXISTS(SELECT 1 FROM portal_read_model.pregnancy_check WHERE day<>DATE '2026-09-09'), 'Wrong day completion';
  SELECT to_jsonb(plan) INTO after_plan FROM portal_read_model.pregnancy_care_plan plan WHERE id=target;
  ASSERT before_plan=after_plan, 'Intake altered prescription or clinical confirmation';
  FOR p IN SELECT * FROM (VALUES
    ('22222222-2222-4222-8222-222222222222'::uuid,DATE '2026-09-09',1::smallint,'taken',''),
    ('55555555-5555-4555-8555-555555555555'::uuid,DATE '2026-09-09',1::smallint,'taken',''),
    (target,DATE '2026-09-09',3::smallint,'taken',''),
    (target,DATE '2026-09-09',0::smallint,'taken',''),
    (target,DATE '2026-09-09',NULL::smallint,'taken',''),
    (target,NULL::date,1::smallint,'taken',''),
    (target,DATE '1900-01-01',1::smallint,'taken',''),
    (target,DATE '2026-09-09',1::smallint,NULL::text,''),
    (target,DATE '2026-09-09',1::smallint,'invented',''),
    (target,DATE '2026-09-09',1::smallint,'taken',repeat('a',121))
  ) AS args(id,day,slot,status,reason) LOOP
    BEGIN
      PERFORM public.embe_record_pregnancy_care_intake(p.id,p.day,p.slot,p.status,p.reason);
      RAISE EXCEPTION 'Invalid intake unexpectedly accepted' USING ERRCODE='XX000';
    EXCEPTION WHEN raise_exception THEN
      ASSERT SQLERRM='invalid care intake';
    END;
  END LOOP;
  ASSERT NOT has_function_privilege('anon','public.embe_record_pregnancy_care_intake(uuid,date,smallint,text,text)','execute');
  ASSERT NOT has_function_privilege('authenticated','public.embe_record_pregnancy_care_intake(uuid,date,smallint,text,text)','execute');
  ASSERT has_function_privilege('service_role','public.embe_record_pregnancy_care_intake(uuid,date,smallint,text,text)','execute');
  ASSERT NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.embe_record_pregnancy_care_intake(uuid,date,smallint,text,text)'::regprocedure);
END;
$$;
SELECT 'PASS: self-reported intake, unchanged prescription, idempotence, all-dose completion, 10 invalid cases, private RPC' AS result;
'@
  ($taskSetup + "`n" + (Get-Content -LiteralPath $taskMigration -Raw) + "`n" + $taskAssertions) | docker exec -i $taskContainer psql -U postgres -v ON_ERROR_STOP=1
  if ($LASTEXITCODE -ne 0) { throw 'Medication intake database assertions failed' }
} finally {
  if ($taskContainer -match '^[a-f0-9]{64}$') { docker stop --time 2 $taskContainer | Out-Null }
}

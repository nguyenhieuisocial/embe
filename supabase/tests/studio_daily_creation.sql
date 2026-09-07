-- Finite synthetic checks, isolated by transaction + the same worker advisory lock.
-- Only Studio tables are touched; every fixture and temporary setting is rolled back.
BEGIN;
SET LOCAL ROLE service_role;
SELECT pg_advisory_xact_lock(73915431);
DO $$
DECLARE d date:=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date; j jsonb; first_id uuid; second_id uuid; before_count integer;
BEGIN
  IF EXISTS(SELECT 1 FROM embe_studio.render WHERE status IN ('queued','rendering','failed')) THEN RAISE EXCEPTION 'requires idle healthy Studio'; END IF;
  SELECT count(*) INTO before_count FROM embe_studio.project;
  INSERT INTO embe_studio.automation_topic(slug,priority,checked_at,review_due,payload) VALUES
    ('automation-verifier',10000,d,d+1,'{"title":"Automation verifier","stage":"","caption":"","scenes":[{"heading":"Original","text":"A small thought."}],"sources":[{"title":"NHS","url":"https://www.nhs.uk/pregnancy/"}],"autoRender":true}');
  UPDATE embe_studio.automation SET enabled=false,next_run_at=now()-interval '1 day' WHERE id;
  IF public.embe_studio_autoplan()->>'status'<>'paused' THEN RAISE EXCEPTION 'pause ignored'; END IF;
  j:=public.embe_studio_automation();
  PERFORM public.embe_studio_automation(true,(j->>'revision')::integer);
  BEGIN PERFORM public.embe_studio_automation(false,(j->>'revision')::integer); RAISE EXCEPTION 'stale setting accepted'; EXCEPTION WHEN sqlstate 'PT409' THEN NULL; END;
  j:=public.embe_studio_autoplan(); first_id:=(j->>'projectId')::uuid;
  IF j->>'status'<>'created' OR first_id IS NULL THEN RAISE EXCEPTION 'no automatic creation'; END IF;
  IF public.embe_studio_autoplan()->>'status'<>'scheduled' THEN RAISE EXCEPTION 'same-day duplication'; END IF;
  IF (SELECT count(*) FROM embe_studio.project)<>before_count+1 THEN RAISE EXCEPTION 'unexpected creation count'; END IF;
  IF (SELECT (next_run_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::time FROM embe_studio.automation)<>time '08:00' THEN RAISE EXCEPTION 'wrong local schedule'; END IF;
  j:=public.embe_studio_automation();PERFORM public.embe_studio_automation(false,(j->>'revision')::integer);
  j:=public.embe_studio_automation();PERFORM public.embe_studio_automation(true,(j->>'revision')::integer);
  IF public.embe_studio_autoplan()->>'status'<>'scheduled' THEN RAISE EXCEPTION 'resume resets daily cap'; END IF;
  -- Simulate a long outage: one topic, not a backlog burst, and never reuse the first.
  UPDATE embe_studio.automation SET next_run_at=now()-interval '10 days' WHERE id;
  j:=public.embe_studio_autoplan();second_id:=(j->>'projectId')::uuid;
  IF second_id IS NULL OR second_id=first_id THEN RAISE EXCEPTION 'dedup failed'; END IF;
  IF public.embe_studio_autoplan()->>'status'<>'scheduled' THEN RAISE EXCEPTION 'catchup burst'; END IF;
  UPDATE embe_studio.automation SET next_run_at=now()-interval '1 day' WHERE id;
  UPDATE embe_studio.automation_topic SET checked_at=d-10,review_due=d-1 WHERE project_id IS NULL;
  IF public.embe_studio_autoplan()->>'status'<>'sources_expired' THEN RAISE EXCEPTION 'expired source consumed'; END IF;
  INSERT INTO embe_studio.render(project_id,revision,snapshot,status,error,attempts)
    SELECT id,revision,payload,'failed','voice_too_long',1 FROM embe_studio.project WHERE id=first_id;
  IF public.embe_studio_autoplan()->>'status'<>'render_failed' THEN RAISE EXCEPTION 'failed render ignored'; END IF;
  IF public.embe_studio_automation()->'publication'->>'status'<>'not_connected' THEN RAISE EXCEPTION 'fake publishing state'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF has_function_privilege('anon','public.embe_studio_automation(boolean,integer)','EXECUTE')
    OR has_function_privilege('authenticated','public.embe_studio_autoplan()','EXECUTE')
    OR has_table_privilege('anon','embe_studio.automation_topic','SELECT') THEN RAISE EXCEPTION 'private boundary failed'; END IF;
END $$;
ROLLBACK;

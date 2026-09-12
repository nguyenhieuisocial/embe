BEGIN;
SET LOCAL ROLE service_role;
SELECT public.embe_report_cloud_backup('2026-09-01T00:00:00Z');
DO $$ BEGIN
  ASSERT (SELECT last_seen_at FROM portal_read_model.worker_heartbeat WHERE worker_name='cloud-db-backup')='2026-09-01T00:00:00Z';
  PERFORM public.embe_report_cloud_backup('2026-08-01T00:00:00Z');
  ASSERT (SELECT last_seen_at FROM portal_read_model.worker_heartbeat WHERE worker_name='cloud-db-backup')='2026-09-01T00:00:00Z';
  BEGIN
    PERFORM public.embe_report_cloud_backup('2099-01-01T00:00:00Z');
    RAISE EXCEPTION 'Accepted future time';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'invalid backup storage time' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
DO $$ BEGIN
  ASSERT NOT has_function_privilege('anon','public.embe_report_cloud_backup(timestamptz)','EXECUTE');
  ASSERT NOT has_function_privilege('authenticated','public.embe_report_cloud_backup(timestamptz)','EXECUTE');
END $$;
ROLLBACK;

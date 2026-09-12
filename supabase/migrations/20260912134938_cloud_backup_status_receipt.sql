-- Report the object's actual storage time, never the time someone checks it.
CREATE OR REPLACE FUNCTION public.embe_report_cloud_backup(p_stored_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF p_stored_at IS NULL OR p_stored_at > clock_timestamp() + interval '1 minute'
    OR p_stored_at < timestamptz '2026-01-01 00:00:00Z' THEN
    RAISE EXCEPTION 'invalid backup storage time';
  END IF;
  INSERT INTO portal_read_model.worker_heartbeat(worker_name,state,detail,last_seen_at)
  VALUES('cloud-db-backup','online','database-only; encrypted; 35 slots',p_stored_at)
  ON CONFLICT(worker_name) DO UPDATE SET state=EXCLUDED.state,detail=EXCLUDED.detail,last_seen_at=EXCLUDED.last_seen_at
  WHERE worker_heartbeat.last_seen_at <= EXCLUDED.last_seen_at;
END;
$$;
REVOKE ALL ON FUNCTION public.embe_report_cloud_backup(timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.embe_report_cloud_backup(timestamptz) TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE portal_read_model.cloud_reminder_dispatch (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  request_id bigint,
  requested_at timestamptz,
  completed_at timestamptz,
  http_status integer,
  last_success_at timestamptz
);
INSERT INTO portal_read_model.cloud_reminder_dispatch(singleton) VALUES(true);
ALTER TABLE portal_read_model.cloud_reminder_dispatch ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.cloud_reminder_dispatch FORCE ROW LEVEL SECURITY;
REVOKE ALL ON portal_read_model.cloud_reminder_dispatch FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON portal_read_model.cloud_reminder_dispatch TO service_role;
CREATE POLICY cloud_reminder_dispatch_deny_clients ON portal_read_model.cloud_reminder_dispatch
  FOR ALL TO anon, authenticated USING(false) WITH CHECK(false);

-- Cron executes as the database owner. This is not callable by web clients or
-- service_role: only this fixed destination can receive the Vault credential.
CREATE FUNCTION portal_read_model.dispatch_cloud_reminders()
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  previous portal_read_model.cloud_reminder_dispatch%ROWTYPE;
  response_status integer;
  response_at timestamptz;
  secret_value text;
  next_id bigint;
BEGIN
  SELECT * INTO STRICT previous FROM portal_read_model.cloud_reminder_dispatch
    WHERE singleton FOR UPDATE;
  -- Also prevent manual invocations from overlapping the two-minute cadence.
  IF previous.requested_at > clock_timestamp() - interval '90 seconds' THEN
    RETURN previous.request_id;
  END IF;
  IF previous.request_id IS NOT NULL THEN
    SELECT CASE WHEN timed_out OR error_msg IS NOT NULL THEN 0 ELSE status_code END, created
      INTO response_status, response_at FROM net._http_response WHERE id=previous.request_id;
    UPDATE portal_read_model.cloud_reminder_dispatch
      SET http_status=coalesce(response_status,0), completed_at=coalesce(response_at,clock_timestamp()),
          last_success_at=CASE WHEN response_status=200 THEN response_at ELSE last_success_at END
      WHERE singleton;
  END IF;
  SELECT decrypted_secret INTO secret_value FROM vault.decrypted_secrets
    WHERE name='embe_push_cron_secret';
  IF secret_value IS NULL OR char_length(secret_value)<24 THEN
    RAISE EXCEPTION 'Cloud reminder credential is not configured';
  END IF;
  SELECT net.http_post(
    url:='https://embe.hieu.asia/api/notifications/dispatch',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||secret_value),
    body:='{}'::jsonb, timeout_milliseconds:=15000
  ) INTO next_id;
  UPDATE portal_read_model.cloud_reminder_dispatch
    SET request_id=next_id, requested_at=clock_timestamp() WHERE singleton;
  -- Keep only this job's operational history; do not touch other jobs.
  DELETE FROM cron.job_run_details WHERE jobid IN (
    SELECT jobid FROM cron.job WHERE jobname='embe-cloud-reminders'
  ) AND end_time < now()-interval '7 days';
  RETURN next_id;
END $$;
REVOKE ALL ON FUNCTION portal_read_model.dispatch_cloud_reminders() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.embe_cloud_reminder_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object('requested_at',requested_at,'completed_at',completed_at,
    'http_status',http_status,'last_success_at',last_success_at)
  FROM portal_read_model.cloud_reminder_dispatch WHERE singleton;
$$;
REVOKE ALL ON FUNCTION public.embe_cloud_reminder_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_cloud_reminder_status() TO service_role;

-- Only compare a one-way hash; no RPC returns the underlying Vault credential.
CREATE FUNCTION public.embe_verify_cloud_reminder(p_token_hash text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT coalesce(p_token_hash ~ '^[0-9a-f]{64}$' AND EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name='embe_push_cron_secret'
      AND encode(sha256(convert_to(decrypted_secret,'UTF8')),'hex')=p_token_hash
  ),false);
$$;
REVOKE ALL ON FUNCTION public.embe_verify_cloud_reminder(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_verify_cloud_reminder(text) TO service_role;

SELECT cron.schedule('embe-cloud-reminders','*/2 * * * *',
  'SELECT portal_read_model.dispatch_cloud_reminders();');
-- Explicit promotion after deploying the receiver and testing the real request.
SELECT cron.alter_job(jobid,active:=false) FROM cron.job WHERE jobname='embe-cloud-reminders';

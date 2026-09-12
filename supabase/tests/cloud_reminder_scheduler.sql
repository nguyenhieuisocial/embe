BEGIN;
DO $$
DECLARE req_id bigint;
BEGIN
  BEGIN
    PERFORM portal_read_model.dispatch_cloud_reminders();
    RAISE EXCEPTION 'Missing secret did not stop dispatch';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Cloud reminder credential is not configured' THEN RAISE; END IF;
  END;
  ASSERT (SELECT count(*) FROM net.requests)=0;
  INSERT INTO vault.decrypted_secrets VALUES('embe_push_cron_secret','fixture-secret-not-a-real-token');
  req_id:=portal_read_model.dispatch_cloud_reminders();
  ASSERT req_id IS NOT NULL;
  ASSERT (SELECT url='https://embe.hieu.asia/api/notifications/dispatch' AND timeout_ms=15000
    AND headers->>'Authorization'='Bearer fixture-secret-not-a-real-token' FROM net.requests WHERE requests.id=req_id);
  ASSERT portal_read_model.dispatch_cloud_reminders()=req_id;
  ASSERT (SELECT count(*) FROM net.requests)=1, 'Overlapping call sent twice';
  INSERT INTO net._http_response VALUES(req_id,200,false,NULL,now());
  UPDATE portal_read_model.cloud_reminder_dispatch SET requested_at=now()-interval '2 minutes';
  req_id:=portal_read_model.dispatch_cloud_reminders();
  ASSERT (public.embe_cloud_reminder_status()->>'http_status')::int=200;
  ASSERT public.embe_cloud_reminder_status()->>'last_success_at' IS NOT NULL;
  INSERT INTO net._http_response VALUES(req_id,503,false,NULL,now());
  UPDATE portal_read_model.cloud_reminder_dispatch SET requested_at=now()-interval '2 minutes';
  req_id:=portal_read_model.dispatch_cloud_reminders();
  ASSERT (public.embe_cloud_reminder_status()->>'http_status')::int=503;
  INSERT INTO net._http_response VALUES(req_id,NULL,true,'timeout',now());
  UPDATE portal_read_model.cloud_reminder_dispatch SET requested_at=now()-interval '2 minutes';
  PERFORM portal_read_model.dispatch_cloud_reminders();
  ASSERT (public.embe_cloud_reminder_status()->>'http_status')::int=0;
  ASSERT public.embe_cloud_reminder_status()::text NOT LIKE '%fixture-secret%';
  ASSERT public.embe_verify_cloud_reminder(encode(sha256(convert_to('fixture-secret-not-a-real-token','UTF8')),'hex'));
  ASSERT NOT public.embe_verify_cloud_reminder(repeat('0',64));
  ASSERT NOT public.embe_verify_cloud_reminder(NULL);
  ASSERT NOT has_function_privilege('anon','public.embe_verify_cloud_reminder(text)','execute');
  ASSERT NOT has_function_privilege('service_role','portal_read_model.dispatch_cloud_reminders()','execute');
  ASSERT NOT has_function_privilege('anon','public.embe_cloud_reminder_status()','execute');
  ASSERT NOT has_table_privilege('authenticated','portal_read_model.cloud_reminder_dispatch','select');
  ASSERT (SELECT command NOT LIKE '%fixture-secret%' FROM cron.job WHERE jobname='embe-cloud-reminders');
  ASSERT (SELECT NOT active FROM cron.job WHERE jobname='embe-cloud-reminders');
END $$;
SET LOCAL ROLE service_role;
SELECT public.embe_cloud_reminder_status() IS NOT NULL AS service_status_readable;
ROLLBACK;

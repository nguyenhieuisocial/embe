-- Run only in an isolated fixture database, after the journal migrations.
BEGIN;
SET LOCAL ROLE service_role;
DO $test$
DECLARE
  key_id uuid := gen_random_uuid();
  old_key uuid := gen_random_uuid();
  entry_id uuid;
  old_id uuid;
  before_count bigint;
BEGIN
  SELECT count(*) INTO before_count FROM portal_read_model.journal_inbox;
  entry_id := public.embe_submit_journal(key_id, '  Cloud journal fixture  ', 'mother');
  IF NOT EXISTS (SELECT 1 FROM public.embe_timeline_event
    WHERE id=entry_id AND caption='Cloud journal fixture') THEN
    RAISE EXCEPTION 'not immediately readable without local worker';
  END IF;
  IF (SELECT count(*) FROM portal_read_model.journal_inbox) <> before_count THEN
    RAISE EXCEPTION 'new entry still depends on the local inbox';
  END IF;
  IF public.embe_submit_journal(key_id,'Cloud journal fixture','mother') <> entry_id THEN
    RAISE EXCEPTION 'retry duplicated entry';
  END IF;
  BEGIN
    PERFORM public.embe_submit_journal(key_id,'Changed content','mother');
    RAISE EXCEPTION 'conflicting retry accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='conflicting retry accepted' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.embe_submit_journal(gen_random_uuid(),NULL,'mother');
    RAISE EXCEPTION 'null accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='null accepted' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.embe_submit_journal(gen_random_uuid(),'text',NULL);
    RAISE EXCEPTION 'null role accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='null role accepted' THEN RAISE; END IF;
  END;
  INSERT INTO portal_read_model.journal_inbox(idempotency_key,content,author_role,status)
    VALUES(old_key,NULL,'father','imported') RETURNING id INTO old_id;
  IF public.embe_submit_journal(old_key,'Old replay','father') <> old_id THEN
    RAISE EXCEPTION 'legacy replay duplicated';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(
      public.embe_export_journal_data()->'published_entries') e
      WHERE e->>'id'=entry_id::text) THEN
    RAISE EXCEPTION 'cloud journal missing from export';
  END IF;
  -- Exercise the real legacy reconciliation, even with an empty Memos snapshot.
  PERFORM public.embe_finalize_timeline_sync(gen_random_uuid(),0);
  IF NOT EXISTS(SELECT 1 FROM public.embe_timeline_event WHERE id=entry_id) THEN
    RAISE EXCEPTION 'local sync hid cloud journal';
  END IF;
  IF has_function_privilege('anon','public.embe_submit_journal(uuid,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.embe_export_journal_data()','EXECUTE') THEN
    RAISE EXCEPTION 'private journal RPC exposed';
  END IF;
END;
$test$;
ROLLBACK;

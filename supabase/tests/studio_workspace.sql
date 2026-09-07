-- Transactional synthetic checks. No family records or permanent sample data.
BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE a uuid:=gen_random_uuid(); d jsonb:='{"title":"Verifier","stage":"Mẹ bầu","caption":"","scenes":[{"heading":"Một điều nhỏ","text":"Ghi lại câu hỏi."}],"sources":[{"title":"NHS","url":"https://www.nhs.uk/pregnancy/"}]}'; j jsonb; c jsonb; n jsonb;
BEGIN
  j:=public.embe_studio_workspace('save',a,0,d);
  IF j->'project'->>'revision'<>'1' THEN RAISE EXCEPTION 'save failed'; END IF;
  j:=public.embe_studio_workspace('save',a,0,d);
  IF j->'project'->>'revision'<>'1' THEN RAISE EXCEPTION 'retry not idempotent'; END IF;
  BEGIN PERFORM public.embe_studio_workspace('save',a,0,d||'{"title":"overwrite"}'); RAISE EXCEPTION 'conflict missing'; EXCEPTION WHEN sqlstate 'PT409' THEN NULL; END;
  j:=public.embe_studio_workspace('render',a,1);
  n:=public.embe_studio_workspace('render',a,1);
  IF j->'render'->>'id' IS DISTINCT FROM n->'render'->>'id' THEN RAISE EXCEPTION 'duplicate render'; END IF;
  c:=public.embe_studio_worker('claim');
  IF c->>'project_id' IS DISTINCT FROM a::text THEN RAISE EXCEPTION 'claim mismatch; run only with idle queue'; END IF;
  PERFORM public.embe_studio_workspace('delete',a,1);
  BEGIN PERFORM public.embe_studio_worker('progress',(c->>'id')::uuid,(c->>'claim')::uuid,'{"progress":50}'); RAISE EXCEPTION 'cancel did not revoke claim'; EXCEPTION WHEN sqlstate 'PT409' THEN NULL; END;
  PERFORM public.embe_studio_workspace('restore',a,2);
  IF (public.embe_studio_workspace('get',a)->'project'->>'deleted')::boolean THEN RAISE EXCEPTION 'restore failed'; END IF;
  n:=public.embe_studio_workspace('board');
  PERFORM public.embe_studio_workspace('save-board',NULL,(n->>'revision')::integer,'[]');
  BEGIN PERFORM public.embe_studio_workspace('save-board',NULL,-1,'[{"different":true}]'); RAISE EXCEPTION 'board conflict missing'; EXCEPTION WHEN sqlstate 'PT409' THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF has_function_privilege('anon','public.embe_studio_workspace(text,uuid,integer,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','public.embe_studio_worker(text,uuid,uuid,jsonb)','EXECUTE')
    OR has_schema_privilege('anon','embe_studio','USAGE') THEN RAISE EXCEPTION 'private boundary failed'; END IF;
END $$;
ROLLBACK;

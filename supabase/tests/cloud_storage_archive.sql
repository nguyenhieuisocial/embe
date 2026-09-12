BEGIN;
INSERT INTO storage.buckets(id,public) VALUES('embe-medical-records',false),('unrelated',false);
INSERT INTO storage.objects(id,bucket_id,name,metadata,updated_at,version) VALUES
 ('11111111-1111-4111-8111-111111111111','embe-medical-records','fixture.jpg','{"size":1024}',now(),'v1'),
 ('22222222-2222-4222-8222-222222222222','unrelated','fixture.jpg','{"size":1024}',now(),'v1'),
 ('33333333-3333-4333-8333-333333333333','embe-medical-records','large.jpg','{"size":30000000}',now(),'v1');
DO $$ DECLARE c jsonb; status jsonb; key text;
BEGIN
 IF has_function_privilege('anon','public.embe_claim_file_archive()','EXECUTE') OR has_function_privilege('authenticated','public.embe_file_archive_status()','EXECUTE') THEN RAISE EXCEPTION 'client access'; END IF;
 IF has_table_privilege('embe_cloud_backup','portal_read_model.cloud_file_archive','INSERT') THEN RAISE EXCEPTION 'backup write'; END IF;
 c:=public.embe_claim_file_archive();
 IF jsonb_array_length(c->'jobs')<>1 THEN RAISE EXCEPTION 'scope/size filter'; END IF;
 IF public.embe_claim_file_archive()->>'busy'<>'true' THEN RAISE EXCEPTION 'overlapping lease'; END IF;
 key:=c->'jobs'->0->>'key';
 IF NOT public.embe_file_archive_source_matches(key) THEN RAISE EXCEPTION 'source check'; END IF;
 PERFORM public.embe_finish_file_archive((c->>'lease')::uuid,jsonb_build_array(jsonb_build_object('key',key,'sha256',repeat('a',64),'bytes',2000)));
 c:=public.embe_claim_file_archive();IF jsonb_array_length(c->'jobs')<>0 THEN RAISE EXCEPTION 'duplicate copy'; END IF;
 PERFORM public.embe_finish_file_archive((c->>'lease')::uuid,'[]');
 UPDATE storage.objects SET version='v2' WHERE id='11111111-1111-4111-8111-111111111111';
 IF public.embe_file_archive_source_matches(key) THEN RAISE EXCEPTION 'stale source accepted'; END IF;
 c:=public.embe_claim_file_archive();IF jsonb_array_length(c->'jobs')<>1 THEN RAISE EXCEPTION 'new version missing'; END IF;
 status:=public.embe_file_archive_status();IF (status->>'pending')::int<>2 THEN RAISE EXCEPTION 'unknown/oversized false ready'; END IF;
 IF (SELECT count(*) FROM portal_read_model.cloud_file_archive)<>2 THEN RAISE EXCEPTION 'versions not retained'; END IF;
END $$;
ROLLBACK;

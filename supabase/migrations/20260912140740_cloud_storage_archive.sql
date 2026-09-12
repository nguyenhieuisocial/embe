-- Immutable, encrypted file copies; never deletes or changes source objects.
CREATE TABLE portal_read_model.cloud_file_archive (
  archive_key text PRIMARY KEY CHECK (archive_key ~ '^[a-f0-9]{64}$'),
  source_id uuid NOT NULL, source_version text NOT NULL,
  bucket_id text NOT NULL, object_name text NOT NULL, metadata jsonb NOT NULL,
  source_bytes bigint NOT NULL CHECK(source_bytes BETWEEN 1 AND 26214400),
  reserved_bytes bigint NOT NULL, lease uuid, retry_at timestamptz,
  attempts integer NOT NULL DEFAULT 0, saved_at timestamptz,
  cipher_sha256 text, cipher_bytes bigint,
  UNIQUE(source_id,source_version)
);
CREATE INDEX cloud_file_archive_pending ON portal_read_model.cloud_file_archive(retry_at) WHERE saved_at IS NULL;
CREATE TABLE portal_read_model.cloud_file_archive_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  lease uuid, lease_until timestamptz, scanned_at timestamptz
);
INSERT INTO portal_read_model.cloud_file_archive_state(singleton) VALUES(true);
ALTER TABLE portal_read_model.cloud_file_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.cloud_file_archive FORCE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.cloud_file_archive_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.cloud_file_archive_state FORCE ROW LEVEL SECURITY;
REVOKE ALL ON portal_read_model.cloud_file_archive,portal_read_model.cloud_file_archive_state FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON portal_read_model.cloud_file_archive,portal_read_model.cloud_file_archive_state TO service_role;
GRANT SELECT ON portal_read_model.cloud_file_archive,portal_read_model.cloud_file_archive_state TO embe_cloud_backup;
CREATE POLICY embe_cloud_backup_select ON portal_read_model.cloud_file_archive FOR SELECT TO embe_cloud_backup USING(true);
CREATE POLICY embe_cloud_backup_select ON portal_read_model.cloud_file_archive_state FOR SELECT TO embe_cloud_backup USING(true);

CREATE VIEW portal_read_model.cloud_file_archive_source WITH(security_invoker=true) AS
 SELECT o.id,o.bucket_id,o.name,jsonb_build_object('storage',o.metadata,'user_metadata',o.user_metadata,
   'created_at',o.created_at,'updated_at',o.updated_at) AS metadata,
   coalesce(o.version,'')||'/'||extract(epoch FROM o.updated_at)::text AS version,
   CASE WHEN o.metadata->>'size' ~ '^[0-9]{1,12}$' THEN (o.metadata->>'size')::bigint ELSE 0 END AS bytes
 FROM storage.objects o JOIN storage.buckets b ON b.id=o.bucket_id
 WHERE NOT b.public AND o.archived_at IS NULL AND NOT coalesce(o.is_delete_marker,false)
 AND o.bucket_id IN ('embe-meal-inbox','embe-medical-records','embe-photo-inbox','embe-studio-drafts');
REVOKE ALL ON portal_read_model.cloud_file_archive_source FROM PUBLIC,anon,authenticated;
GRANT SELECT ON portal_read_model.cloud_file_archive_source TO service_role;

CREATE FUNCTION public.embe_claim_file_archive() RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s portal_read_model.cloud_file_archive_state%ROWTYPE; item record;
 used_bytes bigint; used_count integer; token uuid:=gen_random_uuid(); jobs jsonb;
BEGIN
 SELECT * INTO STRICT s FROM portal_read_model.cloud_file_archive_state WHERE singleton FOR UPDATE;
 IF s.lease_until>clock_timestamp() THEN RETURN jsonb_build_object('busy',true); END IF;
 SELECT coalesce(sum(reserved_bytes),0),count(*) INTO used_bytes,used_count FROM portal_read_model.cloud_file_archive;
 FOR item IN SELECT o.* FROM portal_read_model.cloud_file_archive_source o
   WHERE o.bytes BETWEEN 1 AND 26214400 AND NOT EXISTS(
     SELECT 1 FROM portal_read_model.cloud_file_archive a WHERE a.source_id=o.id AND a.source_version=o.version)
   ORDER BY o.id LIMIT 200 LOOP
   -- Bound retained copies, including failed/reserved jobs. No automatic paid expansion.
   IF used_bytes+item.bytes+32768>1073741824 OR used_count>=10000 THEN EXIT; END IF;
   INSERT INTO portal_read_model.cloud_file_archive(archive_key,source_id,source_version,bucket_id,object_name,metadata,source_bytes,reserved_bytes)
   VALUES(encode(sha256(convert_to(item.id::text||'/'||item.version,'UTF8')),'hex'),item.id,item.version,item.bucket_id,item.name,
     item.metadata,item.bytes,item.bytes+32768);
   used_bytes:=used_bytes+item.bytes+32768; used_count:=used_count+1;
 END LOOP;
 WITH selected AS (
   SELECT archive_key FROM portal_read_model.cloud_file_archive WHERE saved_at IS NULL
   AND (retry_at IS NULL OR retry_at<=clock_timestamp()) ORDER BY attempts,archive_key LIMIT 10
 ), claimed AS (
   UPDATE portal_read_model.cloud_file_archive a SET lease=token,attempts=attempts+1,retry_at=clock_timestamp()+interval '5 minutes'
   FROM selected WHERE a.archive_key=selected.archive_key RETURNING a.*
 ) SELECT coalesce(jsonb_agg(jsonb_build_object('key',archive_key,'id',source_id,'version',source_version,
   'bucket',bucket_id,'name',object_name,'metadata',metadata,'bytes',source_bytes)), '[]'::jsonb) INTO jobs FROM claimed;
 UPDATE portal_read_model.cloud_file_archive_state SET lease=token,lease_until=clock_timestamp()+interval '2 minutes',scanned_at=clock_timestamp() WHERE singleton;
 RETURN jsonb_build_object('lease',token,'jobs',jobs);
END $$;

CREATE FUNCTION public.embe_finish_file_archive(p_lease uuid,p_results jsonb) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM 1 FROM portal_read_model.cloud_file_archive_state WHERE singleton AND lease=p_lease FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'stale archive lease'; END IF;
 IF jsonb_typeof(p_results)<>'array' OR jsonb_array_length(p_results)>10 THEN RAISE EXCEPTION 'invalid results'; END IF;
 FOR result IN SELECT value FROM jsonb_array_elements(p_results) LOOP
   IF result->>'sha256' ~ '^[a-f0-9]{64}$' AND result->>'bytes' ~ '^[0-9]{1,9}$' THEN
     UPDATE portal_read_model.cloud_file_archive SET saved_at=clock_timestamp(),cipher_sha256=result->>'sha256',cipher_bytes=(result->>'bytes')::bigint
       WHERE archive_key=result->>'key' AND lease=p_lease AND saved_at IS NULL
       AND (result->>'bytes')::bigint BETWEEN source_bytes+512 AND reserved_bytes;
   END IF;
 END LOOP;
 UPDATE portal_read_model.cloud_file_archive_state SET lease_until=NULL WHERE singleton AND lease=p_lease;
END $$;

CREATE FUNCTION public.embe_file_archive_status() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('total',count(*),'saved',count(a.saved_at),
   'pending',count(*) FILTER(WHERE a.saved_at IS NULL),'scanned_at',(SELECT scanned_at FROM portal_read_model.cloud_file_archive_state WHERE singleton),
   'retained_bytes',(SELECT coalesce(sum(reserved_bytes),0) FROM portal_read_model.cloud_file_archive),'limit_bytes',1073741824)
 FROM portal_read_model.cloud_file_archive_source o LEFT JOIN portal_read_model.cloud_file_archive a ON a.source_id=o.id AND a.source_version=o.version;
$$;
CREATE FUNCTION public.embe_file_archive_source_matches(p_key text) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM portal_read_model.cloud_file_archive a JOIN portal_read_model.cloud_file_archive_source o
 ON o.id=a.source_id AND o.version=a.source_version AND o.name=a.object_name AND o.bytes=a.source_bytes
 WHERE a.archive_key=p_key);
$$;
REVOKE ALL ON FUNCTION public.embe_file_archive_source_matches(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.embe_file_archive_source_matches(text) TO service_role;
REVOKE ALL ON FUNCTION public.embe_claim_file_archive(),public.embe_finish_file_archive(uuid,jsonb),public.embe_file_archive_status() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.embe_claim_file_archive(),public.embe_finish_file_archive(uuid,jsonb),public.embe_file_archive_status() TO service_role;

CREATE FUNCTION portal_read_model.dispatch_file_archive() RETURNS bigint
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE token text; request_id bigint;
BEGIN
 SELECT decrypted_secret INTO token FROM vault.decrypted_secrets WHERE name='embe_file_archive_secret';
 IF token IS NULL THEN RAISE EXCEPTION 'archive credential missing'; END IF;
 SELECT net.http_post(url:='https://tpqqzowhndbkmkckpbgv.supabase.co/functions/v1/cloud-file-archive',
   headers:=jsonb_build_object('Authorization','Bearer '||token,'Content-Type','application/json'),
   body:='{}'::jsonb,timeout_milliseconds:=60000) INTO request_id;
 DELETE FROM cron.job_run_details WHERE jobid IN (SELECT jobid FROM cron.job WHERE jobname='embe-cloud-file-archive') AND end_time<now()-interval '7 days';
 RETURN request_id;
END $$;
REVOKE ALL ON FUNCTION portal_read_model.dispatch_file_archive() FROM PUBLIC,anon,authenticated,service_role;
SELECT cron.schedule('embe-cloud-file-archive','*/2 * * * *','SELECT portal_read_model.dispatch_file_archive();');
SELECT cron.alter_job(jobid,active:=false) FROM cron.job WHERE jobname='embe-cloud-file-archive';

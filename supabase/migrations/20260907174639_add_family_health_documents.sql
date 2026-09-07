-- Version matches the applied EmBe migration.
BEGIN;

-- Originals are private. Subject identity comes from the parent record, never a filename.
CREATE TABLE portal_read_model.family_health_document (
  id uuid PRIMARY KEY,
  record_id uuid NOT NULL REFERENCES portal_read_model.family_member_record(id) ON DELETE CASCADE,
  original_filename text NOT NULL CHECK(length(original_filename) BETWEEN 1 AND 180),
  mime_type text NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp','application/pdf')),
  byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 15000000),
  storage_path text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready')),
  deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX family_health_document_record_idx ON portal_read_model.family_health_document(record_id,created_at);
ALTER TABLE portal_read_model.family_health_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.family_health_document FORCE ROW LEVEL SECURITY;
REVOKE ALL ON portal_read_model.family_health_document FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON portal_read_model.family_health_document TO service_role;

-- Service-only API. Every operation verifies BOTH subject and record, even by document ID.
CREATE FUNCTION public.embe_family_health_documents(p_member_id uuid,p_record_id uuid,p_action text,
  p_document_id uuid DEFAULT NULL,p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE person portal_read_model.family_member; record portal_read_model.family_member_record;
  item portal_read_model.family_health_document; extension text;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('list','create','get','complete','remove','restore') THEN
    RAISE EXCEPTION 'invalid action' USING ERRCODE='22023'; END IF;
  -- Same lock order as embe_save_member_record; upload cannot race a record deletion.
  SELECT * INTO person FROM portal_read_model.family_member WHERE id=p_member_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO record FROM portal_read_model.family_member_record WHERE id=p_record_id AND member_id=p_member_id FOR UPDATE;
  IF NOT FOUND OR record.deleted THEN RAISE EXCEPTION 'not found' USING ERRCODE='P0002'; END IF;
  IF p_action NOT IN ('list','get') AND person.archived THEN RAISE EXCEPTION 'archived' USING ERRCODE='22023'; END IF;
  IF p_action='list' THEN
    RETURN (SELECT COALESCE(jsonb_agg(to_jsonb(d)-'storage_path' ORDER BY d.created_at),'[]'::jsonb)
      FROM portal_read_model.family_health_document d WHERE record_id=p_record_id);
  END IF;
  IF p_document_id IS NULL THEN RAISE EXCEPTION 'invalid document' USING ERRCODE='22023'; END IF;
  SELECT * INTO item FROM portal_read_model.family_health_document WHERE id=p_document_id FOR UPDATE;
  IF FOUND AND item.record_id<>p_record_id THEN RAISE EXCEPTION 'not found' USING ERRCODE='P0002'; END IF;
  IF p_action='create' THEN
    IF jsonb_typeof(p_metadata) IS DISTINCT FROM 'object'
      OR length(trim(COALESCE(p_metadata->>'filename',''))) NOT BETWEEN 1 AND 180
      OR COALESCE(p_metadata->>'mimeType','') NOT IN ('image/jpeg','image/png','image/webp','application/pdf')
      OR COALESCE(p_metadata->>'byteSize','') !~ '^[0-9]{1,8}$'
    THEN RAISE EXCEPTION 'invalid metadata' USING ERRCODE='22023'; END IF;
    IF (p_metadata->>'byteSize')::int NOT BETWEEN 1 AND 15000000 THEN RAISE EXCEPTION 'invalid size' USING ERRCODE='22023'; END IF;
    IF item.id IS NOT NULL THEN
      IF item.deleted OR item.original_filename<>p_metadata->>'filename' OR item.mime_type<>p_metadata->>'mimeType'
        OR item.byte_size<>(p_metadata->>'byteSize')::int THEN RAISE EXCEPTION 'document conflict' USING ERRCODE='40001'; END IF;
      RETURN to_jsonb(item);
    END IF;
    IF (SELECT count(*) FROM portal_read_model.family_health_document WHERE record_id=p_record_id)>=30 THEN
      RAISE EXCEPTION 'document limit' USING ERRCODE='22023'; END IF;
    extension := CASE p_metadata->>'mimeType' WHEN 'application/pdf' THEN 'pdf' WHEN 'image/png' THEN 'png' WHEN 'image/webp' THEN 'webp' ELSE 'jpg' END;
    INSERT INTO portal_read_model.family_health_document(id,record_id,original_filename,mime_type,byte_size,storage_path)
    VALUES(p_document_id,p_record_id,p_metadata->>'filename',p_metadata->>'mimeType',(p_metadata->>'byteSize')::int,
      'family/'||p_member_id||'/'||p_record_id||'/'||p_document_id||'.'||extension) RETURNING * INTO item;
  ELSE
    IF item.id IS NULL THEN RAISE EXCEPTION 'not found' USING ERRCODE='P0002'; END IF;
    IF p_action='complete' THEN
      IF item.deleted THEN RAISE EXCEPTION 'not found' USING ERRCODE='P0002'; END IF;
      UPDATE portal_read_model.family_health_document SET status='ready',updated_at=now() WHERE id=item.id RETURNING * INTO item;
    ELSIF p_action IN ('remove','restore') THEN
      UPDATE portal_read_model.family_health_document SET deleted=(p_action='remove'),updated_at=now() WHERE id=item.id RETURNING * INTO item;
    ELSIF item.deleted THEN RAISE EXCEPTION 'not found' USING ERRCODE='P0002'; END IF;
  END IF;
  RETURN to_jsonb(item);
END;
$$;
REVOKE ALL ON FUNCTION public.embe_family_health_documents(uuid,uuid,text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.embe_family_health_documents(uuid,uuid,text,uuid,jsonb) TO service_role;

CREATE FUNCTION public.embe_search_member_records(p_member_id uuid,p_offset integer DEFAULT 0,p_deleted boolean DEFAULT false,
  p_kind text DEFAULT '',p_query text DEFAULT '')
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT public.embe_list_member_records(p_member_id,0,p_deleted) || jsonb_build_object('records',COALESCE(
    (SELECT jsonb_agg(public.embe_family_record_json(r::portal_read_model.family_member_record) ORDER BY r.occurred_at DESC,r.id DESC)
      FROM (SELECT * FROM portal_read_model.family_member_record
        WHERE member_id=p_member_id AND deleted=p_deleted
          AND (p_kind='' OR payload->>'kind'=p_kind)
          AND (p_query='' OR strpos(lower(concat_ws(' ',payload->>'title',payload->>'notes',payload->>'source',
            payload->'clinical',payload->'labResults')),lower(left(p_query,160)))>0)
        ORDER BY occurred_at DESC,id DESC LIMIT 41 OFFSET greatest(0,least(p_offset,1000000))) r),'[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.embe_search_member_records(uuid,integer,boolean,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.embe_search_member_records(uuid,integer,boolean,text,text) TO service_role;
COMMIT;

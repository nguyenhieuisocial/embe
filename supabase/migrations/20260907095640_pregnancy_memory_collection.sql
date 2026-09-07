-- An explicit selection of existing family photos, not automatic classification.
-- Reuse record revision locking, soft deletion and audit; no copied image bytes.
CREATE INDEX IF NOT EXISTS family_record_pregnancy_memory_idx
  ON portal_read_model.family_member_record (member_id, deleted, occurred_at DESC, id DESC)
  WHERE payload ? 'pregnancyMemory';

CREATE FUNCTION public.embe_list_pregnancy_memories(p_member_id uuid, p_offset integer DEFAULT 0, p_deleted boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object('records', COALESCE(jsonb_agg(
    public.embe_family_record_json(r::portal_read_model.family_member_record)
    ORDER BY r.occurred_at DESC, r.id DESC), '[]'::jsonb), 'latest', '[]'::jsonb)
  FROM (SELECT * FROM portal_read_model.family_member_record
    WHERE member_id = p_member_id AND deleted = p_deleted AND payload ? 'pregnancyMemory'
    ORDER BY occurred_at DESC, id DESC LIMIT 41 OFFSET greatest(0, least(p_offset, 1000000))) r;
$$;
REVOKE ALL ON FUNCTION public.embe_list_pregnancy_memories(uuid, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_list_pregnancy_memories(uuid, integer, boolean) TO service_role;

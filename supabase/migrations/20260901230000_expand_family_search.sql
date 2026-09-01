CREATE OR REPLACE FUNCTION public.embe_search_family_health(p_query text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $f$
 WITH needle AS (SELECT left(trim(COALESCE(p_query,'')),60) q), records AS (
  SELECT id,'pregnancy' source,kind,occurred_at,title,provider,notes FROM portal_read_model.pregnancy_medical_record,needle WHERE deleted_at IS NULL AND char_length(needle.q)>=2 AND concat_ws(' ',title,provider,clinician,notes) ILIKE '%'||needle.q||'%'
  UNION ALL SELECT id,'baby',kind,occurred_at,title,provider,notes FROM portal_read_model.baby_medical_record,needle WHERE deleted_at IS NULL AND char_length(needle.q)>=2 AND concat_ws(' ',title,provider,clinician,notes,details::text) ILIKE '%'||needle.q||'%'
 ), marks AS (
  SELECT id,'milestone' source,domain kind,(observed_at::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') occurred_at,title,'' provider,notes FROM portal_read_model.baby_milestone,needle WHERE char_length(needle.q)>=2 AND concat_ws(' ',title,notes,domain) ILIKE '%'||needle.q||'%'
 ) SELECT COALESCE(jsonb_agg(to_jsonb(item) ORDER BY occurred_at DESC),'[]'::jsonb) FROM (SELECT * FROM records UNION ALL SELECT * FROM marks ORDER BY occurred_at DESC LIMIT 40) item;
$f$;
REVOKE ALL ON FUNCTION public.embe_search_family_health(text) FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION public.embe_search_family_health(text) TO service_role;

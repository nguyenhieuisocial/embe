-- The internal schema is deliberately not exposed through PostgREST. The
-- portal resolves one bounded upload through this service-role-only function.

CREATE OR REPLACE FUNCTION public.embe_get_photo_upload(p_upload_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'storage_path', upload.storage_path,
    'byte_size', upload.byte_size,
    'mime_type', upload.mime_type,
    'status', upload.status
  )
  FROM portal_read_model.photo_upload AS upload
  WHERE upload.id = p_upload_id;
$function$;

REVOKE ALL ON FUNCTION public.embe_get_photo_upload(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_get_photo_upload(uuid) TO service_role;

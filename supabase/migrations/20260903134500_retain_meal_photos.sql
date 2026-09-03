CREATE OR REPLACE FUNCTION public.embe_list_meal_history(p_days integer DEFAULT 7)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', entry.id, 'meal_type', entry.meal_type, 'eaten_at', entry.eaten_at,
    'note', entry.note, 'status', entry.status, 'has_image', entry.storage_path IS NOT NULL,
    'analysis', COALESCE(entry.confirmed_analysis, entry.analysis, jsonb_build_object(
      'entry_mode', 'note', 'foods', '[]'::jsonb, 'needs_user_confirmation', '[]'::jsonb,
      'estimate_notice', CASE WHEN entry.status IN ('failed', 'rejected')
        THEN 'Chưa nhận diện được; ghi chú vẫn được giữ lại.'
        ELSE 'Đang nhận diện món từ ghi chú.' END
    ))
  ) ORDER BY entry.eaten_at DESC), '[]'::jsonb)
  FROM portal_read_model.meal_analysis AS entry
  WHERE entry.status IN (
      'uploaded', 'analyzing', 'failed', 'rejected', 'review',
      'nutrition_pending', 'nutrition_processing', 'confirmed'
    )
    AND p_days BETWEEN 1 AND 30
    AND entry.eaten_at >= timezone('utc', now()) - make_interval(days => p_days);
$function$;

REVOKE ALL ON FUNCTION public.embe_list_meal_history(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_list_meal_history(integer) TO service_role;

COMMENT ON FUNCTION public.embe_list_meal_history(integer) IS
  'Private recent meal history including whether a retained source photo is available.';

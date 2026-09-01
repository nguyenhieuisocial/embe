CREATE OR REPLACE FUNCTION public.embe_list_meal_history(p_days integer DEFAULT 7)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', entry.id,
    'meal_type', entry.meal_type,
    'eaten_at', entry.eaten_at,
    'note', entry.note,
    'status', entry.status,
    'analysis', entry.confirmed_analysis
  ) ORDER BY entry.eaten_at DESC), '[]'::jsonb)
  FROM portal_read_model.meal_analysis AS entry
  WHERE entry.status IN ('nutrition_pending', 'nutrition_processing', 'confirmed')
    AND p_days BETWEEN 1 AND 30
    AND entry.eaten_at >= timezone('utc', now()) - make_interval(days => p_days);
$function$;

COMMENT ON FUNCTION public.embe_list_meal_history(integer) IS
  'Server-only meal history; saved meals remain visible while nutrition enrichment runs.';

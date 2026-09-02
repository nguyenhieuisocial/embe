CREATE OR REPLACE FUNCTION public.embe_confirm_meal_analysis(p_id uuid, p_confirmed_analysis jsonb, p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE result_row portal_read_model.meal_analysis%ROWTYPE;
BEGIN
  IF jsonb_typeof(p_confirmed_analysis) <> 'object'
     OR jsonb_typeof(p_confirmed_analysis -> 'foods') <> 'array'
     OR ((COALESCE(p_confirmed_analysis ->> 'entry_mode', '') = 'note') <>
         (jsonb_array_length(p_confirmed_analysis -> 'foods') = 0))
     OR char_length(COALESCE(btrim(p_note), '')) > 300
    THEN RAISE EXCEPTION 'invalid confirmed meal'; END IF;
  UPDATE portal_read_model.meal_analysis
  SET status = CASE WHEN p_confirmed_analysis ->> 'entry_mode' = 'note' THEN 'confirmed' ELSE 'nutrition_pending' END,
      confirmed_analysis = p_confirmed_analysis,
      note = btrim(COALESCE(p_note, '')), confirmed_at = timezone('utc', now())
  WHERE id = p_id AND status IN ('review', 'nutrition_pending', 'confirmed') RETURNING * INTO result_row;
  IF result_row.id IS NULL THEN RAISE EXCEPTION 'meal is not ready for confirmation'; END IF;
  RETURN jsonb_build_object('id', result_row.id, 'status', result_row.status,
    'meal_type', result_row.meal_type, 'eaten_at', result_row.eaten_at,
    'note', result_row.note, 'analysis', result_row.confirmed_analysis);
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_list_meal_history(p_days integer DEFAULT 7)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', entry.id, 'meal_type', entry.meal_type, 'eaten_at', entry.eaten_at,
    'note', entry.note, 'status', entry.status,
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

REVOKE ALL ON FUNCTION public.embe_confirm_meal_analysis(uuid,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_list_meal_history(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_confirm_meal_analysis(uuid,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_list_meal_history(integer) TO service_role;

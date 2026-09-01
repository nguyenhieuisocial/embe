ALTER TABLE portal_read_model.meal_analysis
  ALTER COLUMN original_filename DROP NOT NULL,
  ALTER COLUMN mime_type DROP NOT NULL,
  ALTER COLUMN byte_size DROP NOT NULL,
  ALTER COLUMN storage_path DROP NOT NULL;

ALTER TABLE portal_read_model.meal_analysis
  DROP CONSTRAINT IF EXISTS meal_analysis_original_filename_check,
  DROP CONSTRAINT IF EXISTS meal_analysis_mime_type_check,
  DROP CONSTRAINT IF EXISTS meal_analysis_byte_size_check,
  DROP CONSTRAINT IF EXISTS meal_analysis_storage_path_check;

ALTER TABLE portal_read_model.meal_analysis
  ADD CONSTRAINT meal_analysis_original_filename_check
    CHECK (original_filename IS NULL OR char_length(original_filename) BETWEEN 1 AND 180),
  ADD CONSTRAINT meal_analysis_mime_type_check
    CHECK (mime_type IS NULL OR mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  ADD CONSTRAINT meal_analysis_byte_size_check
    CHECK (byte_size IS NULL OR byte_size BETWEEN 1 AND 12000000),
  ADD CONSTRAINT meal_analysis_storage_path_check
    CHECK (storage_path IS NULL OR storage_path ~ '^incoming/[0-9]{4}/[0-9]{2}/[0-9a-f-]{36}\.(jpg|png|webp)$'),
  ADD CONSTRAINT meal_analysis_image_shape
    CHECK (num_nonnulls(original_filename, mime_type, byte_size, storage_path) IN (0, 4));

CREATE OR REPLACE FUNCTION public.embe_create_meal_note(
  p_idempotency_key uuid, p_author_role text, p_meal_type text,
  p_eaten_at timestamptz, p_note text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  entry_id uuid := gen_random_uuid();
  result_row portal_read_model.meal_analysis%ROWTYPE;
  note_text text := btrim(COALESCE(p_note, ''));
BEGIN
  IF p_idempotency_key IS NULL
     OR p_author_role NOT IN ('father', 'mother')
     OR p_meal_type NOT IN ('breakfast', 'lunch', 'dinner', 'snack')
     OR p_eaten_at IS NULL OR p_eaten_at < TIMESTAMPTZ '2000-01-01 00:00:00+00'
     OR p_eaten_at > timezone('utc', now()) + interval '1 day'
     OR char_length(note_text) NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION 'invalid meal note request';
  END IF;

  INSERT INTO portal_read_model.meal_analysis (
    id, idempotency_key, author_role, meal_type, eaten_at, note,
    status, confirmed_analysis, confirmed_at
  ) VALUES (
    entry_id, p_idempotency_key, p_author_role, p_meal_type, p_eaten_at, note_text,
    'confirmed', jsonb_build_object(
      'entry_mode', 'note', 'foods', '[]'::jsonb,
      'needs_user_confirmation', '[]'::jsonb,
      'estimate_notice', 'Bữa ăn được ghi bằng ghi chú, chưa có ước lượng dinh dưỡng.',
      'nutrition', jsonb_build_object(
        'status', 'unavailable',
        'notice', 'Ghi chú đã được lưu; chưa có ảnh hoặc khẩu phần để ước lượng dinh dưỡng.'
      )
    ), timezone('utc', now())
  ) ON CONFLICT (idempotency_key) DO NOTHING;

  SELECT * INTO result_row FROM portal_read_model.meal_analysis WHERE idempotency_key = p_idempotency_key;
  RETURN jsonb_build_object('id', result_row.id, 'status', result_row.status);
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_create_meal_note(uuid,text,text,timestamptz,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_create_meal_note(uuid,text,text,timestamptz,text) TO service_role;

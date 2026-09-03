BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SET ROLE postgres;
SET search_path = public, extensions, pg_temp;

SELECT plan(2);

SET ROLE service_role;
SELECT public.embe_create_meal_note(
  '951fe5a0-f59b-4f8c-8eb7-64fb2ef89256', 'mother', 'lunch',
  timezone('utc', now()), 'Bữa nhận diện lỗi'
);
UPDATE portal_read_model.meal_analysis
SET status = 'failed', last_error_code = 'recognition_failed'
WHERE idempotency_key = '951fe5a0-f59b-4f8c-8eb7-64fb2ef89256';
SELECT is(
  public.embe_confirm_meal_analysis(
    (SELECT id FROM portal_read_model.meal_analysis WHERE idempotency_key = '951fe5a0-f59b-4f8c-8eb7-64fb2ef89256'),
    '{"foods":[{"name_vi":"Cơm","search_name_en":"rice","estimated_grams":150,"confidence":0,"food_groups":["starch"],"safety_flags":["unknown"]}],"needs_user_confirmation":[],"estimate_notice":"Mẹ đã sửa"}'::jsonb,
    'Cơm'
  ) ->> 'status',
  'nutrition_pending',
  'A failed meal can be repaired manually'
);

SELECT public.embe_create_meal_note(
  '961fe5a0-f59b-4f8c-8eb7-64fb2ef89256', 'mother', 'dinner',
  timezone('utc', now()), 'Bữa đang bị kẹt'
);
SELECT public.embe_claim_meal_analysis();
SELECT public.embe_delete_meal_analysis(
  (SELECT id FROM portal_read_model.meal_analysis WHERE idempotency_key = '961fe5a0-f59b-4f8c-8eb7-64fb2ef89256')
);
SELECT is(
  (SELECT status || '|' || (deleted_at IS NOT NULL)::text
   FROM portal_read_model.meal_analysis
   WHERE idempotency_key = '961fe5a0-f59b-4f8c-8eb7-64fb2ef89256'),
  'deleted|true',
  'A stuck analyzing meal can be moved to trash safely'
);

SET ROLE postgres;
SELECT finish();
ROLLBACK;

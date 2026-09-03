-- Recalculate confirmed image meals that previously had no nutrition because
-- their Vietnamese fruit names were not covered by the local USDA mapping.

UPDATE portal_read_model.meal_analysis AS meal
SET status = 'nutrition_pending',
    confirmed_analysis = meal.confirmed_analysis - 'nutrition',
    attempts = 0,
    next_attempt_at = timezone('utc', now()),
    claimed_at = NULL,
    last_error_code = NULL
WHERE meal.status = 'confirmed'
  AND meal.storage_path IS NOT NULL
  AND meal.confirmed_analysis -> 'nutrition' ->> 'status' = 'unavailable'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(meal.confirmed_analysis -> 'foods', '[]'::jsonb)) AS food
    WHERE food ->> 'name_vi' IN ('Dưa hấu', 'Trái cây kiwi vàng', 'Kiwi vàng', 'Kiwi')
  );

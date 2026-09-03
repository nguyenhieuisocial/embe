-- Re-run old meal results after strengthening Vietnamese food identity mapping.
-- Written notes are intentionally untouched. Source photos remain private.

UPDATE portal_read_model.meal_analysis
SET status = 'nutrition_pending',
    confirmed_analysis = confirmed_analysis - 'nutrition',
    attempts = 0,
    next_attempt_at = timezone('utc', now()),
    claimed_at = NULL,
    last_error_code = NULL
WHERE status = 'confirmed'
  AND storage_path IS NOT NULL
  AND confirmed_analysis IS NOT NULL
  AND COALESCE(confirmed_analysis ->> 'entry_mode', '') <> 'note';

-- The source image is still present for these rows. Retry recognition with the
-- larger structured-output budget instead of asking the family to upload again.
UPDATE portal_read_model.meal_analysis
SET status = 'uploaded',
    attempts = 0,
    next_attempt_at = timezone('utc', now()),
    claimed_at = NULL,
    last_error_code = NULL
WHERE status IN ('failed', 'rejected')
  AND storage_path IS NOT NULL
  AND last_error_code = 'invalid_vision_output';

BEGIN;

WITH unsynced AS (
  SELECT id, row_number() OVER (ORDER BY created_at DESC, id DESC) AS position
  FROM portal_read_model.iphone_health_device
  WHERE active AND last_synced_at IS NULL
)
UPDATE portal_read_model.iphone_health_device AS device
SET active = false
FROM unsynced
WHERE device.id = unsynced.id AND unsynced.position > 1;

COMMIT;

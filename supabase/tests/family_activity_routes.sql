BEGIN;

SELECT plan(4);

SELECT ok(
  has_function_privilege('service_role', 'public.embe_enqueue_family_activity(uuid,text,text)', 'EXECUTE'),
  'Server can enqueue private family activity notifications'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.embe_enqueue_family_activity(uuid,text,text)', 'EXECUTE'),
  'Anonymous clients cannot enqueue family activity notifications'
);

INSERT INTO portal_read_model.push_subscription (
  endpoint, p256dh, auth, device_role, timezone, notify_at
) VALUES
  ('https://push.example.test/family-route-mother', repeat('a', 87), repeat('b', 22), 'mother', 'Asia/Ho_Chi_Minh', TIME '08:00'),
  ('https://push.example.test/family-route-father', repeat('c', 87), repeat('d', 22), 'father', 'Asia/Ho_Chi_Minh', TIME '08:00');

SET ROLE service_role;
SELECT public.embe_enqueue_family_activity(
  '11111111-1111-4111-8111-111111111111',
  'https://push.example.test/family-route-mother',
  'meal'
);
SELECT public.embe_enqueue_family_activity(
  '22222222-2222-4222-8222-222222222222',
  'https://push.example.test/family-route-mother',
  'health'
);
RESET ROLE;

SELECT is(
  (SELECT bool_and(target_url = '/me-bau/bua-an') FROM portal_read_model.push_delivery
   WHERE notification_key = 'activity:11111111-1111-4111-8111-111111111111'),
  true,
  'Meal activity opens the focused meal screen'
);
SELECT is(
  (SELECT bool_and(target_url = '/me-bau/suc-khoe') FROM portal_read_model.push_delivery
   WHERE notification_key = 'activity:22222222-2222-4222-8222-222222222222'),
  true,
  'Health activity opens the focused health screen'
);

SELECT * FROM finish();
ROLLBACK;

create or replace function public.embe_push_family_status()
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'mother', count(*) filter (where device_role = 'mother'),
    'father', count(*) filter (where device_role = 'father'),
    'family', count(*) filter (where device_role = 'family')
  )
  from portal_read_model.push_subscription
  where enabled;
$$;

revoke all on function public.embe_push_family_status() from public, anon, authenticated;
grant execute on function public.embe_push_family_status() to service_role;

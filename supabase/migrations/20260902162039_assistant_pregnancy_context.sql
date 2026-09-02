create or replace function public.embe_assistant_pregnancy_context(p_days integer default 7)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare result jsonb;
begin
  if p_days not between 7 and 30 then
    raise exception 'invalid context period';
  end if;

  select jsonb_build_object(
    'due_date', (select due_date from portal_read_model.pregnancy_profile where singleton),
    'health', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.day)
      from (
        select day, weight_kg, systolic, diastolic, sleep_minutes, water_glasses,
          movement_minutes, mood, blood_glucose_mg_dl, glucose_context,
          fetal_movement_count, symptoms
        from portal_read_model.pregnancy_health
        where day >= current_date - (p_days - 1)
        order by day desc limit 30
      ) item
    ), '[]'::jsonb),
    'meals', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.eaten_at)
      from (
        select eaten_at, meal_type, note,
          confirmed_analysis -> 'foods' as foods,
          confirmed_analysis -> 'nutrition' -> 'totals' as nutrition_totals
        from portal_read_model.meal_analysis
        where status = 'confirmed' and deleted_at is null
          and eaten_at >= timezone('utc', now()) - make_interval(days => p_days)
        order by eaten_at desc limit 21
      ) item
    ), '[]'::jsonb),
    'active_care_plans', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.name)
      from (
        select name, category, dose_display, times_per_day, instructions, confirmed_by_clinician
        from portal_read_model.pregnancy_care_plan where active order by name limit 20
      ) item
    ), '[]'::jsonb),
    'upcoming_appointments', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.occurred_at)
      from (
        select occurred_at, title, provider, clinician
        from portal_read_model.pregnancy_medical_record
        where deleted_at is null and status = 'planned'
          and occurred_at between timezone('utc', now()) and timezone('utc', now()) + interval '60 days'
        order by occurred_at limit 8
      ) item
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.embe_assistant_pregnancy_context(integer) from public, anon, authenticated;
grant execute on function public.embe_assistant_pregnancy_context(integer) to service_role;

comment on function public.embe_assistant_pregnancy_context(integer) is
  'Bounded, service-only family-entered pregnancy aggregates for the loopback assistant; excludes documents, media and exact location.';

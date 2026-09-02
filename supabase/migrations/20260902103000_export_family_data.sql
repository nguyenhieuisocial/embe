BEGIN;

CREATE OR REPLACE FUNCTION public.embe_export_family_data_v1()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT jsonb_build_object(
    'schema_version', 'embe-family-export/v1',
    'generated_at', timezone('utc', now()),
    'data', jsonb_build_object(
      'family_profile', COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
        SELECT role, birth_date, updated_at FROM portal_read_model.family_parent_profile ORDER BY role
      ) AS row_data), '[]'::jsonb),
      'pregnancy', jsonb_build_object(
        'profiles', COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
          SELECT due_date, updated_at FROM portal_read_model.pregnancy_profile
        ) AS row_data), '[]'::jsonb),
        'days', COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
          SELECT day, updated_at FROM portal_read_model.pregnancy_day ORDER BY day
        ) AS row_data), '[]'::jsonb),
        'checks', COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
          SELECT day, task_id, updated_at FROM portal_read_model.pregnancy_check ORDER BY day, task_id
        ) AS row_data), '[]'::jsonb),
        'health', COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
          SELECT day, weight_kg, systolic, diastolic, sleep_minutes, water_glasses,
                 movement_minutes, wellbeing, blood_glucose_mg_dl, glucose_context,
                 fetal_movement_count, symptoms, health_note, updated_at
          FROM portal_read_model.pregnancy_health ORDER BY day
        ) AS row_data), '[]'::jsonb),
        'wellness', COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
          SELECT birth_date, height_cm, pre_pregnancy_weight_kg, activity_level,
                 clinician_energy_target_kcal, lmp_date, due_date_source, gestation_type,
                 blood_group, rh_factor, allergies, medical_notes, updated_at
          FROM portal_read_model.pregnancy_wellness_profile
        ) AS row_data), '[]'::jsonb),
        'care_plans', COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
          SELECT id, category, name, dose_display, times_per_day, instructions,
                 nutrient_amounts, confirmed_by_clinician, active, created_at, updated_at
          FROM portal_read_model.pregnancy_care_plan ORDER BY created_at, id
        ) AS row_data), '[]'::jsonb),
        'care_intakes', COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
          SELECT plan_id, day, slot, status, reason, taken_at
          FROM portal_read_model.pregnancy_care_intake ORDER BY day, plan_id, slot
        ) AS row_data), '[]'::jsonb),
        'care_contacts', COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
          SELECT id, kind, name, organization, phone, note, is_primary, active, created_at, updated_at
          FROM portal_read_model.pregnancy_care_contact ORDER BY created_at, id
        ) AS row_data), '[]'::jsonb),
        'symptoms', COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
          SELECT id, occurred_at, symptoms, severity, status, mood, worry, mental_note, notes, created_at
          FROM portal_read_model.pregnancy_symptom_entry ORDER BY occurred_at, id
        ) AS row_data), '[]'::jsonb),
        'medical_records', COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
          SELECT id, kind, status, occurred_at, title, provider, clinician, notes,
                 gestational_week, next_appointment_at, measurements, medicines,
                 created_at, updated_at, deleted_at
          FROM portal_read_model.pregnancy_medical_record ORDER BY occurred_at, id
        ) AS row_data), '[]'::jsonb),
        'medical_documents', COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
          SELECT id, record_id, original_filename, mime_type, byte_size, status, created_at, ready_at
          FROM portal_read_model.pregnancy_medical_document ORDER BY created_at, id
        ) AS row_data), '[]'::jsonb),
        'iphone_health_daily', COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
          SELECT day, steps, active_energy_kcal, resting_energy_kcal, sleep_minutes,
                 weight_kg, height_cm, distance_m, water_ml, heart_rate_avg,
                 resting_heart_rate_bpm, respiratory_rate, oxygen_saturation_percent,
                 body_temperature_c, wrist_temperature_c, hrv_ms, exercise_minutes,
                 mindfulness_minutes, systolic, diastolic, metric_synced_at, updated_at
          FROM portal_read_model.iphone_health_daily ORDER BY day
        ) AS row_data), '[]'::jsonb),
        'birth_preparation', COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
          SELECT hospital_name, hospital_address, hospital_phone, support_phone,
                 preferences, clinician_notes, updated_at FROM portal_read_model.birth_preparation
        ) AS row_data), '[]'::jsonb),
        'contractions', COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
          SELECT id, started_at, ended_at, created_at
          FROM portal_read_model.contraction_event ORDER BY started_at, id
        ) AS row_data), '[]'::jsonb)
      ),
      'tasks', jsonb_build_object(
        'items', COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
          SELECT id, title, note, owner_role, category, link_target, due_on, due_time,
                 repeat_rule, created_at, updated_at, deleted_at
          FROM portal_read_model.family_task ORDER BY due_on, id
        ) AS row_data), '[]'::jsonb),
        'completions', COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
          SELECT task_id, occurrence_on, completed_by, completed_at
          FROM portal_read_model.family_task_completion ORDER BY occurrence_on, task_id
        ) AS row_data), '[]'::jsonb)
      ),
      'meals', COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
        SELECT id, author_role, meal_type, eaten_at, note, mime_type, byte_size, status,
               confirmed_analysis, created_at, uploaded_at, analyzed_at, confirmed_at,
               deleted_at, updated_at
        FROM portal_read_model.meal_analysis ORDER BY eaten_at, id
      ) AS row_data), '[]'::jsonb),
      'lifecycle', COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
        SELECT birth_occurred_at, birth_method, baby_sex, gestational_weeks, gestational_days,
               birth_weight_g, birth_length_cm, birth_head_cm, birth_facility,
               birth_clinician, premature, low_birth_weight, special_monitoring,
               special_monitoring_notes, discharged_at, discharge_notes, created_at, updated_at
        FROM portal_read_model.family_lifecycle
      ) AS row_data), '[]'::jsonb),
      'postpartum', COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
        SELECT day, lochia, pain, temperature_c, systolic, diastolic, wound_status,
               urination, digestion, pelvic_pain, breast_discomfort, feeding_difficulty,
               sleep_minutes, exhaustion, support, mood, phq2_interest, phq2_depressed,
               notes, created_at, updated_at
        FROM portal_read_model.postpartum_health_day ORDER BY day
      ) AS row_data), '[]'::jsonb),
      'baby', jsonb_build_object(
        'care_events', COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
          SELECT id, kind, occurred_at, ended_at, caregiver, details, sync_status,
                 created_at, updated_at, deleted_at
          FROM portal_read_model.baby_care_event ORDER BY occurred_at, id
        ) AS row_data), '[]'::jsonb),
        'medical_records', COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
          SELECT id, kind, status, occurred_at, title, provider, clinician, notes,
                 next_due_at, details, created_at, updated_at, deleted_at
          FROM portal_read_model.baby_medical_record ORDER BY occurred_at, id
        ) AS row_data), '[]'::jsonb),
        'medical_documents', COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
          SELECT id, record_id, original_filename, mime_type, byte_size, status, created_at, ready_at
          FROM portal_read_model.baby_medical_document ORDER BY created_at, id
        ) AS row_data), '[]'::jsonb),
        'growth', COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
          SELECT id, measured_at, weight_g, length_cm, head_cm, provider, notes, created_at
          FROM portal_read_model.baby_growth_entry ORDER BY measured_at, id
        ) AS row_data), '[]'::jsonb),
        'milestones', COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
          SELECT id, observed_at, domain, title, notes, question_for_clinician, created_at
          FROM portal_read_model.baby_milestone ORDER BY observed_at, id
        ) AS row_data), '[]'::jsonb)
      ),
      'inventory', jsonb_build_object(
        'items', COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
          SELECT name, quantity, unit, min_quantity, needs_restock, active, updated_at
          FROM portal_read_model.inventory_item ORDER BY name
        ) AS row_data), '[]'::jsonb),
        'actions', COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
          SELECT id, action_type, name, category, unit, amount, min_amount,
                 status, created_at, completed_at
          FROM portal_read_model.inventory_action ORDER BY created_at, id
        ) AS row_data), '[]'::jsonb)
      ),
      'journal', jsonb_build_object(
        'entries', COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
          SELECT id, author_role, status, created_at, imported_at
          FROM portal_read_model.journal_inbox ORDER BY created_at, id
        ) AS row_data), '[]'::jsonb),
        'memories', COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
          SELECT id, event_at, title, caption, mime_type, width, height, place_city,
                 place_region, place_country, album_key, album_title, album_order,
                 approved, approved_at, created_at, updated_at
          FROM portal_read_model.media_item ORDER BY event_at, id
        ) AS row_data), '[]'::jsonb),
        'uploads', COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
          SELECT id, author_role, caption, captured_at, location_name, status, created_at
          FROM portal_read_model.photo_upload ORDER BY captured_at, id
        ) AS row_data), '[]'::jsonb),
        'reactions', COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
          SELECT media_item_id, author_role, emoji, created_at, updated_at
          FROM portal_read_model.media_reaction ORDER BY created_at, media_item_id, author_role
        ) AS row_data), '[]'::jsonb)
      )
    )
  );
$function$;

REVOKE ALL ON FUNCTION public.embe_export_family_data_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_export_family_data_v1() TO service_role;

COMMENT ON FUNCTION public.embe_export_family_data_v1() IS
  'Versioned family-entered JSON export with fixed safe projections; excludes credentials, provider locators and binary media.';

COMMIT;

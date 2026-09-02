CREATE TABLE portal_read_model.family_expense (
  id uuid PRIMARY KEY,
  incurred_on date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('planned', 'actual')),
  category text NOT NULL CHECK (category IN ('pregnancy_visit', 'test', 'medicine', 'baby_supply', 'birth', 'travel', 'other')),
  amount_vnd bigint NOT NULL CHECK (amount_vnd BETWEEN 0 AND 1000000000),
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 120),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  deleted_at timestamptz
);
CREATE INDEX family_expense_active_day_idx ON portal_read_model.family_expense (incurred_on DESC, id) WHERE deleted_at IS NULL;
ALTER TABLE portal_read_model.family_expense ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.family_expense FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE portal_read_model.family_expense FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE portal_read_model.family_expense TO service_role;
CREATE POLICY family_expense_deny_clients ON portal_read_model.family_expense
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.embe_list_family_expenses(p_limit integer DEFAULT 200)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $f$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', entry.id, 'incurred_on', entry.incurred_on, 'kind', entry.kind,
    'category', entry.category, 'amount_vnd', entry.amount_vnd,
    'description', entry.description, 'note', entry.note,
    'created_at', entry.created_at, 'updated_at', entry.updated_at
  ) ORDER BY entry.incurred_on DESC, entry.created_at DESC), '[]'::jsonb)
  FROM (
    SELECT * FROM portal_read_model.family_expense
    WHERE deleted_at IS NULL ORDER BY incurred_on DESC, created_at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 500)
  ) AS entry;
$f$;

CREATE OR REPLACE FUNCTION public.embe_save_family_expense(
  p_id uuid, p_incurred_on date, p_kind text, p_category text,
  p_amount_vnd bigint, p_description text, p_note text DEFAULT ''
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $f$
DECLARE result jsonb;
BEGIN
  IF p_kind NOT IN ('planned', 'actual')
    OR p_category NOT IN ('pregnancy_visit', 'test', 'medicine', 'baby_supply', 'birth', 'travel', 'other')
    OR p_amount_vnd < 0 OR p_amount_vnd > 1000000000
    OR char_length(trim(p_description)) NOT BETWEEN 1 AND 120
    OR char_length(trim(COALESCE(p_note, ''))) > 500 THEN RAISE EXCEPTION 'invalid family expense'; END IF;
  INSERT INTO portal_read_model.family_expense (id, incurred_on, kind, category, amount_vnd, description, note)
  VALUES (p_id, p_incurred_on, p_kind, p_category, p_amount_vnd, trim(p_description), trim(COALESCE(p_note, '')))
  ON CONFLICT (id) DO UPDATE SET incurred_on = EXCLUDED.incurred_on, kind = EXCLUDED.kind,
    category = EXCLUDED.category, amount_vnd = EXCLUDED.amount_vnd,
    description = EXCLUDED.description, note = EXCLUDED.note,
    deleted_at = NULL, updated_at = timezone('utc', now());
  SELECT jsonb_build_object(
    'id', entry.id, 'incurred_on', entry.incurred_on, 'kind', entry.kind,
    'category', entry.category, 'amount_vnd', entry.amount_vnd,
    'description', entry.description, 'note', entry.note,
    'created_at', entry.created_at, 'updated_at', entry.updated_at
  ) INTO result FROM portal_read_model.family_expense AS entry WHERE entry.id = p_id;
  RETURN result;
END;
$f$;

CREATE OR REPLACE FUNCTION public.embe_set_family_expense_deleted(p_id uuid, p_deleted boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $f$
DECLARE changed integer;
BEGIN
  UPDATE portal_read_model.family_expense SET
    deleted_at = CASE WHEN p_deleted THEN timezone('utc', now()) ELSE NULL END,
    updated_at = timezone('utc', now())
  WHERE id = p_id;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END;
$f$;

REVOKE ALL ON FUNCTION public.embe_list_family_expenses(integer),
  public.embe_save_family_expense(uuid, date, text, text, bigint, text, text),
  public.embe_set_family_expense_deleted(uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_list_family_expenses(integer),
  public.embe_save_family_expense(uuid, date, text, text, bigint, text, text),
  public.embe_set_family_expense_deleted(uuid, boolean)
  TO service_role;

CREATE OR REPLACE FUNCTION public.embe_export_family_data_v2()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $f$
  SELECT jsonb_set(
    jsonb_set(
      jsonb_set(
        public.embe_export_family_data_v1(),
        '{data,pregnancy,mental_health}',
        public.embe_export_pregnancy_mental_health(),
        true
      ),
      '{data,pregnancy,fetal_movement_sessions}',
      COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
        SELECT id, started_at, ended_at, movement_count, last_movement_at, note, created_at, updated_at
        FROM portal_read_model.fetal_movement_session ORDER BY started_at, id
      ) AS row_data), '[]'::jsonb), true
    ),
    '{data,budget}',
    COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
      SELECT id, incurred_on, kind, category, amount_vnd, description, note,
             created_at, updated_at, deleted_at
      FROM portal_read_model.family_expense ORDER BY incurred_on, id
    ) AS row_data), '[]'::jsonb), true
  );
$f$;
REVOKE ALL ON FUNCTION public.embe_export_family_data_v2() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_export_family_data_v2() TO service_role;

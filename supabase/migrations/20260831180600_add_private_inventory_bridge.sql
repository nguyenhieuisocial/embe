-- Private Grocy projection and idempotent command queue for the family Portal.
-- Browser clients can access neither table; authenticated Portal routes use the
-- service role and the local worker is the only Grocy data-plane consumer.

CREATE TABLE portal_read_model.inventory_item (
  source_product_id bigint PRIMARY KEY CHECK (source_product_id BETWEEN 1 AND 2147483647),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  quantity numeric(14,3) NOT NULL CHECK (quantity BETWEEN 0 AND 100000),
  unit text NOT NULL CHECK (unit IN ('cái', 'gói', 'hộp', 'ml', 'g')),
  min_quantity numeric(14,3) NOT NULL CHECK (min_quantity BETWEEN 0 AND 100000),
  needs_restock boolean NOT NULL,
  active boolean NOT NULL DEFAULT true,
  source_updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX inventory_item_active_priority_idx
  ON portal_read_model.inventory_item (needs_restock DESC, name)
  WHERE active = true;

CREATE TABLE portal_read_model.inventory_action (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key uuid NOT NULL UNIQUE,
  action_type text NOT NULL CHECK (action_type IN ('create', 'set_amount')),
  product_id bigint CHECK (product_id BETWEEN 1 AND 2147483647),
  name text,
  category text CHECK (category IN ('baby', 'nutrition', 'mother', 'other')),
  unit text CHECK (unit IN ('cái', 'gói', 'hộp', 'ml', 'g')),
  amount numeric(14,3) NOT NULL CHECK (amount BETWEEN 0 AND 100000),
  min_amount numeric(14,3) CHECK (min_amount BETWEEN 0 AND 100000),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'dead_letter')),
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  claimed_at timestamptz,
  completed_at timestamptz,
  last_error_code text,
  CONSTRAINT inventory_action_shape_check CHECK (
    (action_type = 'create'
      AND product_id IS NULL
      AND char_length(btrim(name)) BETWEEN 1 AND 80
      AND category IS NOT NULL
      AND unit IS NOT NULL
      AND min_amount IS NOT NULL)
    OR
    (action_type = 'set_amount'
      AND product_id IS NOT NULL
      AND name IS NULL
      AND category IS NULL
      AND unit IS NULL
      AND min_amount IS NULL)
  )
);

CREATE INDEX inventory_action_work_idx
  ON portal_read_model.inventory_action (status, created_at)
  WHERE status IN ('pending', 'processing');

COMMENT ON TABLE portal_read_model.inventory_item IS
  'Server-only, bounded Grocy projection; no notes, price history, credentials or supplier data.';
COMMENT ON TABLE portal_read_model.inventory_action IS
  'Idempotent family inventory commands processed by the local Grocy worker.';

ALTER TABLE portal_read_model.inventory_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.inventory_item FORCE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.inventory_action ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.inventory_action FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE portal_read_model.inventory_item FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE portal_read_model.inventory_action FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE portal_read_model.inventory_item TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE portal_read_model.inventory_action TO service_role;

CREATE POLICY inventory_item_deny_clients ON portal_read_model.inventory_item
FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY inventory_action_deny_clients ON portal_read_model.inventory_action
FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE VIEW public.embe_inventory_item
WITH (security_invoker = true)
AS
SELECT source_product_id, name, quantity, unit, min_quantity, needs_restock
FROM portal_read_model.inventory_item
WHERE active = true;

REVOKE ALL ON TABLE public.embe_inventory_item FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.embe_inventory_item TO service_role;

CREATE OR REPLACE FUNCTION public.embe_submit_inventory_action(
  p_idempotency_key uuid,
  p_action_type text,
  p_product_id bigint,
  p_name text,
  p_category text,
  p_unit text,
  p_amount numeric,
  p_min_amount numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  saved_id uuid;
  clean_name text := CASE WHEN p_name IS NULL THEN NULL ELSE btrim(p_name) END;
BEGIN
  IF p_idempotency_key IS NULL
     OR p_action_type NOT IN ('create', 'set_amount')
     OR p_amount IS NULL OR p_amount NOT BETWEEN 0 AND 100000
     OR (
       p_action_type = 'create' AND (
         p_product_id IS NOT NULL
         OR char_length(clean_name) NOT BETWEEN 1 AND 80
         OR p_category NOT IN ('baby', 'nutrition', 'mother', 'other')
         OR p_unit NOT IN ('cái', 'gói', 'hộp', 'ml', 'g')
         OR p_min_amount IS NULL OR p_min_amount NOT BETWEEN 0 AND 100000
       )
     )
     OR (
       p_action_type = 'set_amount' AND (
         p_product_id IS NULL OR p_product_id NOT BETWEEN 1 AND 2147483647
         OR p_name IS NOT NULL OR p_category IS NOT NULL OR p_unit IS NOT NULL OR p_min_amount IS NOT NULL
       )
     ) THEN
    RAISE EXCEPTION 'invalid inventory action';
  END IF;

  INSERT INTO portal_read_model.inventory_action (
    idempotency_key, action_type, product_id, name, category, unit, amount, min_amount
  ) VALUES (
    p_idempotency_key, p_action_type, p_product_id, clean_name, p_category, p_unit, p_amount, p_min_amount
  )
  ON CONFLICT (idempotency_key) DO UPDATE
  SET idempotency_key = EXCLUDED.idempotency_key
  RETURNING id INTO saved_id;

  RETURN saved_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_claim_inventory_actions(p_limit integer DEFAULT 10)
RETURNS TABLE (
  id uuid, action_type text, product_id bigint, name text, category text,
  unit text, amount numeric, min_amount numeric
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF p_limit NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'invalid inventory claim limit'; END IF;
  RETURN QUERY
  WITH candidates AS (
    SELECT queue.id
    FROM portal_read_model.inventory_action AS queue
    WHERE queue.attempts < 5
      AND (queue.status = 'pending'
        OR (queue.status = 'processing' AND queue.claimed_at < timezone('utc', now()) - interval '10 minutes'))
    ORDER BY queue.created_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE portal_read_model.inventory_action AS queue
  SET status = 'processing', attempts = queue.attempts + 1,
      claimed_at = timezone('utc', now()), last_error_code = NULL
  FROM candidates
  WHERE queue.id = candidates.id
  RETURNING queue.id, queue.action_type, queue.product_id, queue.name,
            queue.category, queue.unit, queue.amount, queue.min_amount;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_complete_inventory_action(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  UPDATE portal_read_model.inventory_action
  SET status = 'completed', completed_at = timezone('utc', now()), claimed_at = NULL,
      name = CASE WHEN action_type = 'create' THEN name ELSE NULL END,
      last_error_code = NULL
  WHERE id = p_id AND status = 'processing';
  IF NOT FOUND THEN RAISE EXCEPTION 'inventory action is not processing'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_fail_inventory_action(p_id uuid, p_error_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF p_error_code NOT IN ('invalid_payload', 'grocy_unavailable') THEN
    RAISE EXCEPTION 'invalid inventory failure code';
  END IF;
  UPDATE portal_read_model.inventory_action
  SET status = CASE WHEN attempts >= 5 OR p_error_code = 'invalid_payload' THEN 'dead_letter' ELSE 'pending' END,
      claimed_at = NULL, last_error_code = p_error_code
  WHERE id = p_id AND status = 'processing';
  IF NOT FOUND THEN RAISE EXCEPTION 'inventory action is not processing'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_sync_inventory(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  upserted_count integer := 0;
  retired_count integer := 0;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) > 500 THEN
    RAISE EXCEPTION 'p_items must be a bounded array';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_items) AS item(
      source_product_id bigint, name text, quantity numeric, unit text,
      min_quantity numeric, needs_restock boolean
    )
    WHERE item.source_product_id NOT BETWEEN 1 AND 2147483647
       OR char_length(btrim(item.name)) NOT BETWEEN 1 AND 80
       OR item.quantity NOT BETWEEN 0 AND 100000
       OR item.unit NOT IN ('cái', 'gói', 'hộp', 'ml', 'g')
       OR item.min_quantity NOT BETWEEN 0 AND 100000
       OR item.needs_restock IS NULL
  ) THEN
    RAISE EXCEPTION 'inventory item failed publication contract';
  END IF;

  INSERT INTO portal_read_model.inventory_item (
    source_product_id, name, quantity, unit, min_quantity, needs_restock, active,
    source_updated_at, updated_at
  )
  SELECT item.source_product_id, btrim(item.name), item.quantity, item.unit,
         item.min_quantity, item.needs_restock, true,
         timezone('utc', now()), timezone('utc', now())
  FROM jsonb_to_recordset(p_items) AS item(
    source_product_id bigint, name text, quantity numeric, unit text,
    min_quantity numeric, needs_restock boolean
  )
  ON CONFLICT (source_product_id) DO UPDATE
  SET name = EXCLUDED.name, quantity = EXCLUDED.quantity, unit = EXCLUDED.unit,
      min_quantity = EXCLUDED.min_quantity, needs_restock = EXCLUDED.needs_restock,
      active = true, source_updated_at = EXCLUDED.source_updated_at,
      updated_at = EXCLUDED.updated_at;
  GET DIAGNOSTICS upserted_count = ROW_COUNT;

  UPDATE portal_read_model.inventory_item AS existing
  SET active = false, updated_at = timezone('utc', now())
  WHERE existing.active = true
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_to_recordset(p_items) AS item(source_product_id bigint)
      WHERE item.source_product_id = existing.source_product_id
    );
  GET DIAGNOSTICS retired_count = ROW_COUNT;

  RETURN jsonb_build_object('upserted', upserted_count, 'retired', retired_count);
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_inventory_queue_status()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'pending', count(*) FILTER (WHERE status = 'pending'),
    'processing', count(*) FILTER (WHERE status = 'processing'),
    'dead_letters', count(*) FILTER (WHERE status = 'dead_letter')
  )
  FROM portal_read_model.inventory_action;
$function$;

REVOKE ALL ON FUNCTION public.embe_submit_inventory_action(uuid, text, bigint, text, text, text, numeric, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_claim_inventory_actions(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_complete_inventory_action(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_fail_inventory_action(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_sync_inventory(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_inventory_queue_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_submit_inventory_action(uuid, text, bigint, text, text, text, numeric, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_claim_inventory_actions(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_complete_inventory_action(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_fail_inventory_action(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_sync_inventory(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_inventory_queue_status() TO service_role;

-- The portal is now authoritative. Preserve Grocy data; never replay cloud
-- commands into Grocy or accept an old snapshot over newer cloud quantities.
SET lock_timeout = '5s';
LOCK TABLE portal_read_model.inventory_action, portal_read_model.inventory_item
  IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM portal_read_model.inventory_action WHERE status <> 'completed') THEN
    RAISE EXCEPTION 'Resolve legacy inventory actions before cloud cutover';
  END IF;
END $$;

ALTER TABLE portal_read_model.inventory_item ADD COLUMN category text
  CHECK (category IN ('baby', 'nutrition', 'mother', 'other'));
ALTER TABLE portal_read_model.inventory_action
  ADD COLUMN result_product_id bigint REFERENCES portal_read_model.inventory_item(source_product_id),
  ADD COLUMN previous_amount numeric(14,3);
CREATE SEQUENCE portal_read_model.inventory_cloud_product_id_seq
  AS bigint MINVALUE 1 MAXVALUE 2147483647;
SELECT setval('portal_read_model.inventory_cloud_product_id_seq',
  greatest(coalesce((SELECT max(source_product_id) FROM portal_read_model.inventory_item),0)+1,1),false);
REVOKE ALL ON SEQUENCE portal_read_model.inventory_cloud_product_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SEQUENCE portal_read_model.inventory_cloud_product_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.embe_submit_inventory_action(
  p_idempotency_key uuid, p_action_type text, p_product_id bigint, p_name text,
  p_category text, p_unit text, p_amount numeric, p_min_amount numeric
)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  saved portal_read_model.inventory_action%ROWTYPE;
  saved_id uuid;
  item_id bigint;
  old_amount numeric;
  clean_name text := btrim(p_name);
BEGIN
  IF p_idempotency_key IS NULL OR p_action_type IS NULL
    OR p_action_type NOT IN ('create','set_amount')
    OR p_amount IS NULL OR p_amount NOT BETWEEN 0 AND 100000
    OR (p_action_type = 'create' AND (
      p_product_id IS NOT NULL OR clean_name IS NULL
      OR char_length(clean_name) NOT BETWEEN 1 AND 80 OR clean_name ~ '[[:cntrl:]]'
      OR p_category IS NULL OR p_category NOT IN ('baby','nutrition','mother','other')
      OR p_unit IS NULL OR p_unit NOT IN ('cái','gói','hộp','ml','g')
      OR p_min_amount IS NULL OR p_min_amount NOT BETWEEN 0 AND 100000))
    OR (p_action_type = 'set_amount' AND (
      p_product_id IS NULL OR p_product_id NOT BETWEEN 1 AND 2147483647
      OR p_name IS NOT NULL OR p_category IS NOT NULL
      OR p_unit IS NOT NULL OR p_min_amount IS NOT NULL)) THEN
    RAISE EXCEPTION 'invalid inventory action' USING ERRCODE = '22023';
  END IF;

  INSERT INTO portal_read_model.inventory_action
    (idempotency_key,action_type,product_id,name,category,unit,amount,min_amount,status)
  VALUES (p_idempotency_key,p_action_type,p_product_id,clean_name,p_category,p_unit,
    p_amount,p_min_amount,'processing')
  ON CONFLICT (idempotency_key) DO NOTHING RETURNING id INTO saved_id;
  IF saved_id IS NULL THEN
    SELECT * INTO STRICT saved FROM portal_read_model.inventory_action
      WHERE idempotency_key = p_idempotency_key;
    IF saved.action_type IS DISTINCT FROM p_action_type
      OR saved.product_id IS DISTINCT FROM p_product_id OR saved.name IS DISTINCT FROM clean_name
      OR saved.category IS DISTINCT FROM p_category OR saved.unit IS DISTINCT FROM p_unit
      OR saved.amount IS DISTINCT FROM round(p_amount,3)
      OR saved.min_amount IS DISTINCT FROM round(p_min_amount,3) THEN
      RAISE EXCEPTION 'inventory idempotency conflict' USING ERRCODE = '22023';
    END IF;
    RETURN saved.id;
  END IF;

  IF p_action_type = 'create' THEN
    -- A short lock serializes duplicate-name and capacity checks for two phones.
    LOCK TABLE portal_read_model.inventory_item IN SHARE ROW EXCLUSIVE MODE;
    IF EXISTS (SELECT 1 FROM portal_read_model.inventory_item
      WHERE active AND lower(btrim(name)) = lower(clean_name)) THEN
      RAISE EXCEPTION 'inventory item already exists' USING ERRCODE = '23505';
    END IF;
    IF (SELECT count(*) FROM portal_read_model.inventory_item WHERE active) >= 500 THEN
      RAISE EXCEPTION 'inventory item limit reached' USING ERRCODE = '22023';
    END IF;
    INSERT INTO portal_read_model.inventory_item
      (source_product_id,name,category,quantity,unit,min_quantity,needs_restock)
    VALUES (nextval('portal_read_model.inventory_cloud_product_id_seq'),clean_name,p_category,
      p_amount,p_unit,p_min_amount,round(p_amount,3) <= round(p_min_amount,3))
    RETURNING source_product_id INTO item_id;
  ELSE
    SELECT quantity INTO old_amount FROM portal_read_model.inventory_item
      WHERE source_product_id = p_product_id AND active FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'inventory item not found' USING ERRCODE = '22023';
    END IF;
    item_id := p_product_id;
    UPDATE portal_read_model.inventory_item SET quantity = p_amount,
      needs_restock = round(p_amount,3) <= min_quantity,
      source_updated_at = now(), updated_at = now()
      WHERE source_product_id = item_id;
  END IF;
  UPDATE portal_read_model.inventory_action SET status = 'completed', completed_at = now(),
    result_product_id = item_id, previous_amount = old_amount WHERE id = saved_id;
  RETURN saved_id;
END $$;

CREATE OR REPLACE FUNCTION public.embe_claim_inventory_actions(p_limit integer DEFAULT 10)
RETURNS TABLE (id uuid, action_type text, product_id bigint, name text, category text,
  unit text, amount numeric, min_amount numeric)
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT a.id,a.action_type,a.product_id,a.name,a.category,a.unit,a.amount,a.min_amount
  FROM portal_read_model.inventory_action a WHERE false;
$$;
CREATE OR REPLACE FUNCTION public.embe_sync_inventory(p_items jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object('upserted',0,'retired',0,'mode','cloud');
$$;
CREATE OR REPLACE FUNCTION public.embe_inventory_queue_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object('mode','cloud',
    'pending',count(*) FILTER(WHERE status='pending'),
    'processing',count(*) FILTER(WHERE status='processing'),
    'dead_letters',count(*) FILTER(WHERE status='dead_letter'))
  FROM portal_read_model.inventory_action;
$$;
COMMENT ON TABLE portal_read_model.inventory_item IS
  'Private cloud-primary inventory. source_product_id is retained for API compatibility, not a live Grocy reference.';
COMMENT ON TABLE portal_read_model.inventory_action IS
  'Atomic cloud inventory change receipts; legacy completed actions are preserved.';
-- CREATE OR REPLACE preserves the existing service-role-only function ACLs.

-- Private, server-only projection and command queue for procurement proposals.
-- The browser never sees supplier locators, quotes, routes, source snapshots or credentials.

CREATE TABLE portal_read_model.procurement_proposal (
  id uuid PRIMARY KEY,
  product_ref text NOT NULL CHECK (char_length(btrim(product_ref)) BETWEEN 1 AND 128),
  product_name text NOT NULL CHECK (char_length(btrim(product_name)) BETWEEN 1 AND 80),
  state text NOT NULL CHECK (state IN ('DRAFT','REVIEWED','APPROVED','ORDERED','RECEIVED','CANCELLED')),
  packs integer NOT NULL CHECK (packs BETWEEN 1 AND 1000),
  required_units numeric(16,3) NOT NULL CHECK (required_units BETWEEN 0 AND 1000000),
  estimated_total_vnd numeric(18,2) NOT NULL CHECK (estimated_total_vnd BETWEEN 0 AND 1000000000000),
  proposal_hash text NOT NULL CHECK (proposal_hash ~ '^[0-9a-f]{64}$'),
  active boolean NOT NULL DEFAULT true,
  source_updated_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX procurement_proposal_active_idx
  ON portal_read_model.procurement_proposal (updated_at DESC)
  WHERE active = true;

CREATE TABLE portal_read_model.procurement_action (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key uuid NOT NULL UNIQUE,
  proposal_id uuid NOT NULL REFERENCES portal_read_model.procurement_proposal(id),
  target_state text NOT NULL CHECK (target_state IN ('REVIEWED','APPROVED','ORDERED','RECEIVED','CANCELLED')),
  expected_hash text NOT NULL CHECK (expected_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','dead_letter')),
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  claimed_at timestamptz,
  completed_at timestamptz,
  last_error_code text
);

CREATE INDEX procurement_action_work_idx
  ON portal_read_model.procurement_action (status, created_at)
  WHERE status IN ('pending','processing');

ALTER TABLE portal_read_model.procurement_proposal ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.procurement_proposal FORCE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.procurement_action ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.procurement_action FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE portal_read_model.procurement_proposal FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE portal_read_model.procurement_action FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE portal_read_model.procurement_proposal TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE portal_read_model.procurement_action TO service_role;

CREATE POLICY procurement_proposal_deny_clients ON portal_read_model.procurement_proposal
FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY procurement_action_deny_clients ON portal_read_model.procurement_action
FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE VIEW public.embe_procurement_proposal
WITH (security_invoker = true)
AS
SELECT id, product_name, state, packs, required_units, estimated_total_vnd,
       proposal_hash, source_updated_at AS updated_at
FROM portal_read_model.procurement_proposal
WHERE active = true;

REVOKE ALL ON TABLE public.embe_procurement_proposal FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.embe_procurement_proposal TO service_role;

CREATE OR REPLACE FUNCTION public.embe_sync_procurement(p_proposals jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  upserted_count integer := 0;
  retired_count integer := 0;
BEGIN
  IF jsonb_typeof(p_proposals) <> 'array' OR jsonb_array_length(p_proposals) > 100 THEN
    RAISE EXCEPTION 'p_proposals must be a bounded array';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_proposals) AS item(
      id uuid, product_ref text, product_name text, state text, packs integer,
      required_units numeric, estimated_total_vnd numeric, proposal_hash text, updated_at timestamptz
    )
    WHERE char_length(btrim(item.product_ref)) NOT BETWEEN 1 AND 128
       OR char_length(btrim(item.product_name)) NOT BETWEEN 1 AND 80
       OR item.state NOT IN ('DRAFT','REVIEWED','APPROVED','ORDERED','RECEIVED','CANCELLED')
       OR item.packs NOT BETWEEN 1 AND 1000
       OR item.required_units NOT BETWEEN 0 AND 1000000
       OR item.estimated_total_vnd NOT BETWEEN 0 AND 1000000000000
       OR item.proposal_hash !~ '^[0-9a-f]{64}$'
       OR item.updated_at IS NULL
  ) THEN
    RAISE EXCEPTION 'procurement proposal failed publication contract';
  END IF;

  INSERT INTO portal_read_model.procurement_proposal (
    id, product_ref, product_name, state, packs, required_units,
    estimated_total_vnd, proposal_hash, active, source_updated_at, updated_at
  )
  SELECT item.id, btrim(item.product_ref), btrim(item.product_name), item.state,
         item.packs, item.required_units, item.estimated_total_vnd,
         item.proposal_hash, true, item.updated_at, timezone('utc', now())
  FROM jsonb_to_recordset(p_proposals) AS item(
    id uuid, product_ref text, product_name text, state text, packs integer,
    required_units numeric, estimated_total_vnd numeric, proposal_hash text, updated_at timestamptz
  )
  ON CONFLICT (id) DO UPDATE
  SET product_ref = EXCLUDED.product_ref, product_name = EXCLUDED.product_name,
      state = EXCLUDED.state, packs = EXCLUDED.packs,
      required_units = EXCLUDED.required_units,
      estimated_total_vnd = EXCLUDED.estimated_total_vnd,
      proposal_hash = EXCLUDED.proposal_hash, active = true,
      source_updated_at = EXCLUDED.source_updated_at,
      updated_at = timezone('utc', now());
  GET DIAGNOSTICS upserted_count = ROW_COUNT;

  UPDATE portal_read_model.procurement_proposal AS existing
  SET active = false, updated_at = timezone('utc', now())
  WHERE existing.active = true
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_to_recordset(p_proposals) AS item(id uuid)
      WHERE item.id = existing.id
    );
  GET DIAGNOSTICS retired_count = ROW_COUNT;
  RETURN jsonb_build_object('upserted', upserted_count, 'retired', retired_count);
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_submit_procurement_action(
  p_idempotency_key uuid,
  p_proposal_id uuid,
  p_target_state text,
  p_expected_hash text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  saved portal_read_model.procurement_action%ROWTYPE;
BEGIN
  IF p_idempotency_key IS NULL OR p_proposal_id IS NULL
     OR p_target_state NOT IN ('REVIEWED','APPROVED','ORDERED','RECEIVED','CANCELLED')
     OR p_expected_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid procurement action';
  END IF;
  INSERT INTO portal_read_model.procurement_action (
    idempotency_key, proposal_id, target_state, expected_hash
  ) VALUES (p_idempotency_key, p_proposal_id, p_target_state, p_expected_hash)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING * INTO saved;

  IF saved.id IS NULL THEN
    SELECT * INTO saved FROM portal_read_model.procurement_action
    WHERE idempotency_key = p_idempotency_key;
    IF saved.proposal_id <> p_proposal_id OR saved.target_state <> p_target_state
       OR saved.expected_hash <> p_expected_hash THEN
      RAISE EXCEPTION 'idempotency key payload mismatch';
    END IF;
  END IF;
  RETURN saved.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_claim_procurement_actions(p_limit integer DEFAULT 10)
RETURNS TABLE (id uuid, proposal_id uuid, target_state text, expected_hash text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF p_limit NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'invalid procurement claim limit'; END IF;
  RETURN QUERY
  WITH candidates AS (
    SELECT queue.id FROM portal_read_model.procurement_action AS queue
    WHERE queue.attempts < 5
      AND (queue.status = 'pending' OR
        (queue.status = 'processing' AND queue.claimed_at < timezone('utc', now()) - interval '10 minutes'))
    ORDER BY queue.created_at LIMIT p_limit FOR UPDATE SKIP LOCKED
  )
  UPDATE portal_read_model.procurement_action AS queue
  SET status = 'processing', attempts = queue.attempts + 1,
      claimed_at = timezone('utc', now()), last_error_code = NULL
  FROM candidates WHERE queue.id = candidates.id
  RETURNING queue.id, queue.proposal_id, queue.target_state, queue.expected_hash;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_complete_procurement_action(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  UPDATE portal_read_model.procurement_action
  SET status = 'completed', completed_at = timezone('utc', now()), claimed_at = NULL,
      last_error_code = NULL
  WHERE id = p_id AND status = 'processing';
  IF NOT FOUND THEN RAISE EXCEPTION 'procurement action is not processing'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_fail_procurement_action(p_id uuid, p_error_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF p_error_code NOT IN ('invalid_transition','stale_proposal','local_unavailable') THEN
    RAISE EXCEPTION 'invalid procurement failure code';
  END IF;
  UPDATE portal_read_model.procurement_action
  SET status = CASE WHEN attempts >= 5 OR p_error_code IN ('invalid_transition','stale_proposal')
                    THEN 'dead_letter' ELSE 'pending' END,
      claimed_at = NULL, last_error_code = p_error_code
  WHERE id = p_id AND status = 'processing';
  IF NOT FOUND THEN RAISE EXCEPTION 'procurement action is not processing'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_procurement_queue_status()
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
  ) FROM portal_read_model.procurement_action;
$function$;

REVOKE ALL ON FUNCTION public.embe_sync_procurement(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_submit_procurement_action(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_claim_procurement_actions(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_complete_procurement_action(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_fail_procurement_action(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_procurement_queue_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_sync_procurement(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_submit_procurement_action(uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_claim_procurement_actions(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_complete_procurement_action(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_fail_procurement_action(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_procurement_queue_status() TO service_role;

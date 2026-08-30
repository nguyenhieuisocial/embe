SET local check_function_bodies = off;

CREATE SCHEMA "portal_read_model";

CREATE TABLE "portal_read_model"."timeline_event" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "source_system"     text                     NOT NULL,
  "source_event_id"   text                     NOT NULL,
  "child_id"          text                     NOT NULL,
  "event_at"          timestamp with time zone NOT NULL,
  "portal_event_type" text                     NOT NULL,
  "title"             text                     NOT NULL,
  "caption"           text                     NOT NULL,
  "album_cover_url"   text,
  "portal_role"       text                     NOT NULL DEFAULT 'family'::text,
  "approved"          boolean                  NOT NULL DEFAULT false,
  "approved_at"       timestamp with time zone,
  "created_at"        timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  "updated_at"        timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT "timeline_event_pkey" PRIMARY KEY (id),
  CONSTRAINT "timeline_event_source_event_id_key" UNIQUE (source_event_id),
  CONSTRAINT "timeline_event_source_system_check" CHECK ((source_system = ANY (ARRAY['memos'::text, 'babybuddy'::text, 'immich'::text])))
);

ALTER TABLE "portal_read_model"."timeline_event"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "portal_read_model"."timeline_event"
  FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION portal_read_model.touch_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$function$;

CREATE VIEW "portal_read_model"."timeline_event_public" WITH (security_invoker=true) AS  SELECT id,
    child_id,
    event_at,
    portal_event_type,
    title,
    caption,
    album_cover_url,
    approved_at
   FROM portal_read_model.timeline_event;

CREATE INDEX timeline_event_approved_at_idx ON portal_read_model.timeline_event USING btree (approved, event_at DESC)
  WHERE (approved = true);

CREATE TRIGGER timeline_event_set_updated_at
  BEFORE UPDATE ON portal_read_model.timeline_event
  FOR EACH ROW
  EXECUTE FUNCTION portal_read_model.touch_updated_at();

CREATE POLICY "anon_timeline_event_zero_rows" ON "portal_read_model"."timeline_event"
  FOR SELECT
  TO "anon"
  USING (false);

CREATE POLICY "family_timeline_event_approved_select" ON "portal_read_model"."timeline_event"
  FOR SELECT
  TO "authenticated"
  USING (((approved = true) AND (COALESCE(((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'portal_role'::text), ''::text) = 'family'::text)));

CREATE POLICY "family_timeline_event_no_delete" ON "portal_read_model"."timeline_event"
  FOR DELETE
  TO "anon", "authenticated"
  USING (false);

CREATE POLICY "family_timeline_event_no_insert" ON "portal_read_model"."timeline_event"
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK (false);

CREATE POLICY "family_timeline_event_no_update" ON "portal_read_model"."timeline_event"
  FOR UPDATE
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON COLUMN "portal_read_model"."timeline_event"."caption" IS 'Sanitized and rewritten for family publication.';

COMMENT ON TABLE "portal_read_model"."timeline_event" IS 'Curated read-model only; no medical notes, GPS, secret tokens, or raw media identifiers.';

GRANT EXECUTE ON FUNCTION "portal_read_model"."touch_updated_at"() TO "postgres";

GRANT USAGE ON SCHEMA "portal_read_model" TO "anon", "authenticated";

GRANT CREATE, USAGE ON SCHEMA "portal_read_model" TO "postgres";

GRANT SELECT ON TABLE "portal_read_model"."timeline_event" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "portal_read_model"."timeline_event" TO "postgres";

GRANT SELECT ON TABLE "portal_read_model"."timeline_event_public" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "portal_read_model"."timeline_event_public" TO "postgres";

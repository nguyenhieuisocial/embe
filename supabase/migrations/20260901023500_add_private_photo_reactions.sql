-- Small private reactions inspired by close-family messaging. No public totals,
-- follower graph, comments, or external identities.

CREATE TABLE portal_read_model.media_reaction (
  media_item_id uuid NOT NULL REFERENCES portal_read_model.media_item(id) ON DELETE CASCADE,
  author_role text NOT NULL CHECK (author_role IN ('father', 'mother')),
  emoji text NOT NULL CHECK (emoji IN ('heart', 'love', 'laugh', 'moved')),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (media_item_id, author_role)
);

CREATE TRIGGER media_reaction_set_updated_at
BEFORE UPDATE ON portal_read_model.media_reaction
FOR EACH ROW
EXECUTE FUNCTION portal_read_model.touch_updated_at();

ALTER TABLE portal_read_model.media_reaction ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.media_reaction FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE portal_read_model.media_reaction FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE portal_read_model.media_reaction TO service_role;

CREATE POLICY media_reaction_deny_clients
ON portal_read_model.media_reaction
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE OR REPLACE VIEW public.embe_media_item
WITH (security_invoker = true)
AS
SELECT item.id, item.event_at, item.title, item.caption, item.mime_type,
       item.width, item.height, item.updated_at,
       item.place_city, item.place_region, item.place_country,
       COALESCE((
         SELECT jsonb_object_agg(reaction.emoji, reaction.total)
         FROM (
           SELECT media_reaction.emoji, count(*)::integer AS total
           FROM portal_read_model.media_reaction
           WHERE media_reaction.media_item_id = item.id
           GROUP BY media_reaction.emoji
         ) AS reaction
       ), '{}'::jsonb) AS reactions
FROM portal_read_model.media_item AS item
WHERE item.approved = true;

REVOKE ALL ON TABLE public.embe_media_item FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.embe_media_item TO service_role;

CREATE OR REPLACE FUNCTION public.embe_react_media(
  p_media_item_id uuid,
  p_author_role text,
  p_emoji text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  counts jsonb;
BEGIN
  IF p_media_item_id IS NULL
     OR p_author_role NOT IN ('father', 'mother')
     OR p_emoji NOT IN ('heart', 'love', 'laugh', 'moved')
     OR NOT EXISTS (
       SELECT 1 FROM portal_read_model.media_item
       WHERE id = p_media_item_id AND approved = true
     ) THEN
    RAISE EXCEPTION 'invalid media reaction';
  END IF;

  INSERT INTO portal_read_model.media_reaction (media_item_id, author_role, emoji)
  VALUES (p_media_item_id, p_author_role, p_emoji)
  ON CONFLICT (media_item_id, author_role) DO UPDATE
  SET emoji = EXCLUDED.emoji;

  SELECT COALESCE(jsonb_object_agg(grouped.emoji, grouped.total), '{}'::jsonb)
  INTO counts
  FROM (
    SELECT emoji, count(*)::integer AS total
    FROM portal_read_model.media_reaction
    WHERE media_item_id = p_media_item_id
    GROUP BY emoji
  ) AS grouped;
  RETURN counts;
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_react_media(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_react_media(uuid,text,text) TO service_role;

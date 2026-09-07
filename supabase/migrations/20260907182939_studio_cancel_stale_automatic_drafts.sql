-- Stop an obsolete automatic render at its next progress checkpoint, without
-- waiting for the single renderer to finish before its scheduler loops again.
CREATE FUNCTION embe_studio.cancel_stale_automatic_render()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  UPDATE embe_studio.render SET status='cancelled',claim=NULL,updated_at=now()
    WHERE project_id=NEW.id AND status IN ('queued','rendering')
      AND snapshot->'autoRender'='true'::jsonb
      AND (NEW.deleted OR NEW.payload->'autoRender' IS DISTINCT FROM 'true'::jsonb OR revision<>NEW.revision);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION embe_studio.cancel_stale_automatic_render() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION embe_studio.cancel_stale_automatic_render() TO service_role;
CREATE TRIGGER cancel_stale_automatic_render AFTER UPDATE ON embe_studio.project
FOR EACH ROW EXECUTE FUNCTION embe_studio.cancel_stale_automatic_render();

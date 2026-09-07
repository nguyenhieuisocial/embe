-- Private draft automation only. No review approvals, health access or publishing.
CREATE FUNCTION public.embe_studio_autorender()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p embe_studio.project; result jsonb;
BEGIN
  -- Same admission lock as explicit saves/renders: unique revision + queue cap.
  PERFORM pg_advisory_xact_lock(73915431);
  UPDATE embe_studio.render rr SET status='cancelled',claim=NULL,updated_at=now()
    FROM embe_studio.project pp
    WHERE rr.project_id=pp.id AND rr.status IN ('queued','rendering')
      AND rr.snapshot->'autoRender'='true'::jsonb
      AND (pp.deleted OR pp.payload->'autoRender' IS DISTINCT FROM 'true'::jsonb OR pp.revision<>rr.revision);
  IF (SELECT count(*) FROM embe_studio.render WHERE status IN ('queued','rendering'))>=3 THEN
    RETURN jsonb_build_object('status','queue_full');
  END IF;
  SELECT pp.* INTO p FROM embe_studio.project pp
    LEFT JOIN embe_studio.render rr ON rr.project_id=pp.id AND rr.revision=pp.revision
    WHERE NOT pp.deleted AND pp.payload->'autoRender'='true'::jsonb
      AND pp.updated_at<now()-interval '30 seconds'
      AND jsonb_typeof(pp.payload->'scenes')='array' AND jsonb_typeof(pp.payload->'sources')='array'
      AND jsonb_array_length(pp.payload->'scenes') BETWEEN 1 AND 6
      AND jsonb_array_length(pp.payload->'sources') BETWEEN 1 AND 6
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(pp.payload->'scenes') s
        WHERE nullif(btrim(s->>'text'),'') IS NULL OR nullif(btrim(s->>'heading'),'') IS NULL)
      AND (rr.id IS NULL OR (rr.status='failed' AND rr.attempts<3
        AND rr.error IN ('interrupted','storage_unavailable','worker_unavailable')
        AND rr.updated_at<now()-interval '2 minutes'))
      AND (rr.id IS NOT NULL OR (SELECT count(*) FROM embe_studio.render)<100)
    ORDER BY pp.updated_at LIMIT 1 FOR UPDATE OF pp;
  IF p.id IS NULL THEN RETURN jsonb_build_object('status','idle'); END IF;
  result=public.embe_studio_workspace('render',p.id,p.revision,NULL);
  RETURN jsonb_build_object('status','queued','id',result->'render'->'id');
END $$;
REVOKE ALL ON FUNCTION public.embe_studio_autorender() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.embe_studio_autorender() TO service_role;

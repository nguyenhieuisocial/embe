-- Reuse the render/review/push queues. No clinical approval or social publication.
ALTER TABLE embe_studio.review_request ADD COLUMN origin text NOT NULL DEFAULT 'manual'
  CHECK(origin IN ('manual','automatic'));
ALTER TABLE embe_studio.automation ADD COLUMN handoff_status text NOT NULL DEFAULT 'waiting'
  CHECK(handoff_status IN ('waiting','ready','queue_full','failed')),
  ADD COLUMN handoff_checked_at timestamptz;

CREATE FUNCTION public.embe_studio_auto_handoff(p_limit integer DEFAULT 3)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE item record; request_id uuid; queued integer:=0; notified integer:=0; added integer; state text:='ready';
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 3 THEN RAISE sqlstate 'PT400' USING message='invalid_limit'; END IF;
  PERFORM pg_advisory_xact_lock(73915431);
  FOR item IN
    SELECT r.id AS render_id,p.id AS project_id,p.revision,p.payload
    FROM embe_studio.render r JOIN embe_studio.project p ON p.id=r.project_id
    WHERE r.status='completed' AND NOT p.deleted AND r.revision=p.revision AND r.snapshot=p.payload
      AND p.payload->'autoRender'='true'::jsonb
      AND NOT EXISTS(SELECT 1 FROM embe_studio.review_request q WHERE q.render_id=r.id)
    ORDER BY r.updated_at,p.id LIMIT p_limit
  LOOP
    IF (SELECT count(*) FROM embe_studio.review_request)>=100 THEN state:='queue_full'; EXIT; END IF;
    -- Inserting once never reopens a withdrawn request or asserts that anyone watched it.
    INSERT INTO embe_studio.review_request(project_id,project_revision,render_id,snapshot,target,origin)
      VALUES(item.project_id,item.revision,item.render_id,item.payload,'undecided','automatic') RETURNING id INTO request_id;
    INSERT INTO embe_studio.review_event(request_id,action,note)
      VALUES(request_id,'requested','EmBe tự chuyển video đã dựng vào hàng chờ. Chưa có người xem xác nhận, chưa duyệt chuyên môn và chưa đăng mạng xã hội.');
    queued:=queued+1;
    INSERT INTO portal_read_model.push_delivery(subscription_id,notification_key,title,body,target_url,next_attempt_at)
    SELECT s.id,'studio-ready:'||item.render_id::text,'Studio có video mới',
      CASE WHEN s.detail_preview THEN left(item.payload->>'title',120)||' — đã dựng xong và tự vào hàng chờ duyệt. Chưa đăng mạng xã hội.'
        ELSE 'Video mới đã dựng xong và tự vào hàng chờ duyệt. Mở Studio để xem; chưa đăng mạng xã hội.' END,
      '/studio/duyet-dang?du-an='||item.project_id::text,
      CASE WHEN (now() AT TIME ZONE s.timezone)::time < time '08:00'
        THEN ((now() AT TIME ZONE s.timezone)::date+time '08:00') AT TIME ZONE s.timezone
        WHEN (now() AT TIME ZONE s.timezone)::time >= time '21:00'
        THEN (((now() AT TIME ZONE s.timezone)::date+1)+time '08:00') AT TIME ZONE s.timezone
        ELSE now() END
    FROM portal_read_model.push_subscription s WHERE s.enabled
    ON CONFLICT(subscription_id,notification_key) DO NOTHING;
    GET DIAGNOSTICS added=ROW_COUNT;notified:=notified+added;
  END LOOP;
  UPDATE embe_studio.automation SET handoff_status=state,handoff_checked_at=now() WHERE id;
  RETURN jsonb_build_object('status',state,'queued',queued,'notificationsQueued',notified);
END $$;
REVOKE ALL ON FUNCTION public.embe_studio_auto_handoff(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.embe_studio_auto_handoff(integer) TO service_role;

-- Called by the installed worker. No extra timer/process and no restart needed.
CREATE OR REPLACE FUNCTION public.embe_studio_autorender()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE plan jsonb; rendered jsonb; handoff jsonb;
BEGIN
  BEGIN
    plan:=public.embe_studio_autoplan();
  EXCEPTION WHEN OTHERS THEN
    UPDATE embe_studio.automation SET last_checked_at=now(),last_status='plan_error' WHERE id;
    plan:=jsonb_build_object('status','plan_error');
  END;
  rendered:=public.embe_studio_render_saved_drafts();
  BEGIN
    handoff:=public.embe_studio_auto_handoff();
  EXCEPTION WHEN OTHERS THEN
    -- Retry handoff on the next pass without losing the already finished video.
    UPDATE embe_studio.automation SET handoff_status='failed',handoff_checked_at=now() WHERE id;
    handoff:=jsonb_build_object('status','failed');
  END;
  RETURN rendered||jsonb_build_object('planning',plan,'handoff',handoff);
END $$;

ALTER FUNCTION public.embe_studio_automation(boolean,integer) RENAME TO embe_studio_creation_status;
CREATE FUNCTION public.embe_studio_automation(p_enabled boolean DEFAULT NULL,p_revision integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE data jsonb;
BEGIN
  data:=public.embe_studio_creation_status(p_enabled,p_revision);
  RETURN data||jsonb_build_object('handoff',jsonb_build_object(
    'status',(SELECT handoff_status FROM embe_studio.automation WHERE id),
    'checkedAt',(SELECT handoff_checked_at FROM embe_studio.automation WHERE id),
    'pendingCount',(SELECT count(*) FROM embe_studio.review_request q JOIN embe_studio.project p ON p.id=q.project_id
      WHERE q.status='pending' AND NOT p.deleted AND p.revision=q.project_revision AND p.payload=q.snapshot),
    'devices',(SELECT count(*) FROM portal_read_model.push_subscription WHERE enabled),
    'notificationsPending',(SELECT count(*) FROM portal_read_model.push_delivery WHERE notification_key LIKE 'studio-ready:%' AND status<>'sent' AND attempt_count<5),
    'notificationsSent',(SELECT count(*) FROM portal_read_model.push_delivery WHERE notification_key LIKE 'studio-ready:%' AND status='sent')
  ));
END $$;
REVOKE ALL ON FUNCTION public.embe_studio_automation(boolean,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.embe_studio_automation(boolean,integer) TO service_role;

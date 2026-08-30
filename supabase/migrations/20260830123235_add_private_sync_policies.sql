CREATE POLICY timeline_sync_stage_deny_clients
ON portal_read_model.timeline_sync_stage
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY sync_status_deny_clients
ON portal_read_model.sync_status
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

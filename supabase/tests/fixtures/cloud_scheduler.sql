-- Stub interfaces for testing scheduling/secret boundaries without any network.
CREATE SCHEMA portal_read_model;
GRANT USAGE ON SCHEMA portal_read_model TO service_role;
CREATE SCHEMA net;
CREATE SCHEMA cron;
CREATE SCHEMA vault;
GRANT USAGE ON SCHEMA vault TO service_role;
CREATE TABLE vault.decrypted_secrets(name text, decrypted_secret text);
GRANT SELECT ON vault.decrypted_secrets TO service_role;
CREATE TABLE net.requests(id bigserial PRIMARY KEY, url text, headers jsonb, body jsonb, timeout_ms integer);
CREATE TABLE net._http_response(id bigint, status_code integer, timed_out boolean, error_msg text, created timestamptz);
CREATE TABLE cron.job(jobid bigserial PRIMARY KEY,jobname text UNIQUE,schedule text,command text,active boolean DEFAULT true);
CREATE TABLE cron.job_run_details(jobid bigint,end_time timestamptz);
CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$
  INSERT INTO cron.job(jobname,schedule,command) VALUES($1,$2,$3) RETURNING jobid;
$$;
CREATE FUNCTION cron.alter_job(job_id bigint,active boolean) RETURNS void LANGUAGE sql AS $$
  UPDATE cron.job SET active=$2 WHERE jobid=$1;
$$;
CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer)
RETURNS bigint LANGUAGE sql AS $$
  INSERT INTO net.requests(url,headers,body,timeout_ms) VALUES($1,$2,$3,$4) RETURNING id;
$$;

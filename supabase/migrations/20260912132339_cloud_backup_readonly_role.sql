-- Dedicated off-site backup identity, with no write or administrative rights.
-- Password/login are provisioned outside source control after privilege checks.
CREATE ROLE embe_cloud_backup NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 2;
ALTER ROLE embe_cloud_backup SET default_transaction_read_only = on;
ALTER ROLE embe_cloud_backup SET statement_timeout = '120s';
ALTER ROLE embe_cloud_backup SET lock_timeout = '5s';
ALTER ROLE embe_cloud_backup SET idle_session_timeout = '120s';
GRANT CONNECT ON DATABASE postgres TO embe_cloud_backup;
GRANT USAGE ON SCHEMA public, portal_read_model, embe_studio TO embe_cloud_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA public, portal_read_model, embe_studio TO embe_cloud_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public, portal_read_model, embe_studio TO embe_cloud_backup;
DO $$ DECLARE item record; BEGIN
  FOR item IN SELECT n.nspname,c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','portal_read_model','embe_studio') AND c.relkind IN ('r','p')
  LOOP
    EXECUTE format('CREATE POLICY embe_cloud_backup_select ON %I.%I FOR SELECT TO embe_cloud_backup USING (true)',
      item.nspname,item.relname);
  END LOOP;
END $$;
-- No automatic grant on future tables: the backup preflight must fail if a
-- migration adds a table without reviewing its inclusion and read-only policy.

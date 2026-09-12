BEGIN;
SET LOCAL ROLE embe_cloud_backup;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM portal_read_model.fixture_backup)=1, 'RLS hid rows';
  ASSERT NOT has_table_privilege(current_user,'portal_read_model.fixture_backup','INSERT,UPDATE,DELETE,TRUNCATE');
  ASSERT NOT has_schema_privilege(current_user,'vault','USAGE');
  ASSERT NOT (SELECT rolbypassrls OR rolsuper OR rolcreatedb OR rolcreaterole FROM pg_roles WHERE rolname=current_user);
  BEGIN
    INSERT INTO portal_read_model.fixture_backup VALUES(2);
    RAISE EXCEPTION 'Backup role wrote data';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;

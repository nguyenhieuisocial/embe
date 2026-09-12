CREATE SCHEMA portal_read_model;
CREATE SCHEMA embe_studio;
CREATE SCHEMA vault;
CREATE TABLE portal_read_model.fixture_backup(id int PRIMARY KEY);
ALTER TABLE portal_read_model.fixture_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.fixture_backup FORCE ROW LEVEL SECURITY;
INSERT INTO portal_read_model.fixture_backup VALUES(1);

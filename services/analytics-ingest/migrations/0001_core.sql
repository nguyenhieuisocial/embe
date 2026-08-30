CREATE TABLE IF NOT EXISTS fact_sleep (
  source TEXT NOT NULL, source_id TEXT PRIMARY KEY, child_id TEXT NOT NULL,
  observed_at TEXT NOT NULL, ended_at TEXT NOT NULL, duration_seconds INTEGER NOT NULL,
  raw_value TEXT NOT NULL, raw_unit TEXT NOT NULL, quality_flag TEXT NOT NULL,
  ingested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fact_feeding (
  source TEXT NOT NULL, source_id TEXT PRIMARY KEY, child_id TEXT NOT NULL,
  observed_at TEXT NOT NULL, value_milliliters REAL NOT NULL,
  raw_value TEXT NOT NULL, raw_unit TEXT NOT NULL, quality_flag TEXT NOT NULL,
  ingested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fact_diaper (
  source TEXT NOT NULL, source_id TEXT PRIMARY KEY, child_id TEXT NOT NULL,
  observed_at TEXT NOT NULL, diaper_type TEXT NOT NULL,
  raw_value TEXT NOT NULL, raw_unit TEXT NOT NULL, quality_flag TEXT NOT NULL,
  ingested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fact_growth (
  source TEXT NOT NULL, source_id TEXT PRIMARY KEY, child_id TEXT NOT NULL,
  observed_at TEXT NOT NULL, measure TEXT NOT NULL, value REAL NOT NULL, unit TEXT NOT NULL,
  raw_value TEXT NOT NULL, raw_unit TEXT NOT NULL, quality_flag TEXT NOT NULL,
  algorithm_version TEXT,
  ingested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fact_room_sample (
  source TEXT NOT NULL, source_id TEXT PRIMARY KEY, entity_id TEXT NOT NULL,
  kind TEXT NOT NULL, observed_at TEXT NOT NULL, value REAL NOT NULL, unit TEXT NOT NULL,
  raw_value TEXT NOT NULL, raw_unit TEXT NOT NULL, quality_flag TEXT NOT NULL,
  ingested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fact_media_state (
  source TEXT NOT NULL, source_id TEXT PRIMARY KEY, entity_id TEXT NOT NULL,
  observed_at TEXT NOT NULL, ended_at TEXT, track TEXT, volume REAL,
  raw_value TEXT NOT NULL, raw_unit TEXT NOT NULL, quality_flag TEXT NOT NULL,
  ingested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fact_stock_movement (
  source TEXT NOT NULL, source_id TEXT PRIMARY KEY, item_id TEXT NOT NULL,
  observed_at TEXT NOT NULL, quantity REAL NOT NULL, unit TEXT NOT NULL,
  raw_value TEXT NOT NULL, raw_unit TEXT NOT NULL, quality_flag TEXT NOT NULL,
  ingested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fact_milestone (
  source TEXT NOT NULL, source_id TEXT PRIMARY KEY, child_id TEXT NOT NULL,
  observed_at TEXT NOT NULL, milestone_type TEXT NOT NULL,
  raw_value TEXT NOT NULL, raw_unit TEXT NOT NULL, quality_flag TEXT NOT NULL,
  ingested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ingest_checkpoint (
  source TEXT PRIMARY KEY,
  observed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_room_sample_observed ON fact_room_sample(observed_at, kind);
CREATE INDEX IF NOT EXISTS idx_sleep_child_observed ON fact_sleep(child_id, observed_at);
CREATE INDEX IF NOT EXISTS idx_feeding_child_observed ON fact_feeding(child_id, observed_at);

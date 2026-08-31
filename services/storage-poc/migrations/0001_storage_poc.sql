pragma foreign_keys = on;

create table if not exists schema_migrations (
  version text primary key,
  applied_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table if not exists assets (
  id text primary key,
  tenant_id text not null,
  owner_id text not null,
  logical_name text not null,
  media_type text not null,
  byte_size integer not null check (byte_size >= 0),
  plaintext_sha256 text not null check (length(plaintext_sha256) = 64),
  sensitivity text not null check (sensitivity in ('public','family','important','restricted')),
  status text not null check (status in ('uploading','available','deleting','tombstoned','rejected')),
  version integer not null default 1 check (version > 0),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at text
);

create index if not exists assets_tenant_status_idx on assets(tenant_id, status);
drop index if exists assets_dedupe_idx;
create unique index assets_dedupe_idx
  on assets(tenant_id, plaintext_sha256, version)
  where status not in ('rejected','tombstoned');

create table if not exists asset_acl (
  asset_id text not null references assets(id) on delete cascade,
  principal_type text not null check (principal_type in ('user','role')),
  principal_id text not null,
  permission text not null check (permission in ('read','write','delete','admin')),
  primary key(asset_id, principal_type, principal_id, permission)
);

create table if not exists storage_objects (
  id text primary key,
  asset_id text not null references assets(id) on delete cascade,
  provider text not null check (provider in ('local','r2','s3','telegram_mtproto_lab')),
  provider_account_id text not null,
  locator_json text not null,
  byte_size integer not null check (byte_size >= 0),
  ciphertext_sha256 text,
  state text not null check (state in ('pending','uploading','available','retry_wait','failed','deleting','deleted')),
  is_primary integer not null default 0 check (is_primary in (0,1)),
  verified_at text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at text
);

create unique index if not exists one_primary_per_asset
  on storage_objects(asset_id) where is_primary = 1 and state <> 'deleted';
create unique index if not exists one_active_replica_per_provider
  on storage_objects(asset_id, provider, provider_account_id) where state <> 'deleted';
create index if not exists storage_objects_reconcile_idx on storage_objects(provider, state);

create table if not exists storage_source_links (
  source text not null,
  source_object_id text not null,
  source_version text not null,
  storage_asset_id text not null references assets(id) on delete cascade,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  primary key(source, source_object_id)
);
create index if not exists storage_source_links_asset_idx on storage_source_links(storage_asset_id);

create table if not exists encryption_envelopes (
  storage_object_id text primary key references storage_objects(id) on delete cascade,
  algorithm text not null check (algorithm = 'AES-256-GCM-CHUNKED-V1'),
  key_version text not null,
  wrapped_dek blob not null,
  wrap_nonce blob not null check (length(wrap_nonce) = 12),
  nonce_prefix blob not null check (length(nonce_prefix) = 8),
  chunk_size integer not null check (chunk_size between 65536 and 8388608),
  aad_version integer not null default 1
);

create table if not exists telegram_shards (
  id text primary key,
  opaque_peer_ref text not null unique,
  status text not null check (status in ('active','read_only','disabled')),
  max_parallel integer not null default 1 check (max_parallel between 1 and 4),
  last_message_id integer,
  last_scanned_at text
);

create table if not exists telegram_locations (
  storage_object_id text primary key references storage_objects(id) on delete cascade,
  shard_id text not null references telegram_shards(id),
  message_id integer not null,
  document_id text not null,
  access_hash text not null,
  file_reference blob,
  manifest_version integer not null default 1,
  unique(shard_id, message_id)
);

create table if not exists storage_outbox (
  id text primary key,
  operation text not null,
  storage_object_id text not null references storage_objects(id) on delete cascade,
  idempotency_key text not null unique,
  attempts integer not null default 0,
  next_attempt_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_error_code text,
  last_error_detail text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table if not exists benchmark_runs (
  id text primary key,
  provider text not null,
  scenario text not null,
  size_bytes integer not null,
  status text not null check (status in ('measured','skipped','failed','not_supported')),
  metrics_json text not null,
  error_code text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

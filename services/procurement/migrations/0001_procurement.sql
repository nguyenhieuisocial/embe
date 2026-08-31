PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS supplier (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    source_kind TEXT NOT NULL DEFAULT 'manual'
        CHECK (source_kind IN ('manual', 'csv', 'official_api')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS supplier_listing (
    id TEXT PRIMARY KEY,
    supplier_id TEXT NOT NULL REFERENCES supplier(id),
    product_ref TEXT NOT NULL,
    title TEXT NOT NULL,
    units_per_pack NUMERIC NOT NULL CHECK (units_per_pack > 0),
    provider_locator TEXT,
    UNIQUE (supplier_id, product_ref, provider_locator)
);

CREATE TABLE IF NOT EXISTS quote (
    id TEXT PRIMARY KEY,
    listing_id TEXT NOT NULL REFERENCES supplier_listing(id),
    unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
    currency TEXT NOT NULL,
    quoted_at TEXT NOT NULL,
    valid_until TEXT NOT NULL,
    source_ref TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS warehouse_route (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    domestic_shipping NUMERIC NOT NULL DEFAULT 0 CHECK (domestic_shipping >= 0),
    handling NUMERIC NOT NULL DEFAULT 0 CHECK (handling >= 0),
    international_per_kg NUMERIC NOT NULL DEFAULT 0 CHECK (international_per_kg >= 0),
    dimensional_divisor NUMERIC NOT NULL DEFAULT 5000 CHECK (dimensional_divisor > 0),
    lead_time_days INTEGER NOT NULL CHECK (lead_time_days > 0)
);

CREATE TABLE IF NOT EXISTS landed_cost_rule (
    id TEXT PRIMARY KEY,
    warehouse_route_id TEXT NOT NULL REFERENCES warehouse_route(id),
    duty_rate NUMERIC NOT NULL DEFAULT 0 CHECK (duty_rate BETWEEN 0 AND 1),
    fx_spread_rate NUMERIC NOT NULL DEFAULT 0 CHECK (fx_spread_rate BETWEEN 0 AND 1),
    currency TEXT NOT NULL DEFAULT 'VND',
    effective_from TEXT NOT NULL,
    effective_until TEXT
);

CREATE TABLE IF NOT EXISTS purchase_proposal (
    id TEXT PRIMARY KEY,
    product_ref TEXT NOT NULL,
    listing_id TEXT REFERENCES supplier_listing(id),
    quote_id TEXT REFERENCES quote(id),
    warehouse_route_id TEXT REFERENCES warehouse_route(id),
    state TEXT NOT NULL DEFAULT 'DRAFT'
        CHECK (state IN ('DRAFT', 'REVIEWED', 'APPROVED', 'ORDERED', 'RECEIVED', 'CANCELLED')),
    packs INTEGER NOT NULL CHECK (packs > 0),
    required_units NUMERIC,
    estimated_total_vnd NUMERIC,
    input_snapshot TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS one_open_proposal_per_product
ON purchase_proposal(product_ref)
WHERE state IN ('DRAFT', 'REVIEWED', 'APPROVED', 'ORDERED');

CREATE TABLE IF NOT EXISTS approval (
    id TEXT PRIMARY KEY,
    proposal_id TEXT NOT NULL REFERENCES purchase_proposal(id),
    action TEXT NOT NULL CHECK (action IN ('REVIEWED', 'APPROVED', 'ORDERED', 'RECEIVED', 'CANCELLED')),
    actor_ref TEXT NOT NULL,
    actor_kind TEXT NOT NULL CHECK (actor_kind = 'human'),
    proposal_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (proposal_id, action)
);

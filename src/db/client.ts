import * as SQLite from 'expo-sqlite';

/**
 * Local SQLite database: the on-device source of truth.
 * Every scan and movement is written here first, so the app works with no network;
 * `src/services/sync.ts` pushes pending changes to Neon when online.
 *
 * Catalog tables carry `dirty = 1` until uploaded. Stock quantity and asset status
 * are never uploaded directly - they change only through movements, which the
 * server re-validates (see neon/schema.sql `inventory_apply_movement`).
 */
export const db = SQLite.openDatabaseSync('ink-inventory.db');

const SCHEMA_VERSION = 6;

const MIGRATIONS: Record<number, string> = {
  1: `
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('asset','consumable','quantity')),
      prefix TEXT NOT NULL,
      category TEXT,
      unit TEXT NOT NULL DEFAULT 'pcs',
      notes TEXT,
      updated_at TEXT NOT NULL,
      dirty INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY NOT NULL,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'shelf',
      parent_id TEXT REFERENCES locations(id),
      updated_at TEXT NOT NULL,
      dirty INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY NOT NULL,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      updated_at TEXT NOT NULL,
      dirty INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY NOT NULL,
      product_id TEXT NOT NULL REFERENCES products(id),
      code TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'available',
      condition TEXT NOT NULL DEFAULT 'good',
      location_id TEXT REFERENCES locations(id),
      project_id TEXT REFERENCES projects(id),
      holder TEXT,
      expected_return TEXT,
      updated_at TEXT NOT NULL,
      dirty INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS stock_lots (
      id TEXT PRIMARY KEY NOT NULL,
      product_id TEXT NOT NULL REFERENCES products(id),
      code TEXT NOT NULL UNIQUE,
      quantity REAL NOT NULL DEFAULT 0 CHECK (quantity >= 0),
      location_id TEXT REFERENCES locations(id),
      batch TEXT,
      supplier TEXT,
      purchase_date TEXT,
      updated_at TEXT NOT NULL,
      dirty INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS identifiers (
      id TEXT PRIMARY KEY NOT NULL,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('asset','lot','location')),
      entity_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('qr','barcode','rfid','nfc')),
      value TEXT NOT NULL UNIQUE,
      updated_at TEXT NOT NULL,
      dirty INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_identifiers_entity ON identifiers(entity_type, entity_id);

    CREATE TABLE IF NOT EXISTS movements (
      id TEXT PRIMARY KEY NOT NULL,
      txn_id TEXT NOT NULL,
      type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      quantity REAL,
      from_location_id TEXT,
      to_location_id TEXT,
      project_id TEXT,
      staff TEXT NOT NULL,
      expected_return TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      sync_state TEXT NOT NULL DEFAULT 'pending',
      sync_error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_movements_entity ON movements(entity_type, entity_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_movements_sync ON movements(sync_state);

    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT
    );
  `,
  2: `
    CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
    CREATE INDEX IF NOT EXISTS idx_assets_location ON assets(location_id);
    CREATE INDEX IF NOT EXISTS idx_assets_project ON assets(project_id);
    CREATE INDEX IF NOT EXISTS idx_assets_product ON assets(product_id);
    CREATE INDEX IF NOT EXISTS idx_lots_location ON stock_lots(location_id);
    CREATE INDEX IF NOT EXISTS idx_lots_product ON stock_lots(product_id);
    CREATE INDEX IF NOT EXISTS idx_movements_created ON movements(created_at);
    CREATE INDEX IF NOT EXISTS idx_movements_project ON movements(project_id);
  `,
  // Every table carries the inventory_ prefix, matching the Supabase schema.
  // SQLite rewrites foreign keys and indexes to follow the renamed tables.
  3: `
    ALTER TABLE products RENAME TO inventory_products;
    ALTER TABLE locations RENAME TO inventory_locations;
    ALTER TABLE projects RENAME TO inventory_projects;
    ALTER TABLE assets RENAME TO inventory_assets;
    ALTER TABLE stock_lots RENAME TO inventory_stock_lots;
    ALTER TABLE identifiers RENAME TO inventory_identifiers;
    ALTER TABLE movements RENAME TO inventory_movements;
    ALTER TABLE kv RENAME TO inventory_kv;
    CREATE INDEX IF NOT EXISTS idx_products_name ON inventory_products(name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_products_prefix ON inventory_products(prefix);
    CREATE INDEX IF NOT EXISTS idx_products_category ON inventory_products(category);
  `,
  // Simple naming: "Wire" + sub-name "1.5 mm red".
  4: `
    ALTER TABLE inventory_products ADD COLUMN subname TEXT;
  `,
  // Two-level categories: Cables › HDMI (codes CBL-HDM-0001).
  5: `
    ALTER TABLE inventory_products ADD COLUMN subcategory TEXT;
    CREATE INDEX IF NOT EXISTS idx_products_cat_sub ON inventory_products(category, subcategory);
  `,
  // Product photos live in Neon Object Storage; the database stores only the branch-aware object key.
  6: `
    ALTER TABLE inventory_products ADD COLUMN image_key TEXT;
  `,
};

export function migrate() {
  db.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < SCHEMA_VERSION) {
    const next = version + 1;
    db.withTransactionSync(() => {
      db.execSync(MIGRATIONS[next]);
      db.execSync(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
}

export function kvGet(key: string): string | null {
  return db.getFirstSync<{ value: string | null }>('SELECT value FROM inventory_kv WHERE key = ?', key)?.value ?? null;
}

export function kvSet(key: string, value: string | null) {
  db.runSync('INSERT INTO inventory_kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
}

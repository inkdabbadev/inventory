import NetInfo from '@react-native-community/netinfo';
import { db, kvGet, kvSet } from '../db/client';
import { supabase } from '../lib/supabase';
import type { Movement } from '../domain/types';

/**
 * Offline-first sync.
 *
 * 1. Push dirty catalog rows (products, locations, projects, assets, lots, identifiers).
 *    Quantity and asset status are NOT pushed - they are owned by the movement ledger.
 * 2. Push pending movements one by one through the `apply_movement` RPC. The server
 *    validates each one (no double issue, no negative stock); a rejection is stored as
 *    a conflict for a manager to review instead of silently overwriting stock.
 * 3. Pull everything changed on the server since the last pull, so the device sees
 *    other staff members' movements and the server's authoritative quantities.
 */

const CATALOG: { table: string; columns: string[] }[] = [
  { table: 'inventory_products', columns: ['id', 'name', 'subname', 'kind', 'prefix', 'category', 'subcategory', 'unit', 'notes'] },
  { table: 'inventory_locations', columns: ['id', 'code', 'name', 'type', 'parent_id'] },
  { table: 'inventory_projects', columns: ['id', 'code', 'name', 'status'] },
  { table: 'inventory_assets', columns: ['id', 'product_id', 'code', 'condition', 'location_id'] },
  { table: 'inventory_stock_lots', columns: ['id', 'product_id', 'code', 'location_id', 'batch', 'supplier', 'purchase_date'] },
  { table: 'inventory_identifiers', columns: ['id', 'entity_type', 'entity_id', 'type', 'value'] },
];

/** Columns pulled from the server, including the ledger-owned ones. */
const PULL_COLUMNS: Record<string, string[]> = {
  inventory_products: CATALOG[0].columns,
  inventory_locations: CATALOG[1].columns,
  inventory_projects: CATALOG[2].columns,
  inventory_assets: [...CATALOG[3].columns, 'status', 'project_id', 'holder', 'expected_return'],
  inventory_stock_lots: [...CATALOG[4].columns, 'quantity'],
  inventory_identifiers: CATALOG[5].columns,
};

export interface SyncReport {
  pushedRows: number;
  pushedMovements: number;
  conflicts: number;
  pulledRows: number;
}

let running = false;

const PUSH_BATCH = 500;
const PULL_PAGE = 1000; // Supabase's default max rows per request

export async function syncNow(onProgress?: (status: string) => void): Promise<SyncReport> {
  if (!supabase) throw new Error('Cloud sync is not configured.');
  if (running) throw new Error('Sync already in progress.');
  const net = await NetInfo.fetch();
  if (!net.isConnected) throw new Error('No internet connection. Changes stay queued on this device.');
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) throw new Error('Sign in to sync.');

  running = true;
  const report: SyncReport = { pushedRows: 0, pushedMovements: 0, conflicts: 0, pulledRows: 0 };
  try {
    // 1. catalog, in batches so a bulk import of thousands of items uploads reliably
    for (const { table, columns } of CATALOG) {
      for (;;) {
        const rows = db.getAllSync<Record<string, unknown>>(`SELECT ${columns.join(',')} FROM ${table} WHERE dirty = 1 LIMIT ${PUSH_BATCH}`);
        if (rows.length === 0) break;
        const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
        if (error) throw new Error(`Upload ${table}: ${error.message}`);
        const placeholders = rows.map(() => '?').join(',');
        db.runSync(`UPDATE ${table} SET dirty = 0 WHERE id IN (${placeholders})`, ...rows.map((r) => r.id as string));
        report.pushedRows += rows.length;
        onProgress?.(`Uploading ${table.replace('inventory_', '')} · ${report.pushedRows}`);
      }
    }

    // 2. movements, oldest first so the server replays them in order
    const pending = db.getAllSync<Movement>("SELECT * FROM inventory_movements WHERE sync_state = 'pending' ORDER BY created_at");
    for (const m of pending) {
      const { error } = await supabase.rpc('inventory_apply_movement', {
        p_id: m.id,
        p_txn_id: m.txn_id,
        p_type: m.type,
        p_entity_type: m.entity_type,
        p_entity_id: m.entity_id,
        p_quantity: m.quantity,
        p_from_location_id: m.from_location_id,
        p_to_location_id: m.to_location_id,
        p_project_id: m.project_id,
        p_staff: m.staff,
        p_expected_return: m.expected_return,
        p_notes: m.notes,
        p_created_at: m.created_at,
      });
      if (error) {
        // Business-rule rejection (raised with SQLSTATE P0001) -> conflict. Anything else -> retry later.
        if (error.code === 'P0001') {
          db.runSync("UPDATE inventory_movements SET sync_state = 'conflict', sync_error = ? WHERE id = ?", error.message, m.id);
          report.conflicts++;
          continue;
        }
        throw new Error(`Upload movement: ${error.message}`);
      }
      db.runSync("UPDATE inventory_movements SET sync_state = 'synced', sync_error = NULL WHERE id = ?", m.id);
      report.pushedMovements++;
      if (report.pushedMovements % 25 === 0) onProgress?.(`Uploading movements · ${report.pushedMovements}/${pending.length}`);
    }

    // 3. pull
    const since = kvGet('last_pull_at') ?? '1970-01-01T00:00:00Z';
    const pullStartedAt = new Date().toISOString();
    for (const [table, columns] of Object.entries(PULL_COLUMNS)) {
      // Supabase caps responses at 1000 rows, so page through until a short page comes back.
      const updates = columns.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ');
      const sql = `INSERT INTO ${table} (${columns.join(',')}, updated_at, dirty) VALUES (${columns.map(() => '?').join(',')}, ?, 0)
         ON CONFLICT(id) DO UPDATE SET ${updates}, updated_at = excluded.updated_at WHERE ${table}.dirty = 0`;
      for (let from = 0; ; from += PULL_PAGE) {
        const { data, error } = await supabase
          .from(table)
          .select(columns.join(','))
          .gt('updated_at', since)
          .order('updated_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + PULL_PAGE - 1);
        if (error) throw new Error(`Download ${table}: ${error.message}`);
        const rows = (data ?? []) as unknown as Record<string, unknown>[];
        if (rows.length === 0) break;
        // One prepared statement per page: far faster than re-parsing SQL for every row.
        const stmt = db.prepareSync(sql);
        try {
          db.withTransactionSync(() => {
            // Never clobber a row edited locally that has not been uploaded yet (WHERE dirty = 0).
            for (const r of rows) stmt.executeSync(...columns.map((c) => (r[c] ?? null) as string | number | null), pullStartedAt);
          });
        } finally {
          stmt.finalizeSync();
        }
        report.pulledRows += rows.length;
        onProgress?.(`Downloading ${table.replace('inventory_', '')} · ${report.pulledRows}`);
        if (rows.length < PULL_PAGE) break;
      }
    }
    kvSet('last_pull_at', pullStartedAt);
    kvSet('last_sync_at', new Date().toISOString());
    return report;
  } finally {
    running = false;
  }
}

export const conflicts = () =>
  db.getAllSync<Movement>("SELECT * FROM inventory_movements WHERE sync_state = 'conflict' ORDER BY created_at DESC");

/** Dismiss a conflict after a manager has reviewed it. The server state wins on next pull. */
export function dismissConflict(id: string) {
  db.runSync("UPDATE inventory_movements SET sync_state = 'synced', sync_error = 'Dismissed: ' || IFNULL(sync_error,'') WHERE id = ?", id);
}

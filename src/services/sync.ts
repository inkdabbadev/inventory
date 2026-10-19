import NetInfo from '@react-native-community/netinfo';
import { db, kvGet, kvSet } from '../db/client';
import { isCloudEnabled, neonApi } from '../lib/neon';
import type { Movement } from '../domain/types';

const CATALOG: { table: string; columns: string[] }[] = [
  { table: 'inventory_products', columns: ['id', 'name', 'subname', 'kind', 'prefix', 'category', 'subcategory', 'unit', 'notes', 'image_key'] },
  { table: 'inventory_locations', columns: ['id', 'code', 'name', 'type', 'parent_id'] },
  { table: 'inventory_projects', columns: ['id', 'code', 'name', 'status'] },
  { table: 'inventory_assets', columns: ['id', 'product_id', 'code', 'condition', 'location_id'] },
  { table: 'inventory_stock_lots', columns: ['id', 'product_id', 'code', 'location_id', 'batch', 'supplier', 'purchase_date'] },
  { table: 'inventory_identifiers', columns: ['id', 'entity_type', 'entity_id', 'type', 'value'] },
];

const PULL_COLUMNS: Record<string, string[]> = {
  inventory_products: CATALOG[0].columns,
  inventory_locations: CATALOG[1].columns,
  inventory_projects: CATALOG[2].columns,
  inventory_assets: [...CATALOG[3].columns, 'status', 'project_id', 'holder', 'expected_return'],
  inventory_stock_lots: [...CATALOG[4].columns, 'quantity'],
  inventory_identifiers: CATALOG[5].columns,
};

interface SyncResponse {
  applied: string[];
  conflicts: { id: string; error: string }[];
  changes: Record<string, Record<string, unknown>[]>;
  movements: Movement[];
  cursor: string;
}

export interface SyncReport {
  pushedRows: number;
  pushedMovements: number;
  conflicts: number;
  pulledRows: number;
}

let running = false;

export async function syncNow(onProgress?: (status: string) => void): Promise<SyncReport> {
  if (!isCloudEnabled) throw new Error('Neon sync is not configured.');
  if (running) throw new Error('Sync already in progress.');
  const net = await NetInfo.fetch();
  if (!net.isConnected) throw new Error('No internet connection. Changes stay queued on this device.');

  running = true;
  try {
    const catalog: Record<string, Record<string, unknown>[]> = {};
    let pushedRows = 0;
    for (const { table, columns } of CATALOG) {
      const rows = db.getAllSync<Record<string, unknown>>(`SELECT ${columns.join(',')},updated_at FROM ${table} WHERE dirty = 1`);
      catalog[table] = rows;
      pushedRows += rows.length;
    }
    const movements = db.getAllSync<Movement>("SELECT * FROM inventory_movements WHERE sync_state='pending' ORDER BY created_at,id");
    onProgress?.(`Uploading ${pushedRows + movements.length} change(s)`);

    const result = await neonApi<SyncResponse>('/sync', {
      method: 'POST',
      body: JSON.stringify({ catalog, movements, since: kvGet('last_pull_at') ?? '1970-01-01T00:00:00.000Z' }),
    });

    db.withTransactionSync(() => {
      for (const { table } of CATALOG) {
        for (const row of catalog[table]) {
          // Do not clear a row that was edited again while this network request was running.
          db.runSync(`UPDATE ${table} SET dirty=0 WHERE id=? AND updated_at=?`, row.id as string, row.updated_at as string);
        }
      }
      for (const id of result.applied) db.runSync("UPDATE inventory_movements SET sync_state='synced',sync_error=NULL WHERE id=?", id);
      for (const conflict of result.conflicts) {
        db.runSync("UPDATE inventory_movements SET sync_state='conflict',sync_error=? WHERE id=?", conflict.error, conflict.id);
      }

      for (const [table, rows] of Object.entries(result.changes)) {
        const columns = PULL_COLUMNS[table];
        if (!columns) continue;
        const updates = columns.filter((column) => column !== 'id').map((column) => `${column}=excluded.${column}`).join(',');
        const sql = `INSERT INTO ${table} (${columns.join(',')},updated_at,dirty) VALUES (${columns.map(() => '?').join(',')},?,0)
          ON CONFLICT(id) DO UPDATE SET ${updates},updated_at=excluded.updated_at WHERE ${table}.dirty=0`;
        for (const row of rows) db.runSync(sql, ...columns.map((column) => (row[column] ?? null) as string | number | null), row.updated_at as string);
      }

      for (const movement of result.movements) {
        db.runSync(
          `INSERT OR IGNORE INTO inventory_movements
           (id,txn_id,type,entity_type,entity_id,quantity,from_location_id,to_location_id,project_id,staff,expected_return,notes,created_at,sync_state)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'synced')`,
          movement.id, movement.txn_id, movement.type, movement.entity_type, movement.entity_id, movement.quantity,
          movement.from_location_id, movement.to_location_id, movement.project_id, movement.staff,
          movement.expected_return, movement.notes, movement.created_at,
        );
      }
      kvSet('last_pull_at', result.cursor);
      kvSet('last_sync_at', new Date().toISOString());
    });

    const pulledRows = Object.values(result.changes).reduce((sum, rows) => sum + rows.length, 0) + result.movements.length;
    return { pushedRows, pushedMovements: result.applied.length, conflicts: result.conflicts.length, pulledRows };
  } finally {
    running = false;
  }
}

export const conflicts = () =>
  db.getAllSync<Movement>("SELECT * FROM inventory_movements WHERE sync_state='conflict' ORDER BY created_at DESC");

export function dismissConflict(id: string) {
  db.runSync("UPDATE inventory_movements SET sync_state='synced',sync_error='Dismissed: ' || IFNULL(sync_error,'') WHERE id=?", id);
}

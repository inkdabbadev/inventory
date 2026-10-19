import * as Crypto from 'expo-crypto';
import { db, kvGet } from '../db/client';
import { codePrefixFor } from '../domain/taxonomy';
import type {
  AssetView,
  EntityType,
  IdentifierType,
  Location,
  LotView,
  Movement,
  MovementType,
  ProductKind,
  Product,
  Project,
  ScanResult,
} from '../domain/types';

/** Prefix written into app-generated QR codes so we can tell them apart from manufacturer barcodes. */
export const QR_PREFIX = 'INK:';

export class InventoryError extends Error {}

const now = () => new Date().toISOString();
export const newId = () => Crypto.randomUUID();
export const currentStaff = () => kvGet('staff_name') || 'Staff';

// ---------------------------------------------------------------------------
// Codes & identifiers
// ---------------------------------------------------------------------------

type CodedTable = 'inventory_assets' | 'inventory_stock_lots' | 'inventory_locations' | 'inventory_projects';

/** Highest number used for a prefix, e.g. 42 for CBL-0042. One range scan on the unique code index. */
function maxCodeNumber(table: CodedTable, prefix: string): number {
  const row = db.getFirstSync<{ n: number | null }>(
    `SELECT MAX(CAST(substr(code, ?) AS INTEGER)) AS n FROM ${table} WHERE code >= ? AND code < ?`,
    prefix.length + 2, `${prefix}-`, `${prefix}.`, // '.' sorts right after '-'
  );
  return row?.n ?? 0;
}

const formatCode = (prefix: string, n: number) => `${prefix}-${String(n).padStart(4, '0')}`;

/**
 * Assets and stock lots share one number sequence per prefix, so CBL-CAT-0001 can never exist
 * as both a cable and a drum (QR values must be unique).
 */
function maxItemNumber(prefix: string): number {
  return Math.max(maxCodeNumber('inventory_assets', prefix), maxCodeNumber('inventory_stock_lots', prefix));
}

/** "cbl-hdm" -> "CBL-HDM"; letters, digits and single dashes, max 9 chars. */
export function cleanPrefix(p: string): string {
  return p.toUpperCase().replace(/[^A-Z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 9).replace(/-$/, '');
}

/** Next sequential code for a prefix across a table, e.g. CBL-0043. */
function nextCode(table: CodedTable, prefix: string): string {
  return formatCode(prefix, maxCodeNumber(table, prefix) + 1);
}

export const qrValueFor = (code: string) => `${QR_PREFIX}${code}`;

function addIdentifier(entityType: EntityType, entityId: string, type: IdentifierType, value: string) {
  const existing = db.getFirstSync<{ entity_id: string }>('SELECT entity_id FROM inventory_identifiers WHERE value = ?', value);
  if (existing) {
    if (existing.entity_id === entityId) return;
    throw new InventoryError(`"${value}" is already linked to another record.`);
  }
  db.runSync(
    'INSERT INTO inventory_identifiers (id, entity_type, entity_id, type, value, updated_at) VALUES (?,?,?,?,?,?)',
    newId(), entityType, entityId, type, value, now(),
  );
}

/** Link an extra identifier (manufacturer barcode, RFID EPC, NFC UID) to an existing record. */
export function linkIdentifier(entityType: EntityType, entityId: string, type: IdentifierType, value: string) {
  addIdentifier(entityType, entityId, type, value.trim());
}

export function identifiersFor(entityType: EntityType, entityId: string) {
  return db.getAllSync<{ type: IdentifierType; value: string }>(
    'SELECT type, value FROM inventory_identifiers WHERE entity_type = ? AND entity_id = ? ORDER BY type',
    entityType, entityId,
  );
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

const ASSET_SELECT = `
  SELECT a.*, p.name, p.subname, p.unit, p.category, p.subcategory, p.image_key, l.name AS location_name, pr.name AS project_name
  FROM inventory_assets a
  JOIN inventory_products p ON p.id = a.product_id
  LEFT JOIN inventory_locations l ON l.id = a.location_id
  LEFT JOIN inventory_projects pr ON pr.id = a.project_id`;

const LOT_SELECT = `
  SELECT s.*, p.name, p.subname, p.kind, p.unit, p.category, p.subcategory, p.image_key, l.name AS location_name
  FROM inventory_stock_lots s
  JOIN inventory_products p ON p.id = s.product_id
  LEFT JOIN inventory_locations l ON l.id = s.location_id`;

export const getAsset = (id: string) => db.getFirstSync<AssetView>(`${ASSET_SELECT} WHERE a.id = ?`, id);
export const getLot = (id: string) => db.getFirstSync<LotView>(`${LOT_SELECT} WHERE s.id = ?`, id);
export const getLocation = (id: string) => db.getFirstSync<Location>('SELECT * FROM inventory_locations WHERE id = ?', id);
export const getProject = (id: string) => db.getFirstSync<Project>('SELECT * FROM inventory_projects WHERE id = ?', id);
export const getProduct = (id: string) => db.getFirstSync<Product>('SELECT * FROM inventory_products WHERE id = ?', id);

export function setProductImage(productId: string, imageKey: string | null) {
  db.runSync('UPDATE inventory_products SET image_key=?, updated_at=?, dirty=1 WHERE id=?', imageKey, now(), productId);
}

/** Resolve any scanned value (QR, barcode, later RFID/NFC) to its record. */
export function resolveScan(raw: string): ScanResult {
  const value = raw.trim();
  let ident = db.getFirstSync<{ entity_type: EntityType; entity_id: string }>(
    'SELECT entity_type, entity_id FROM inventory_identifiers WHERE value = ?', value,
  );
  // New labels hold "name / category / CODE"; the item code is on the last line.
  if (!ident) {
    const code = value.match(/([A-Z0-9]{1,5}(?:-[A-Z0-9]{1,5})?-\d{4,})\s*$/i)?.[1];
    if (code) {
      ident = db.getFirstSync<{ entity_type: EntityType; entity_id: string }>(
        'SELECT entity_type, entity_id FROM inventory_identifiers WHERE value = ?', qrValueFor(code.toUpperCase()),
      );
    }
  }
  if (ident) {
    if (ident.entity_type === 'asset') {
      const item = getAsset(ident.entity_id);
      if (item) return { kind: 'asset', item };
    } else if (ident.entity_type === 'lot') {
      const item = getLot(ident.entity_id);
      if (item) return { kind: 'lot', item };
    } else {
      const item = getLocation(ident.entity_id);
      if (item) return { kind: 'location', item };
    }
  }
  return { kind: 'unknown', value };
}

export type InventoryFilter = 'all' | 'available' | 'checked_out' | 'maintenance' | 'stock';

/**
 * Paged search. `limit` grows as the user scrolls, so a catalog with tens of
 * thousands of units never loads more rows than are needed on screen.
 */
export function searchInventory(term: string, filter: InventoryFilter, limit = 60, category: string | null = null, subcategory: string | null = null) {
  const t = term.trim();
  const like = `%${t}%`;
  const codeLike = `${t.toUpperCase()}%`; // "CBL-00" matches from the start of the code
  const statusFilter = filter === 'all' || filter === 'stock' ? null : filter;
  const textClause = "((p.name || ' ' || IFNULL(p.subname,'')) LIKE ? OR $CODE LIKE ? OR (IFNULL(p.category,'') || ' ' || IFNULL(p.subcategory,'')) LIKE ?)";
  const catClause = subcategory ? 'p.category = ? COLLATE NOCASE AND p.subcategory = ? COLLATE NOCASE' : 'p.category = ? COLLATE NOCASE';
  const catParams = category ? (subcategory ? [category, subcategory] : [category]) : [];
  const assetWhere = `a.status != 'retired'${t ? ` AND ${textClause.replace('$CODE', 'a.code')}` : ''}${category ? ` AND ${catClause}` : ''}${statusFilter ? ' AND a.status = ?' : ''}`;
  const assetParams = [...(t ? [like, codeLike, like] : []), ...catParams, ...(statusFilter ? [statusFilter] : [])];
  const lotConds = [...(t ? [textClause.replace('$CODE', 's.code')] : []), ...(category ? [catClause] : [])];
  const lotWhere = lotConds.length ? `WHERE ${lotConds.join(' AND ')}` : '';
  const lotParams = [...(t ? [like, codeLike, like] : []), ...catParams];

  const wantAssets = filter !== 'stock';
  const wantLots = filter === 'all' || filter === 'stock';
  const assets = wantAssets ? db.getAllSync<AssetView>(`${ASSET_SELECT} WHERE ${assetWhere} ORDER BY a.code LIMIT ?`, ...assetParams, limit) : [];
  const lots = wantLots ? db.getAllSync<LotView>(`${LOT_SELECT} ${lotWhere} ORDER BY s.code LIMIT ?`, ...lotParams, limit) : [];
  const assetTotal = wantAssets
    ? db.getFirstSync<{ n: number }>(`SELECT COUNT(*) AS n FROM inventory_assets a JOIN inventory_products p ON p.id = a.product_id WHERE ${assetWhere}`, ...assetParams)?.n ?? 0
    : 0;
  const lotTotal = wantLots
    ? db.getFirstSync<{ n: number }>(`SELECT COUNT(*) AS n FROM inventory_stock_lots s JOIN inventory_products p ON p.id = s.product_id ${lotWhere}`, ...lotParams)?.n ?? 0
    : 0;
  return { assets, lots, assetTotal, lotTotal };
}

/** Available assets and positive-balance stock that can be assigned to a project. */
export function projectAssignableInventory(term: string, limit = 60) {
  const t = term.trim();
  const like = `%${t}%`;
  const codeLike = `${t.toUpperCase()}%`;
  const textClause = "((p.name || ' ' || IFNULL(p.subname,'')) LIKE ? OR $CODE LIKE ? OR (IFNULL(p.category,'') || ' ' || IFNULL(p.subcategory,'')) LIKE ?)";
  const assetWhere = `a.status = 'available'${t ? ` AND ${textClause.replace('$CODE', 'a.code')}` : ''}`;
  const lotWhere = `s.quantity > 0${t ? ` AND ${textClause.replace('$CODE', 's.code')}` : ''}`;
  const params = t ? [like, codeLike, like] : [];
  const assets = db.getAllSync<AssetView>(`${ASSET_SELECT} WHERE ${assetWhere} ORDER BY p.name, a.code LIMIT ?`, ...params, limit);
  const lots = db.getAllSync<LotView>(`${LOT_SELECT} WHERE ${lotWhere} ORDER BY p.name, s.code LIMIT ?`, ...params, limit);
  const assetTotal = db.getFirstSync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM inventory_assets a JOIN inventory_products p ON p.id=a.product_id WHERE ${assetWhere}`,
    ...params,
  )?.n ?? 0;
  const lotTotal = db.getFirstSync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM inventory_stock_lots s JOIN inventory_products p ON p.id=s.product_id WHERE ${lotWhere}`,
    ...params,
  )?.n ?? 0;
  return { assets, lots, assetTotal, lotTotal };
}

export function dashboardStats() {
  const row = db.getFirstSync<Record<string, number>>(`
    SELECT
      COUNT(*) AS total,
      SUM(status = 'available') AS available,
      SUM(status = 'checked_out') AS checked_out,
      SUM(status = 'maintenance') AS maintenance,
      SUM(status = 'checked_out' AND expected_return IS NOT NULL AND expected_return < date('now')) AS overdue
    FROM inventory_assets WHERE status != 'retired'`);
  const lots = db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM inventory_stock_lots')?.n ?? 0;
  const pending = db.getFirstSync<{ n: number }>("SELECT COUNT(*) AS n FROM inventory_movements WHERE sync_state != 'synced'")?.n ?? 0;
  return {
    total: row?.total ?? 0,
    available: row?.available ?? 0,
    checkedOut: row?.checked_out ?? 0,
    maintenance: row?.maintenance ?? 0,
    overdue: row?.overdue ?? 0,
    lots,
    pending,
  };
}

export const listLocations = () => db.getAllSync<Location & { item_count: number }>(`
  SELECT l.*,
    (SELECT COUNT(*) FROM inventory_assets a WHERE a.location_id = l.id AND a.status = 'available') +
    (SELECT COUNT(*) FROM inventory_stock_lots s WHERE s.location_id = l.id) AS item_count
  FROM inventory_locations l ORDER BY l.code`);

export const listProjects = (includeClosed = false) => db.getAllSync<Project & { out_count: number }>(`
  SELECT pr.*, (SELECT COUNT(*) FROM inventory_assets a WHERE a.project_id = pr.id AND a.status = 'checked_out') AS out_count
  FROM inventory_projects pr ${includeClosed ? '' : "WHERE pr.status = 'active'"} ORDER BY pr.status, pr.name`);

export const locationContents = (locationId: string) => ({
  assets: db.getAllSync<AssetView>(`${ASSET_SELECT} WHERE a.location_id = ? AND a.status != 'retired' ORDER BY a.code`, locationId),
  lots: db.getAllSync<LotView>(`${LOT_SELECT} WHERE s.location_id = ? ORDER BY s.code`, locationId),
});

export const projectAssets = (projectId: string) =>
  db.getAllSync<AssetView>(`${ASSET_SELECT} WHERE a.project_id = ? AND a.status = 'checked_out' ORDER BY a.code`, projectId);

export type ProjectStockUsage = {
  lot_id: string;
  code: string;
  name: string;
  subname: string | null;
  unit: string;
  allocated: number;
  available: number;
};

/** Stock taken for a project, grouped by lot. The lot balance remains available to other projects. */
export const projectStockUsage = (projectId: string) => db.getAllSync<ProjectStockUsage>(`
  SELECT s.id AS lot_id, s.code, p.name, p.subname, p.unit,
         SUM(m.quantity) AS allocated, s.quantity AS available
  FROM inventory_movements m
  JOIN inventory_stock_lots s ON m.entity_type='lot' AND s.id=m.entity_id
  JOIN inventory_products p ON p.id=s.product_id
  WHERE m.project_id=? AND m.type='consume'
  GROUP BY s.id, s.code, p.name, p.subname, p.unit, s.quantity
  ORDER BY p.name, p.subname, s.code`, projectId);

export type MovementView = Movement & { label: string; project_name: string | null; to_location_name: string | null; unit: string };

const MOVEMENT_SELECT = `
  SELECT m.*, COALESCE(a.code, s.code) || ' · ' || p.name || IFNULL(' ' || p.subname, '') AS label, p.unit,
         pr.name AS project_name, tl.name AS to_location_name
  FROM inventory_movements m
  LEFT JOIN inventory_assets a ON m.entity_type = 'asset' AND a.id = m.entity_id
  LEFT JOIN inventory_stock_lots s ON m.entity_type = 'lot' AND s.id = m.entity_id
  LEFT JOIN inventory_products p ON p.id = COALESCE(a.product_id, s.product_id)
  LEFT JOIN inventory_projects pr ON pr.id = m.project_id
  LEFT JOIN inventory_locations tl ON tl.id = m.to_location_id`;

export const history = (entityType: 'asset' | 'lot', entityId: string) =>
  db.getAllSync<MovementView>(`${MOVEMENT_SELECT} WHERE m.entity_type = ? AND m.entity_id = ? ORDER BY m.created_at DESC`, entityType, entityId);

export const projectHistory = (projectId: string) =>
  db.getAllSync<MovementView>(`${MOVEMENT_SELECT} WHERE m.project_id = ? ORDER BY m.created_at DESC LIMIT 200`, projectId);

export const recentMovements = (limit = 20) =>
  db.getAllSync<MovementView>(`${MOVEMENT_SELECT} ORDER BY m.created_at DESC LIMIT ?`, limit);

// ---------------------------------------------------------------------------
// Catalog writes
// ---------------------------------------------------------------------------

export interface NewItemInput {
  name: string;
  /** e.g. "1.5 mm red" for name "Wire" */
  subname?: string;
  kind: ProductKind;
  /** code prefix; derived from category › subcategory when empty (CBL-HDM) */
  prefix?: string;
  category?: string;
  /** e.g. "HDMI" under category "Cables" */
  subcategory?: string;
  unit?: string;
  notes?: string;
  locationId?: string | null;
  /** asset: number of physical units to create, each with its own QR */
  count?: number;
  /** consumable / quantity: opening balance */
  quantity?: number;
  batch?: string;
  supplier?: string;
  barcode?: string;
  /** Object key in the private Neon `assets` bucket. */
  imageKey?: string;
}

type CreatedItem = { entityType: 'asset' | 'lot'; ids: string[] };

/** Creates a product and its assets (one per unit) or a stock lot, each with a QR identifier. */
export function createItem(input: NewItemInput): CreatedItem {
  let result!: CreatedItem;
  db.withTransactionSync(() => {
    result = createItemTx(input);
  });
  return result;
}

export const MAX_UNITS_PER_ITEM = 2000;

/** "Electrical Wire" -> "ELE", "HDMI Cable" -> "HDM". Codes look like ELE-0001. */
export function derivePrefix(source: string) {
  return source.trim().toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(/\s+/)[0]?.slice(0, 3) ?? '';
}

/** Categories already in use, most used first - shown as suggestions while typing. */
export function listCategories(): string[] {
  return db
    .getAllSync<{ category: string }>("SELECT category FROM inventory_products WHERE category IS NOT NULL AND category != '' GROUP BY category COLLATE NOCASE ORDER BY COUNT(*) DESC, category LIMIT 40")
    .map((r) => r.category);
}

/** "Wire" + "1.5 mm red" -> "Wire · 1.5 mm red" */
export const fullName = (i: { name: string; subname?: string | null }) => (i.subname ? `${i.name} · ${i.subname}` : i.name);

/** Core of createItem; the caller owns the transaction so bulk import can run thousands of rows in one. */
function createItemTx(input: NewItemInput): CreatedItem {
  const name = input.name.trim();
  if (!name) throw new InventoryError('Name is required.');
  const prefix = cleanPrefix(input.prefix?.trim() ? input.prefix : codePrefixFor(input.category, input.subcategory) || derivePrefix(name)) || 'ITEM';
  const subcategory = input.subcategory?.trim() || null;
  const ts = now();
  const ids: string[] = [];
  const unit = input.unit?.trim() || (input.kind === 'consumable' ? 'm' : 'pcs');

  {
    // More units of a product you already have reuse it instead of duplicating the catalog.
    const subname = input.subname?.trim() || null;
    const existing = db.getFirstSync<{ id: string }>(
      `SELECT id FROM inventory_products WHERE name = ? COLLATE NOCASE AND IFNULL(subname,'') = ? COLLATE NOCASE AND IFNULL(subcategory,'') = ? COLLATE NOCASE AND kind = ? AND prefix = ?`,
      name, subname ?? '', subcategory ?? '', input.kind, prefix,
    );
    const productId = existing?.id ?? newId();
    if (!existing) {
      db.runSync(
        'INSERT INTO inventory_products (id, name, subname, kind, prefix, category, subcategory, unit, notes, image_key, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        productId, name, subname, input.kind, prefix, input.category?.trim() || null, subcategory, unit, input.notes?.trim() || null, input.imageKey ?? null, ts,
      );
    } else if (input.imageKey) {
      db.runSync('UPDATE inventory_products SET image_key=?, updated_at=?, dirty=1 WHERE id=?', input.imageKey, ts, productId);
    }

    if (input.kind === 'asset') {
      const count = Math.max(1, Math.min(MAX_UNITS_PER_ITEM, Math.floor(input.count ?? 1)));
      if (input.barcode && count > 1) {
        throw new InventoryError('A manufacturer barcode identifies one unit only. Leave it empty when creating several.');
      }
      const start = maxItemNumber(prefix);
      for (let i = 1; i <= count; i++) {
        const id = newId();
        const code = formatCode(prefix, start + i);
        db.runSync(
          'INSERT INTO inventory_assets (id, product_id, code, location_id, updated_at) VALUES (?,?,?,?,?)',
          id, productId, code, input.locationId ?? null, ts,
        );
        addIdentifier('asset', id, 'qr', qrValueFor(code));
        if (input.barcode) addIdentifier('asset', id, 'barcode', input.barcode.trim());
        ids.push(id);
      }
    } else {
      const qty = Number(input.quantity ?? 0);
      if (!(qty >= 0)) throw new InventoryError('Quantity must be zero or more.');
      const id = newId();
      const code = formatCode(prefix, maxItemNumber(prefix) + 1);
      db.runSync(
        'INSERT INTO inventory_stock_lots (id, product_id, code, quantity, location_id, batch, supplier, purchase_date, updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
        id, productId, code, qty, input.locationId ?? null, input.batch?.trim() || null, input.supplier?.trim() || null, ts.slice(0, 10), ts,
      );
      addIdentifier('lot', id, 'qr', qrValueFor(code));
      if (input.barcode) addIdentifier('lot', id, 'barcode', input.barcode.trim());
      // Opening balance is recorded as a movement so the server can rebuild quantity from the ledger.
      if (qty > 0) {
        insertMovement({ txnId: newId(), type: 'receive', entityType: 'lot', entityId: id, quantity: qty, toLocationId: input.locationId ?? null, notes: 'Opening balance' });
      }
      ids.push(id);
    }
  }
  return { entityType: input.kind === 'asset' ? 'asset' : 'lot', ids };
}

// ---------------------------------------------------------------------------
// Bulk import (CSV) - for loading a large existing catalog in one go
// ---------------------------------------------------------------------------

export interface ImportRow extends Omit<NewItemInput, 'locationId'> {
  /** location name; created automatically if it does not exist */
  location?: string;
}

export interface ImportResult {
  rows: number;
  products: number;
  assets: number;
  lots: number;
  locationsCreated: number;
  errors: { row: number; message: string }[];
  created: { entityType: 'asset' | 'lot'; id: string }[];
}

/**
 * Imports many rows in a single transaction. Each row runs inside a SAVEPOINT so a bad
 * row is reported and skipped without losing the rest. Locations are matched by name.
 */
export function importItems(rows: ImportRow[]): ImportResult {
  const result: ImportResult = { rows: rows.length, products: 0, assets: 0, lots: 0, locationsCreated: 0, errors: [], created: [] };
  const locationIds = new Map<string, string>(
    db.getAllSync<{ id: string; name: string }>('SELECT id, name FROM inventory_locations').map((l) => [l.name.toLowerCase(), l.id]),
  );
  const countProducts = () => db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM inventory_products')?.n ?? 0;
  const productsBefore = countProducts();

  db.withTransactionSync(() => {
    rows.forEach((row, i) => {
      db.execSync('SAVEPOINT import_row');
      try {
        let locationId: string | null = null;
        const locName = row.location?.trim();
        if (locName) {
          locationId = locationIds.get(locName.toLowerCase()) ?? null;
          if (!locationId) {
            locationId = createLocationTx(locName, 'shelf', null);
            locationIds.set(locName.toLowerCase(), locationId);
            result.locationsCreated++;
          }
        }
        const r = createItemTx({ ...row, locationId });
        r.ids.forEach((id) => result.created.push({ entityType: r.entityType, id }));
        if (r.entityType === 'asset') result.assets += r.ids.length;
        else result.lots += r.ids.length;
        db.execSync('RELEASE import_row');
      } catch (e) {
        db.execSync('ROLLBACK TO import_row; RELEASE import_row');
        result.errors.push({ row: i + 2, message: e instanceof Error ? e.message : String(e) }); // +2: header line, 1-based
      }
    });
  });
  result.products = countProducts() - productsBefore;
  return result;
}

export function createLocation(name: string, type: string, parentId: string | null = null): string {
  let id = '';
  db.withTransactionSync(() => {
    id = createLocationTx(name, type, parentId);
  });
  return id;
}

function createLocationTx(name: string, type: string, parentId: string | null): string {
  if (!name.trim()) throw new InventoryError('Location name is required.');
  const id = newId();
  const code = nextCode('inventory_locations', 'LOC');
  db.runSync('INSERT INTO inventory_locations (id, code, name, type, parent_id, updated_at) VALUES (?,?,?,?,?,?)', id, code, name.trim(), type, parentId, now());
  addIdentifier('location', id, 'qr', qrValueFor(code));
  return id;
}

export function createProject(name: string): string {
  if (!name.trim()) throw new InventoryError('Project name is required.');
  const id = newId();
  db.runSync('INSERT INTO inventory_projects (id, code, name, updated_at) VALUES (?,?,?,?)', id, nextCode('inventory_projects', 'PRJ'), name.trim(), now());
  return id;
}

export function setProjectStatus(id: string, status: 'active' | 'closed') {
  if (status === 'closed' && projectAssets(id).length > 0) {
    throw new InventoryError('Return all equipment before closing this project.');
  }
  db.runSync('UPDATE inventory_projects SET status = ?, updated_at = ?, dirty = 1 WHERE id = ?', status, now(), id);
}

// ---------------------------------------------------------------------------
// Movements - the only way stock and asset status change
// ---------------------------------------------------------------------------

interface MovementInput {
  txnId: string;
  type: MovementType;
  entityType: 'asset' | 'lot';
  entityId: string;
  quantity?: number | null;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  projectId?: string | null;
  expectedReturn?: string | null;
  notes?: string | null;
}

function insertMovement(m: MovementInput) {
  db.runSync(
    `INSERT INTO inventory_movements (id, txn_id, type, entity_type, entity_id, quantity, from_location_id, to_location_id,
       project_id, staff, expected_return, notes, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    newId(), m.txnId, m.type, m.entityType, m.entityId, m.quantity ?? null, m.fromLocationId ?? null,
    m.toLocationId ?? null, m.projectId ?? null, currentStaff(), m.expectedReturn ?? null, m.notes ?? null, now(),
  );
}

export interface ActionOptions {
  projectId?: string | null;
  expectedReturn?: string | null;
  locationId?: string | null;
  quantity?: number;
  notes?: string | null;
  condition?: string;
}

export type CartLine = { entityType: 'asset' | 'lot'; entityId: string; quantity?: number };

/** Validate and apply one line; must run inside a transaction. */
function applyLine(txnId: string, action: MovementType, line: CartLine, opts: ActionOptions) {
  const ts = now();
  if (line.entityType === 'asset') {
    const a = getAsset(line.entityId);
    if (!a) throw new InventoryError('Asset not found.');
    switch (action) {
      case 'issue':
        if (a.status !== 'available') throw new InventoryError(`${a.code} is ${a.status.replace('_', ' ')}, cannot issue.`);
        if (!opts.projectId) throw new InventoryError('Choose a project to issue to.');
        db.runSync(
          "UPDATE inventory_assets SET status='checked_out', project_id=?, holder=?, expected_return=?, updated_at=? WHERE id=?",
          opts.projectId, currentStaff(), opts.expectedReturn ?? null, ts, a.id,
        );
        insertMovement({ txnId, type: 'issue', entityType: 'asset', entityId: a.id, fromLocationId: a.location_id, projectId: opts.projectId, expectedReturn: opts.expectedReturn, notes: opts.notes });
        break;
      case 'return':
        if (a.status !== 'checked_out') throw new InventoryError(`${a.code} is not checked out.`);
        db.runSync(
          "UPDATE inventory_assets SET status='available', project_id=NULL, holder=NULL, expected_return=NULL, location_id=COALESCE(?, location_id), condition=COALESCE(?, condition), updated_at=? WHERE id=?",
          opts.locationId ?? null, opts.condition ?? null, ts, a.id,
        );
        insertMovement({ txnId, type: 'return', entityType: 'asset', entityId: a.id, toLocationId: opts.locationId ?? a.location_id, projectId: a.project_id, notes: opts.notes });
        break;
      case 'transfer':
        if (!opts.locationId) throw new InventoryError('Choose a destination location.');
        db.runSync('UPDATE inventory_assets SET location_id=?, updated_at=? WHERE id=?', opts.locationId, ts, a.id);
        insertMovement({ txnId, type: 'transfer', entityType: 'asset', entityId: a.id, fromLocationId: a.location_id, toLocationId: opts.locationId, notes: opts.notes });
        break;
      case 'maintenance':
        if (a.status !== 'available') throw new InventoryError(`${a.code} must be available to send for maintenance.`);
        db.runSync("UPDATE inventory_assets SET status='maintenance', updated_at=? WHERE id=?", ts, a.id);
        insertMovement({ txnId, type: 'maintenance', entityType: 'asset', entityId: a.id, notes: opts.notes });
        break;
      case 'restore':
        if (a.status !== 'maintenance') throw new InventoryError(`${a.code} is not in maintenance.`);
        db.runSync("UPDATE inventory_assets SET status='available', condition=COALESCE(?, condition), updated_at=? WHERE id=?", opts.condition ?? null, ts, a.id);
        insertMovement({ txnId, type: 'restore', entityType: 'asset', entityId: a.id, notes: opts.notes });
        break;
      default:
        throw new InventoryError(`Action "${action}" does not apply to individual assets.`);
    }
    return;
  }

  const s = getLot(line.entityId);
  if (!s) throw new InventoryError('Stock not found.');
  const qty = Number(line.quantity ?? opts.quantity);
  switch (action) {
    case 'consume':
    case 'issue': {
      if (!(qty > 0)) throw new InventoryError(`Enter how much ${s.unit} of ${s.code} was taken.`);
      if (qty > s.quantity) throw new InventoryError(`Only ${fmtQty(s.quantity)} ${s.unit} of ${s.code} left.`);
      db.runSync('UPDATE inventory_stock_lots SET quantity = quantity - ?, updated_at=? WHERE id=?', qty, ts, s.id);
      insertMovement({ txnId, type: 'consume', entityType: 'lot', entityId: s.id, quantity: qty, fromLocationId: s.location_id, projectId: opts.projectId, notes: opts.notes });
      break;
    }
    case 'receive':
      if (!(qty > 0)) throw new InventoryError('Enter the quantity received.');
      db.runSync('UPDATE inventory_stock_lots SET quantity = quantity + ?, updated_at=? WHERE id=?', qty, ts, s.id);
      insertMovement({ txnId, type: 'receive', entityType: 'lot', entityId: s.id, quantity: qty, toLocationId: s.location_id, notes: opts.notes });
      break;
    case 'adjust': {
      if (!(qty >= 0)) throw new InventoryError('Enter the counted quantity.');
      const delta = qty - s.quantity;
      if (delta === 0) return;
      db.runSync('UPDATE inventory_stock_lots SET quantity = ?, updated_at=? WHERE id=?', qty, ts, s.id);
      insertMovement({ txnId, type: 'adjust', entityType: 'lot', entityId: s.id, quantity: delta, notes: opts.notes ?? `Counted ${qty}` });
      break;
    }
    case 'transfer':
      if (!opts.locationId) throw new InventoryError('Choose a destination location.');
      db.runSync('UPDATE inventory_stock_lots SET location_id=?, updated_at=? WHERE id=?', opts.locationId, ts, s.id);
      insertMovement({ txnId, type: 'transfer', entityType: 'lot', entityId: s.id, fromLocationId: s.location_id, toLocationId: opts.locationId, notes: opts.notes });
      break;
    default:
      throw new InventoryError(`Action "${action}" does not apply to stock.`);
  }
}

/**
 * Apply an action to one or many lines as a single all-or-nothing transaction.
 * Used both by the single-item screen and the multi-scan cart.
 */
export function applyAction(action: MovementType, lines: CartLine[], opts: ActionOptions = {}): string {
  if (lines.length === 0) throw new InventoryError('Nothing to process.');
  const txnId = newId();
  db.withTransactionSync(() => {
    for (const line of lines) applyLine(txnId, action, line, opts);
  });
  return txnId;
}

export function fmtQty(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

/** The code the next unit with this prefix will get, for live previews ("CBL-HDM-0013"). */
export function nextItemCode(prefix: string): string {
  const p = cleanPrefix(prefix) || 'ITEM';
  return formatCode(p, maxItemNumber(p) + 1);
}

/** Item counts per category › subcategory, for the category browser. */
export function categoryCounts() {
  return db.getAllSync<{ category: string | null; subcategory: string | null; units: number; lots: number }>(`
    SELECT p.category, p.subcategory,
      (SELECT COUNT(*) FROM inventory_assets a WHERE a.product_id IN (SELECT id FROM inventory_products p2 WHERE IFNULL(p2.category,'') = IFNULL(p.category,'') AND IFNULL(p2.subcategory,'') = IFNULL(p.subcategory,'')) AND a.status != 'retired') AS units,
      (SELECT COUNT(*) FROM inventory_stock_lots s WHERE s.product_id IN (SELECT id FROM inventory_products p2 WHERE IFNULL(p2.category,'') = IFNULL(p.category,'') AND IFNULL(p2.subcategory,'') = IFNULL(p.subcategory,''))) AS lots
    FROM inventory_products p
    GROUP BY IFNULL(p.category,''), IFNULL(p.subcategory,'')`);
}

/** "Cables › HDMI" */
export const categoryPath = (i: { category?: string | null; subcategory?: string | null }) =>
  [i.category, i.subcategory].filter(Boolean).join(' › ') || null;

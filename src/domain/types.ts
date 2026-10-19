/**
 * Core domain model.
 *
 * A physical thing has a permanent database id. QR codes, barcodes, RFID EPCs and
 * NFC UIDs are only *identifiers* that point at that record, so new scanning
 * technologies can be added later without re-entering inventory.
 */

/** How a product behaves in the store room. */
export type ProductKind =
  | 'asset' // reusable, one QR per physical unit (HDMI cable CBL-0042)
  | 'consumable' // measured stock that gets used up (100 m wire roll)
  | 'quantity'; // counted stock, tag the box not the pieces (200 connectors)

export type AssetStatus = 'available' | 'checked_out' | 'maintenance' | 'retired';

export type EntityType = 'asset' | 'lot' | 'location';

export type IdentifierType = 'qr' | 'barcode' | 'rfid' | 'nfc';

export type MovementType =
  | 'receive' // stock added
  | 'issue' // asset checked out / stock taken for a project
  | 'return' // asset returned
  | 'consume' // stock used (metres, pieces)
  | 'adjust' // audit correction
  | 'transfer' // moved to another location
  | 'maintenance' // asset sent to maintenance
  | 'restore'; // asset back from maintenance

export type SyncState = 'pending' | 'synced' | 'conflict';

export interface Product {
  id: string;
  name: string;
  subname: string | null;
  kind: ProductKind;
  prefix: string; // CBL-HDM, TOL-PWT ...
  category: string | null;
  subcategory: string | null;
  unit: string; // pcs, m, box
  notes: string | null;
  image_key: string | null;
}

export interface Asset {
  id: string;
  product_id: string;
  code: string; // CBL-0042
  status: AssetStatus;
  condition: string;
  location_id: string | null;
  project_id: string | null;
  holder: string | null;
  expected_return: string | null;
}

export interface StockLot {
  id: string;
  product_id: string;
  code: string; // WIR-0001
  quantity: number;
  location_id: string | null;
  batch: string | null;
  supplier: string | null;
  purchase_date: string | null;
}

export interface Location {
  id: string;
  code: string; // LOC-0003
  name: string; // Cable Wall / Hook 3
  type: string; // room | rack | shelf | hook | bin
  parent_id: string | null;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  status: 'active' | 'closed';
}

export interface Identifier {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  type: IdentifierType;
  value: string;
}

export interface Movement {
  id: string;
  txn_id: string; // groups a multi-scan cart into one transaction
  type: MovementType;
  entity_type: 'asset' | 'lot';
  entity_id: string;
  quantity: number | null;
  from_location_id: string | null;
  to_location_id: string | null;
  project_id: string | null;
  staff: string;
  expected_return: string | null;
  notes: string | null;
  created_at: string;
  sync_state: SyncState;
  sync_error: string | null;
}

/** An asset joined with its product and location, for display. */
export interface AssetView extends Asset {
  name: string;
  subname: string | null;
  unit: string;
  category: string | null;
  subcategory: string | null;
  location_name: string | null;
  project_name: string | null;
  image_key: string | null;
}

export interface LotView extends StockLot {
  name: string;
  subname: string | null;
  kind: ProductKind;
  unit: string;
  category: string | null;
  subcategory: string | null;
  location_name: string | null;
  image_key: string | null;
}

export type ScanResult =
  | { kind: 'asset'; item: AssetView }
  | { kind: 'lot'; item: LotView }
  | { kind: 'location'; item: Location }
  | { kind: 'unknown'; value: string };

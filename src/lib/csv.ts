import type { ImportRow } from '../services/inventory';
import type { ProductKind } from '../domain/types';

/** RFC 4180-ish parser: quoted fields, escaped quotes (""), commas/newlines inside quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, ''); // Excel BOM
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',' || c === ';' || c === '\t') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

export const TEMPLATE_HEADERS = ['name', 'subname', 'type', 'prefix', 'category', 'subcategory', 'units', 'quantity', 'unit', 'location', 'barcode', 'supplier', 'batch'];

export const TEMPLATE_CSV = [
  TEMPLATE_HEADERS.join(','),
  'HDMI cable,10 m,asset,,Cables,HDMI,20,,,Cable Wall / Hook 3,,,',
  'Loose wire,1.5 sq mm red,consumable,,Cables,Loose wire (by metre),,100,m,Rack A / Shelf 2,,Polycab,B-2026-01',
  'Angle grinder,Bosch 4 inch,asset,,Tools,Power tool,2,,,Tool Cabinet,,,',
  'ESP32,DevKit V1,quantity,,IoT & electronics,Microcontroller / SBC,,25,pcs,IoT Bin 1,,,',
].join('\n');

/** Accepts common header spellings so exports from Excel / Tally / other tools map without editing. */
const ALIASES: Record<string, keyof ImportRow | 'type'> = {
  name: 'name', item: 'name', product: 'name', 'item name': 'name', 'product name': 'name',
  subname: 'subname', 'sub name': 'subname', 'sub-name': 'subname', variant: 'subname', size: 'subname', spec: 'subname', specification: 'subname', description: 'subname',
  type: 'type', kind: 'type',
  prefix: 'prefix', code: 'prefix', 'code prefix': 'prefix',
  category: 'category', group: 'category',
  subcategory: 'subcategory', 'sub category': 'subcategory', 'sub-category': 'subcategory', type2: 'subcategory', subtype: 'subcategory', 'item type': 'subcategory',
  units: 'count', count: 'count', 'no of units': 'count', pieces: 'count',
  quantity: 'quantity', qty: 'quantity', stock: 'quantity', balance: 'quantity',
  unit: 'unit', uom: 'unit',
  location: 'location', shelf: 'location', rack: 'location', bin: 'location',
  barcode: 'barcode', ean: 'barcode', upc: 'barcode', sku: 'barcode',
  supplier: 'supplier', vendor: 'supplier',
  batch: 'batch', lot: 'batch',
  notes: 'notes', remarks: 'notes',
};

function toKind(v: string): ProductKind {
  const s = v.trim().toLowerCase();
  if (s.startsWith('cons') || s === 'roll' || s === 'measured') return 'consumable';
  if (s.startsWith('qty') || s.startsWith('quant') || s === 'box' || s === 'stock') return 'quantity';
  return 'asset';
}


export interface ParsedImport {
  rows: ImportRow[];
  unknownColumns: string[];
  missingName: boolean;
}

export function csvToImportRows(text: string): ParsedImport {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], unknownColumns: [], missingName: true };
  const headers = table[0].map((h) => h.trim().toLowerCase());
  const map = headers.map((h) => ALIASES[h]);
  const unknownColumns = headers.filter((h, i) => h && !map[i]);
  const missingName = !map.includes('name');

  const rows = table.slice(1).map((cells) => {
    const rec: Record<string, string> = {};
    map.forEach((key, i) => {
      if (key) rec[key] = (cells[i] ?? '').trim();
    });
    const kind = rec.type ? toKind(rec.type) : rec.quantity && !rec.count ? 'quantity' : 'asset';
    const num = (v?: string) => (v ? Number(v.replace(/,/g, '')) : undefined);
    return {
      name: rec.name ?? '',
      subname: rec.subname || undefined,
      kind,
      prefix: rec.prefix || undefined,
      category: rec.category || undefined,
      subcategory: rec.subcategory || undefined,
      unit: rec.unit || undefined,
      count: num(rec.count),
      quantity: num(rec.quantity),
      location: rec.location || undefined,
      barcode: rec.barcode || undefined,
      supplier: rec.supplier || undefined,
      batch: rec.batch || undefined,
      notes: rec.notes || undefined,
    } satisfies ImportRow;
  });
  return { rows, unknownColumns, missingName };
}

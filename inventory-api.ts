import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Pool, type PoolClient } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
const s3 = new S3Client({
  endpoint: process.env.AWS_ENDPOINT_URL_S3,
  region: process.env.AWS_REGION ?? 'us-east-1',
  forcePathStyle: true,
});

const catalog = {
  inventory_products: ['id','name','subname','kind','prefix','category','subcategory','unit','notes','image_key'],
  inventory_locations: ['id','code','name','type','parent_id'],
  inventory_projects: ['id','code','name','status'],
  inventory_assets: ['id','product_id','code','condition','location_id'],
  inventory_stock_lots: ['id','product_id','code','location_id','batch','supplier','purchase_date'],
  inventory_identifiers: ['id','entity_type','entity_id','type','value'],
} as const;

type CatalogTable = keyof typeof catalog;
type Row = Record<string, unknown>;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
});

function authorized(request: Request) {
  const expected = process.env.INVENTORY_API_KEY;
  return Boolean(expected) && request.headers.get('x-inventory-key') === expected;
}

async function upsertRows(client: PoolClient, table: CatalogTable, rows: Row[]) {
  const columns = catalog[table];
  for (const row of rows) {
    const values = columns.map((column) => row[column] ?? null);
    const params = columns.map((_, index) => `$${index + 1}`).join(',');
    const updates = columns.filter((column) => column !== 'id').map((column) => `${column}=excluded.${column}`).join(',');
    await client.query(
      `insert into ${table} (${columns.join(',')}) values (${params}) on conflict(id) do update set ${updates}`,
      values,
    );
  }
}

async function applyMovement(client: PoolClient, movement: Row) {
  await client.query(
    'select inventory_apply_movement($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
    [movement.id, movement.txn_id, movement.type, movement.entity_type, movement.entity_id,
      movement.quantity, movement.from_location_id, movement.to_location_id, movement.project_id,
      movement.staff, movement.expected_return, movement.notes, movement.created_at],
  );
}

async function synchronize(body: { catalog?: Partial<Record<CatalogTable, Row[]>>; movements?: Row[]; since?: string }) {
  const client = await pool.connect();
  const conflicts: { id: unknown; error: string }[] = [];
  const applied: unknown[] = [];
  try {
    await client.query('begin');
    for (const table of Object.keys(catalog) as CatalogTable[]) {
      await upsertRows(client, table, body.catalog?.[table] ?? []);
    }

    const groups = new Map<unknown, Row[]>();
    for (const movement of body.movements ?? []) {
      const lines = groups.get(movement.txn_id) ?? [];
      lines.push(movement);
      groups.set(movement.txn_id, lines);
    }
    let groupNumber = 0;
    for (const lines of groups.values()) {
      const savepoint = `movement_group_${groupNumber++}`;
      await client.query(`savepoint ${savepoint}`);
      try {
        for (const movement of lines) await applyMovement(client, movement);
        applied.push(...lines.map((movement) => movement.id));
        await client.query(`release savepoint ${savepoint}`);
      } catch (error) {
        await client.query(`rollback to savepoint ${savepoint}`);
        const message = error instanceof Error ? error.message : String(error);
        conflicts.push(...lines.map((movement) => ({ id: movement.id, error: message })));
      }
    }
    await client.query('commit');

    const since = body.since && !Number.isNaN(Date.parse(body.since)) ? body.since : '1970-01-01T00:00:00.000Z';
    // Capture the cursor before reading so writes arriving during the pull are returned next time.
    const cursor = new Date().toISOString();
    const changes: Record<string, Row[]> = {};
    for (const [table, columns] of Object.entries(catalog)) {
      const pullColumns = table === 'inventory_assets'
        ? [...columns, 'status','project_id','holder','expected_return']
        : table === 'inventory_stock_lots' ? [...columns, 'quantity'] : [...columns];
      const result = await pool.query(`select ${pullColumns.join(',')}, updated_at from ${table} where updated_at > $1 and updated_at <= $2 order by updated_at,id`, [since, cursor]);
      changes[table] = result.rows;
    }
    const movementRows = await pool.query('select * from inventory_movements where received_at > $1 and received_at <= $2 order by received_at,id', [since, cursor]);
    return { applied, conflicts, changes, movements: movementRows.rows, cursor };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type,x-inventory-key',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
      }});
    }
    if (!authorized(request)) return json({ error: 'Unauthorized' }, 401);
    const url = new URL(request.url);
    try {
      if (request.method === 'GET' && url.pathname.endsWith('/health')) {
        const database = await pool.query<{ now: string }>('select now()::text as now');
        await s3.send(new ListObjectsV2Command({ Bucket: 'assets', MaxKeys: 1 }));
        return json({ ok: true, version: 'product-images-v1', postgres: database.rows[0].now, objectStorage: 'ok', aiGateway: 'disabled-free-plan' });
      }
      if (request.method === 'POST' && url.pathname.endsWith('/sync')) {
        return json(await synchronize(await request.json()));
      }
      if (request.method === 'POST' && url.pathname.endsWith('/images')) {
        const body = await request.json() as { base64?: string; contentType?: string };
        const contentType = body.contentType?.toLowerCase() ?? '';
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) return json({ error: 'Only JPEG, PNG, and WebP images are supported.' }, 400);
        if (!body.base64) return json({ error: 'Image data is required.' }, 400);
        const bytes = Buffer.from(body.base64, 'base64');
        if (!bytes.length || bytes.length > 8 * 1024 * 1024) return json({ error: 'Image must be smaller than 8 MB.' }, 400);
        const extension = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
        const key = `products/${crypto.randomUUID()}.${extension}`;
        await s3.send(new PutObjectCommand({ Bucket: 'assets', Key: key, Body: bytes, ContentType: contentType, CacheControl: 'private, max-age=3600' }));
        return json({ key }, 201);
      }
      if (request.method === 'GET' && url.pathname.endsWith('/image-data')) {
        const key = url.searchParams.get('key');
        if (!key || !key.startsWith('products/')) return json({ error: 'Invalid image key.' }, 400);
        const object = await s3.send(new GetObjectCommand({ Bucket: 'assets', Key: key }));
        const bytes = await object.Body?.transformToByteArray();
        if (!bytes) return json({ error: 'Image not found.' }, 404);
        const contentType = object.ContentType ?? 'image/jpeg';
        return json({ dataUri: `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}` });
      }
      if (request.method === 'GET' && url.pathname.endsWith('/images')) {
        const key = url.searchParams.get('key');
        if (!key || !key.startsWith('products/')) return json({ error: 'Invalid image key.' }, 400);
        const object = await s3.send(new GetObjectCommand({ Bucket: 'assets', Key: key }));
        const bytes = await object.Body?.transformToByteArray();
        if (!bytes) return json({ error: 'Image not found.' }, 404);
        return new Response(bytes as BodyInit, { headers: {
          'content-type': object.ContentType ?? 'application/octet-stream',
          'cache-control': object.CacheControl ?? 'private, max-age=3600',
          'access-control-allow-origin': '*',
        }});
      }
      return json({ error: 'Not found' }, 404);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  },
};

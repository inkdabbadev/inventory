-- INK DABBA Inventory - Supabase / PostgreSQL schema
-- Run in the Supabase SQL editor (or `supabase db push`).
--
-- Naming: every object this app owns starts with `inventory_` (tables, functions, the
-- role type), so it can live safely in a Supabase project shared with other apps.
--
-- Design rules
--  * Every physical thing has a permanent UUID. QR / barcode / RFID / NFC values are rows
--    in `identifiers` pointing at it, so new scanning tech never means re-entering inventory.
--  * Multi-company from day one: every table has company_id, enforced by RLS.
--  * Stock quantity and asset status change ONLY through `inventory_apply_movement`, which validates
--    business rules in a transaction (no double issue, no negative stock) and writes the ledger.
--  * Mobile clients generate UUIDs offline; upserts are idempotent.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tenancy & roles
-- ---------------------------------------------------------------------------
create table if not exists inventory_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create type inventory_role as enum ('admin', 'manager', 'staff');

create table if not exists inventory_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references inventory_companies(id),
  full_name text,
  role inventory_role not null default 'staff',
  created_at timestamptz not null default now()
);

create or replace function inventory_company_id() returns uuid
language sql stable security definer set search_path = public as $$
  select company_id from inventory_profiles where id = auth.uid()
$$;

create or replace function inventory_has_role(roles inventory_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from inventory_profiles where id = auth.uid() and role = any(roles))
$$;

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------
create table if not exists inventory_products (
  id uuid primary key,
  company_id uuid not null default inventory_company_id() references inventory_companies(id),
  name text not null,
  subname text,                                  -- e.g. name "Wire", subname "1.5 mm red"
  kind text not null check (kind in ('asset', 'consumable', 'quantity')),
  prefix text not null,
  category text,                                 -- e.g. Cables
  subcategory text,                              -- e.g. HDMI   (item codes: CBL-HDM-0001)
  unit text not null default 'pcs',
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists inventory_locations (
  id uuid primary key,
  company_id uuid not null default inventory_company_id() references inventory_companies(id),
  code text not null,
  name text not null,
  type text not null default 'shelf',
  parent_id uuid references inventory_locations(id),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

create table if not exists inventory_projects (
  id uuid primary key,
  company_id uuid not null default inventory_company_id() references inventory_companies(id),
  code text not null,
  name text not null,
  status text not null default 'active' check (status in ('active', 'closed')),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

create table if not exists inventory_assets (
  id uuid primary key,
  company_id uuid not null default inventory_company_id() references inventory_companies(id),
  product_id uuid not null references inventory_products(id),
  code text not null,
  status text not null default 'available' check (status in ('available', 'checked_out', 'maintenance', 'retired')),
  condition text not null default 'good',
  location_id uuid references inventory_locations(id),
  project_id uuid references inventory_projects(id),
  holder text,
  expected_return date,
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

create table if not exists inventory_stock_lots (
  id uuid primary key,
  company_id uuid not null default inventory_company_id() references inventory_companies(id),
  product_id uuid not null references inventory_products(id),
  code text not null,
  quantity numeric not null default 0 check (quantity >= 0),
  location_id uuid references inventory_locations(id),
  batch text,
  supplier text,
  purchase_date date,
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

create table if not exists inventory_identifiers (
  id uuid primary key,
  company_id uuid not null default inventory_company_id() references inventory_companies(id),
  entity_type text not null check (entity_type in ('asset', 'lot', 'location')),
  entity_id uuid not null,
  type text not null check (type in ('qr', 'barcode', 'rfid', 'nfc')),
  value text not null,
  updated_at timestamptz not null default now(),
  unique (company_id, value)
);
create index if not exists identifiers_entity_idx on inventory_identifiers (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------------
create table if not exists inventory_movements (
  id uuid primary key,
  company_id uuid not null default inventory_company_id() references inventory_companies(id),
  txn_id uuid not null,
  type text not null check (type in ('receive','issue','return','consume','adjust','transfer','maintenance','restore')),
  entity_type text not null check (entity_type in ('asset', 'lot')),
  entity_id uuid not null,
  quantity numeric,
  from_location_id uuid references inventory_locations(id),
  to_location_id uuid references inventory_locations(id),
  project_id uuid references inventory_projects(id),
  staff text not null,
  user_id uuid default auth.uid() references auth.users(id),
  expected_return date,
  notes text,
  created_at timestamptz not null,          -- device time of the scan
  received_at timestamptz not null default now()
);
create index if not exists movements_entity_idx on inventory_movements (entity_type, entity_id, created_at);
create index if not exists movements_project_idx on inventory_movements (project_id);

-- updated_at maintenance for incremental pulls
create or replace function inventory_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['inventory_products','inventory_locations','inventory_projects','inventory_assets','inventory_stock_lots','inventory_identifiers'] loop
    execute format('drop trigger if exists %1$s_touch on %1$s; create trigger %1$s_touch before insert or update on %1$s for each row execute function inventory_touch_updated_at();', t);
  end loop;
end $$;

-- Ledger-owned columns cannot be changed by a plain upsert from the client.
create or replace function inventory_protect_ledger() returns trigger language plpgsql as $$
begin
  if current_setting('ink.applying_movement', true) is distinct from 'on' then
    if tg_table_name = 'inventory_assets' then
      if tg_op = 'INSERT' then
        new.status := 'available'; new.project_id := null; new.holder := null; new.expected_return := null;
      else
        new.status := old.status; new.project_id := old.project_id; new.holder := old.holder; new.expected_return := old.expected_return;
      end if;
    elsif tg_table_name = 'inventory_stock_lots' then
      new.quantity := case when tg_op = 'INSERT' then 0 else old.quantity end;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists assets_protect on inventory_assets;
create trigger assets_protect before insert or update on inventory_assets for each row execute function inventory_protect_ledger();
drop trigger if exists stock_lots_protect on inventory_stock_lots;
create trigger stock_lots_protect before insert or update on inventory_stock_lots for each row execute function inventory_protect_ledger();

-- ---------------------------------------------------------------------------
-- inventory_apply_movement: the only way stock/status change. Idempotent on p_id.
-- Business-rule violations raise SQLSTATE P0001 -> the app records a conflict.
-- ---------------------------------------------------------------------------
create or replace function inventory_apply_movement(
  p_id uuid, p_txn_id uuid, p_type text, p_entity_type text, p_entity_id uuid,
  p_quantity numeric, p_from_location_id uuid, p_to_location_id uuid, p_project_id uuid,
  p_staff text, p_expected_return date, p_notes text, p_created_at timestamptz
) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_company uuid := inventory_company_id();
  a inventory_assets%rowtype;
  s inventory_stock_lots%rowtype;
begin
  if v_company is null then raise exception 'No company profile for this user' using errcode = '42501'; end if;
  if exists (select 1 from inventory_movements where id = p_id) then return; end if; -- already applied

  perform set_config('ink.applying_movement', 'on', true);

  if p_entity_type = 'asset' then
    select * into a from inventory_assets where id = p_entity_id and company_id = v_company for update;
    if not found then raise exception 'Asset % not found', p_entity_id; end if;

    case p_type
      when 'issue' then
        if a.status <> 'available' then raise exception '% is already %', a.code, a.status; end if;
        update inventory_assets set status = 'checked_out', project_id = p_project_id, holder = p_staff, expected_return = p_expected_return where id = a.id;
      when 'return' then
        if a.status <> 'checked_out' then raise exception '% is not checked out', a.code; end if;
        update inventory_assets set status = 'available', project_id = null, holder = null, expected_return = null,
          location_id = coalesce(p_to_location_id, location_id) where id = a.id;
      when 'transfer' then
        update inventory_assets set location_id = p_to_location_id where id = a.id;
      when 'maintenance' then
        if a.status <> 'available' then raise exception '% must be available for maintenance', a.code; end if;
        update inventory_assets set status = 'maintenance' where id = a.id;
      when 'restore' then
        if a.status <> 'maintenance' then raise exception '% is not in maintenance', a.code; end if;
        update inventory_assets set status = 'available' where id = a.id;
      else raise exception 'Movement % not valid for assets', p_type;
    end case;
  else
    select * into s from inventory_stock_lots where id = p_entity_id and company_id = v_company for update;
    if not found then raise exception 'Stock lot % not found', p_entity_id; end if;

    case p_type
      when 'consume' then
        if p_quantity is null or p_quantity <= 0 then raise exception 'Quantity must be positive'; end if;
        if s.quantity < p_quantity then raise exception 'Only % left in %', s.quantity, s.code; end if;
        update inventory_stock_lots set quantity = quantity - p_quantity where id = s.id;
      when 'receive' then
        if p_quantity is null or p_quantity <= 0 then raise exception 'Quantity must be positive'; end if;
        update inventory_stock_lots set quantity = quantity + p_quantity where id = s.id;
      when 'adjust' then
        if s.quantity + p_quantity < 0 then raise exception 'Adjustment would make % negative', s.code; end if;
        update inventory_stock_lots set quantity = quantity + p_quantity where id = s.id;
      when 'transfer' then
        update inventory_stock_lots set location_id = p_to_location_id where id = s.id;
      else raise exception 'Movement % not valid for stock', p_type;
    end case;
  end if;

  insert into inventory_movements (id, company_id, txn_id, type, entity_type, entity_id, quantity, from_location_id,
    to_location_id, project_id, staff, expected_return, notes, created_at)
  values (p_id, v_company, p_txn_id, p_type, p_entity_type, p_entity_id, p_quantity, p_from_location_id,
    p_to_location_id, p_project_id, p_staff, p_expected_return, p_notes, p_created_at);

  perform set_config('ink.applying_movement', 'off', true);
end $$;

-- ---------------------------------------------------------------------------
-- Indexes for large catalogs (tens of thousands of products / units)
-- ---------------------------------------------------------------------------
create extension if not exists pg_trgm;

-- incremental sync pulls: WHERE company_id = ? AND updated_at > ? ORDER BY updated_at, id
create index if not exists inventory_products_sync_idx    on inventory_products    (company_id, updated_at, id);
create index if not exists inventory_locations_sync_idx   on inventory_locations   (company_id, updated_at, id);
create index if not exists inventory_projects_sync_idx    on inventory_projects    (company_id, updated_at, id);
create index if not exists inventory_assets_sync_idx      on inventory_assets      (company_id, updated_at, id);
create index if not exists inventory_stock_lots_sync_idx  on inventory_stock_lots  (company_id, updated_at, id);
create index if not exists inventory_identifiers_sync_idx on inventory_identifiers (company_id, updated_at, id);

-- foreign keys / dashboards / project screens
create index if not exists inventory_assets_product_idx  on inventory_assets (product_id);
create index if not exists inventory_assets_status_idx   on inventory_assets (company_id, status);
create index if not exists inventory_assets_location_idx on inventory_assets (location_id);
create index if not exists inventory_assets_project_idx  on inventory_assets (project_id) where project_id is not null;
create index if not exists inventory_stock_lots_product_idx  on inventory_stock_lots (product_id);
create index if not exists inventory_stock_lots_location_idx on inventory_stock_lots (location_id);
create index if not exists inventory_movements_company_created_idx on inventory_movements (company_id, created_at desc);

-- fast "contains" search on names for the future web admin (ILIKE '%hdmi%')
create index if not exists inventory_products_name_trgm on inventory_products using gin (name gin_trgm_ops);
create index if not exists inventory_products_category_idx on inventory_products (company_id, category, subcategory);

-- ---------------------------------------------------------------------------
-- Row Level Security
--   staff:   read everything in their company, record movements, add projects
--   manager: + create/edit catalog (products, assets, lots, locations, identifiers)
--   admin:   + manage profiles
-- ---------------------------------------------------------------------------
alter table inventory_companies enable row level security;
alter table inventory_profiles enable row level security;
alter table inventory_products enable row level security;
alter table inventory_locations enable row level security;
alter table inventory_projects enable row level security;
alter table inventory_assets enable row level security;
alter table inventory_stock_lots enable row level security;
alter table inventory_identifiers enable row level security;
alter table inventory_movements enable row level security;

create policy "own company" on inventory_companies for select using (id = inventory_company_id());
create policy "read inventory_profiles" on inventory_profiles for select using (company_id = inventory_company_id());
create policy "admin manages inventory_profiles" on inventory_profiles for all
  using (company_id = inventory_company_id() and inventory_has_role(array['admin']::inventory_role[]))
  with check (company_id = inventory_company_id() and inventory_has_role(array['admin']::inventory_role[]));

do $$
declare t text;
begin
  foreach t in array array['inventory_products','inventory_locations','inventory_assets','inventory_stock_lots','inventory_identifiers'] loop
    execute format('create policy "read %1$s" on %1$s for select using (company_id = inventory_company_id());', t);
    execute format($p$create policy "managers write %1$s" on %1$s for all
      using (company_id = inventory_company_id() and inventory_has_role(array['admin','manager']::inventory_role[]))
      with check (company_id = inventory_company_id() and inventory_has_role(array['admin','manager']::inventory_role[]));$p$, t);
  end loop;
end $$;

-- inventory_apply_movement runs as the caller, so staff need UPDATE on assets/lots; the
-- inventory_protect_ledger trigger stops them changing anything except via the function.
create policy "staff update inventory_assets" on inventory_assets for update using (company_id = inventory_company_id()) with check (company_id = inventory_company_id());
create policy "staff update lots" on inventory_stock_lots for update using (company_id = inventory_company_id()) with check (company_id = inventory_company_id());

create policy "read inventory_projects" on inventory_projects for select using (company_id = inventory_company_id());
create policy "staff write inventory_projects" on inventory_projects for all using (company_id = inventory_company_id()) with check (company_id = inventory_company_id());

create policy "read movements" on inventory_movements for select using (company_id = inventory_company_id());
create policy "insert movements" on inventory_movements for insert with check (company_id = inventory_company_id());
-- no update/delete policy: the ledger is append-only

grant execute on function inventory_apply_movement to authenticated;

-- ---------------------------------------------------------------------------
-- Bootstrap (run once, replacing the email):
--   insert into inventory_companies (name) values ('INK DABBA') returning id;
--   insert into inventory_profiles (id, company_id, full_name, role)
--     select id, '<company id>', 'Owner', 'admin' from auth.users where email = 'you@example.com';
-- ---------------------------------------------------------------------------

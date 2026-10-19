create extension if not exists pgcrypto;

create table if not exists inventory_products (
  id uuid primary key,
  name text not null,
  subname text,
  kind text not null check (kind in ('asset','consumable','quantity')),
  prefix text not null,
  category text,
  subcategory text,
  unit text not null default 'pcs',
  notes text,
  image_key text,
  updated_at timestamptz not null default now()
);

alter table inventory_products add column if not exists image_key text;

create table if not exists inventory_locations (
  id uuid primary key,
  code text not null unique,
  name text not null,
  type text not null default 'shelf',
  parent_id uuid references inventory_locations(id),
  updated_at timestamptz not null default now()
);

create table if not exists inventory_projects (
  id uuid primary key,
  code text not null unique,
  name text not null,
  status text not null default 'active' check (status in ('active','closed')),
  updated_at timestamptz not null default now()
);

create table if not exists inventory_assets (
  id uuid primary key,
  product_id uuid not null references inventory_products(id),
  code text not null unique,
  status text not null default 'available' check (status in ('available','checked_out','maintenance','retired')),
  condition text not null default 'good',
  location_id uuid references inventory_locations(id),
  project_id uuid references inventory_projects(id),
  holder text,
  expected_return date,
  updated_at timestamptz not null default now()
);

create table if not exists inventory_stock_lots (
  id uuid primary key,
  product_id uuid not null references inventory_products(id),
  code text not null unique,
  quantity numeric not null default 0 check (quantity >= 0),
  location_id uuid references inventory_locations(id),
  batch text,
  supplier text,
  purchase_date date,
  updated_at timestamptz not null default now()
);

create table if not exists inventory_identifiers (
  id uuid primary key,
  entity_type text not null check (entity_type in ('asset','lot','location')),
  entity_id uuid not null,
  type text not null check (type in ('qr','barcode','rfid','nfc')),
  value text not null unique,
  updated_at timestamptz not null default now()
);

create table if not exists inventory_movements (
  id uuid primary key,
  txn_id uuid not null,
  type text not null check (type in ('receive','issue','return','consume','adjust','transfer','maintenance','restore')),
  entity_type text not null check (entity_type in ('asset','lot')),
  entity_id uuid not null,
  quantity numeric,
  from_location_id uuid references inventory_locations(id),
  to_location_id uuid references inventory_locations(id),
  project_id uuid references inventory_projects(id),
  staff text not null,
  expected_return date,
  notes text,
  created_at timestamptz not null,
  received_at timestamptz not null default now()
);

create or replace function inventory_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

do $$ declare t text;
begin
  foreach t in array array['inventory_products','inventory_locations','inventory_projects','inventory_assets','inventory_stock_lots','inventory_identifiers'] loop
    execute format('drop trigger if exists %1$s_touch on %1$s', t);
    execute format('create trigger %1$s_touch before insert or update on %1$s for each row execute function inventory_touch_updated_at()', t);
  end loop;
end $$;

create index if not exists inventory_products_updated_idx on inventory_products(updated_at, id);
create index if not exists inventory_locations_updated_idx on inventory_locations(updated_at, id);
create index if not exists inventory_projects_updated_idx on inventory_projects(updated_at, id);
create index if not exists inventory_assets_updated_idx on inventory_assets(updated_at, id);
create index if not exists inventory_stock_lots_updated_idx on inventory_stock_lots(updated_at, id);
create index if not exists inventory_identifiers_updated_idx on inventory_identifiers(updated_at, id);
create index if not exists inventory_movements_created_idx on inventory_movements(created_at, id);
create index if not exists inventory_movements_txn_idx on inventory_movements(txn_id);
create index if not exists inventory_identifiers_entity_idx on inventory_identifiers(entity_type, entity_id);

create or replace function inventory_apply_movement(
  p_id uuid, p_txn_id uuid, p_type text, p_entity_type text, p_entity_id uuid,
  p_quantity numeric, p_from_location_id uuid, p_to_location_id uuid, p_project_id uuid,
  p_staff text, p_expected_return date, p_notes text, p_created_at timestamptz
) returns void language plpgsql as $$
declare a inventory_assets%rowtype; s inventory_stock_lots%rowtype;
begin
  if exists (select 1 from inventory_movements where id = p_id) then return; end if;
  if p_entity_type = 'asset' then
    select * into a from inventory_assets where id = p_entity_id for update;
    if not found then raise exception 'Asset not found'; end if;
    case p_type
      when 'issue' then
        if a.status <> 'available' then raise exception '% is already %', a.code, a.status; end if;
        if p_project_id is null then raise exception 'Project is required'; end if;
        update inventory_assets set status='checked_out', project_id=p_project_id, holder=p_staff, expected_return=p_expected_return where id=a.id;
      when 'return' then
        if a.status <> 'checked_out' then raise exception '% is not checked out', a.code; end if;
        update inventory_assets set status='available', project_id=null, holder=null, expected_return=null, location_id=coalesce(p_to_location_id,location_id) where id=a.id;
      when 'transfer' then
        if p_to_location_id is null then raise exception 'Destination is required'; end if;
        update inventory_assets set location_id=p_to_location_id where id=a.id;
      when 'maintenance' then
        if a.status <> 'available' then raise exception '% must be available for maintenance', a.code; end if;
        update inventory_assets set status='maintenance' where id=a.id;
      when 'restore' then
        if a.status <> 'maintenance' then raise exception '% is not in maintenance', a.code; end if;
        update inventory_assets set status='available' where id=a.id;
      else raise exception 'Movement % is invalid for an asset', p_type;
    end case;
  elsif p_entity_type = 'lot' then
    select * into s from inventory_stock_lots where id = p_entity_id for update;
    if not found then raise exception 'Stock lot not found'; end if;
    case p_type
      when 'consume' then
        if p_quantity is null or p_quantity <= 0 then raise exception 'Quantity must be positive'; end if;
        if s.quantity < p_quantity then raise exception 'Only % left in %', s.quantity, s.code; end if;
        update inventory_stock_lots set quantity=quantity-p_quantity where id=s.id;
      when 'receive' then
        if p_quantity is null or p_quantity <= 0 then raise exception 'Quantity must be positive'; end if;
        update inventory_stock_lots set quantity=quantity+p_quantity where id=s.id;
      when 'adjust' then
        if p_quantity is null or s.quantity+p_quantity < 0 then raise exception 'Adjustment would make stock negative'; end if;
        update inventory_stock_lots set quantity=quantity+p_quantity where id=s.id;
      when 'transfer' then
        if p_to_location_id is null then raise exception 'Destination is required'; end if;
        update inventory_stock_lots set location_id=p_to_location_id where id=s.id;
      else raise exception 'Movement % is invalid for stock', p_type;
    end case;
  else raise exception 'Unknown entity type %', p_entity_type;
  end if;
  insert into inventory_movements(id,txn_id,type,entity_type,entity_id,quantity,from_location_id,to_location_id,project_id,staff,expected_return,notes,created_at)
  values(p_id,p_txn_id,p_type,p_entity_type,p_entity_id,p_quantity,p_from_location_id,p_to_location_id,p_project_id,p_staff,p_expected_return,p_notes,p_created_at);
end $$;

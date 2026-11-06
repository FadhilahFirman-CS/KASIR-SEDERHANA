create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  username text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists public.menus (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  price integer not null check (price >= 0),
  category text not null default 'Makanan',
  created_at timestamptz not null default now()
);

create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  unit text not null default 'unit',
  stock numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.qris_settings (
  store_id uuid primary key references public.stores(id) on delete cascade,
  payload text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  invoice_no text not null,
  subtotal integer not null default 0,
  discount integer not null default 0,
  total integer not null default 0,
  paid integer not null default 0,
  change_amount integer not null default 0,
  payment_method text not null default 'Tunai',
  created_at timestamptz not null default now(),
  unique (store_id, invoice_no)
);

create table if not exists public.transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  name text not null,
  price integer not null default 0,
  quantity integer not null default 1,
  total integer not null default 0
);

create table if not exists public.store_data (
  store_id text not null,
  data_key text not null,
  data jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (store_id, data_key)
);

create table if not exists public.store_accounts (
  local_id text primary key,
  name text not null,
  username text unique not null,
  password text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.store_profiles (
  local_id text primary key,
  auth_user_id uuid unique not null,
  name text not null,
  username text unique not null,
  email text unique not null,
  created_at timestamptz not null default now()
);

alter table public.stores enable row level security;
alter table public.menus enable row level security;
alter table public.inventory enable row level security;
alter table public.qris_settings enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_items enable row level security;
alter table public.store_data enable row level security;
alter table public.store_accounts enable row level security;
alter table public.store_profiles enable row level security;

-- Demo policies: replace with authenticated-user policies before production use.
drop policy if exists "demo stores access" on public.stores;
drop policy if exists "demo menus access" on public.menus;
drop policy if exists "demo inventory access" on public.inventory;
drop policy if exists "demo qris access" on public.qris_settings;
drop policy if exists "demo transactions access" on public.transactions;
drop policy if exists "demo transaction items access" on public.transaction_items;
drop policy if exists "demo store data access" on public.store_data;
drop policy if exists "demo store accounts access" on public.store_accounts;
drop policy if exists "demo store profiles access" on public.store_profiles;

create policy "demo stores access" on public.stores for all using (true) with check (true);
create policy "demo menus access" on public.menus for all using (true) with check (true);
create policy "demo inventory access" on public.inventory for all using (true) with check (true);
create policy "demo qris access" on public.qris_settings for all using (true) with check (true);
create policy "demo transactions access" on public.transactions for all using (true) with check (true);
create policy "demo transaction items access" on public.transaction_items for all using (true) with check (true);
create policy "demo store accounts access" on public.store_accounts for all using (true) with check (true);
create policy "demo store profiles access" on public.store_profiles for all using (true) with check (true);

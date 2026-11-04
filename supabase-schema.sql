-- Skema database untuk aplikasi kasir. Jalankan di Supabase SQL Editor.
create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(), name text not null,
  username text not null unique, created_at timestamptz not null default now()
);
create table if not exists public.menus (
  id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id) on delete cascade,
  name text not null, price integer not null check (price > 0),
  category text not null check (category in ('Makanan', 'Minuman', 'Camilan')),
  is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (store_id, name)
);
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id) on delete cascade,
  transaction_no text not null, subtotal integer not null default 0, discount integer not null default 0,
  total integer not null default 0, method text not null check (method in ('Tunai', 'QRIS', 'Transfer')),
  paid integer not null default 0, change integer not null default 0, created_at timestamptz not null default now(),
  unique (store_id, transaction_no)
);
create table if not exists public.transaction_items (
  id uuid primary key default gen_random_uuid(), transaction_id uuid not null references public.transactions(id) on delete cascade,
  menu_name text not null, price integer not null check (price >= 0), quantity integer not null check (quantity > 0), created_at timestamptz not null default now()
);
create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id) on delete cascade,
  name text not null, unit text not null default 'unit', stock numeric not null default 0 check (stock >= 0), updated_at timestamptz not null default now(),
  unique (store_id, name)
);
create index if not exists menus_store_id_idx on public.menus(store_id);
create index if not exists transactions_store_id_idx on public.transactions(store_id);
create index if not exists transaction_items_transaction_id_idx on public.transaction_items(transaction_id);
create index if not exists inventory_store_id_idx on public.inventory(store_id);
alter table public.stores enable row level security;
alter table public.menus enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_items enable row level security;
alter table public.inventory enable row level security;
create policy "store owner can access own store" on public.stores for all using (id = auth.uid()) with check (id = auth.uid());
create policy "store owner can access own menus" on public.menus for all using (store_id = auth.uid()) with check (store_id = auth.uid());
create policy "store owner can access own transactions" on public.transactions for all using (store_id = auth.uid()) with check (store_id = auth.uid());
create policy "store owner can access own inventory" on public.inventory for all using (store_id = auth.uid()) with check (store_id = auth.uid());
create policy "store owner can access own transaction items" on public.transaction_items for all
  using (exists (select 1 from public.transactions t where t.id = transaction_id and t.store_id = auth.uid()))
  with check (exists (select 1 from public.transactions t where t.id = transaction_id and t.store_id = auth.uid()));

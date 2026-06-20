-- ============================================================
-- PharmOrders — Supabase Database Schema
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- 1. PROFILES (one row per staff/admin, linked to Supabase Auth)
create table public.profiles (
  id                uuid references auth.users on delete cascade primary key,
  full_name         text        not null,
  pharmacy_location text        not null,
  role              text        not null default 'staff'
                    check (role in ('staff', 'admin')),
  is_active         boolean     not null default true,
  created_at        timestamptz not null default now()
);

-- 2. ORDERS
create table public.orders (
  id                uuid        primary key default gen_random_uuid(),
  order_number      integer     generated always as identity,
  order_type        text        not null
                    check (order_type in ('Supplementary Order', 'Emergency Order')),
  status            text        not null default 'Draft'
                    check (status in ('Draft', 'Submitted', 'Processed')),
  created_by        uuid        references public.profiles(id) not null,
  pharmacy_location text        not null,
  created_at        timestamptz not null default now(),
  submitted_at      timestamptz,
  processed_at      timestamptz,
  total_value       numeric(12,2) not null default 0
);

-- 3. ORDER ITEMS
create table public.order_items (
  id                      uuid        primary key default gen_random_uuid(),
  order_id                uuid        references public.orders(id) on delete cascade not null,
  sku                     text,
  product_name            text        not null,
  unit_price              numeric(10,2),
  order_quantity          integer,
  current_available_stock numeric(10,2),
  reason_for_ordering     text,
  created_at              timestamptz not null default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles   enable row level security;
alter table public.orders     enable row level security;
alter table public.order_items enable row level security;

-- PROFILES policies
create policy "Own profile: read"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Admins: read all profiles"
  on public.profiles for select
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ));

create policy "Admins: update profiles"
  on public.profiles for update
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ));

create policy "Allow profile creation on signup"
  on public.profiles for insert
  with check (true);

-- ORDERS policies
create policy "Staff: read own orders"
  on public.orders for select
  using (auth.uid() = created_by);

create policy "Admins: read all orders"
  on public.orders for select
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ));

create policy "Staff: create own orders"
  on public.orders for insert
  with check (auth.uid() = created_by);

create policy "Staff: edit own draft orders"
  on public.orders for update
  using (auth.uid() = created_by and status = 'Draft');

create policy "Admins: update any order"
  on public.orders for update
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ));

-- ORDER ITEMS policies
create policy "Users: read items of own orders"
  on public.order_items for select
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and o.created_by = auth.uid()
  ));

create policy "Admins: read all order items"
  on public.order_items for select
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ));

create policy "Users: insert items to own draft orders"
  on public.order_items for insert
  with check (exists (
    select 1 from public.orders o
    where o.id = order_id and o.created_by = auth.uid() and o.status = 'Draft'
  ));

create policy "Users: delete items from own draft orders"
  on public.order_items for delete
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and o.created_by = auth.uid() and o.status = 'Draft'
  ));

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- (Runs whenever a new user is created via Supabase Auth)
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, pharmacy_location, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'pharmacy_location', 'Unassigned'),
    'staff'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- DONE — your database is ready.
-- Next step: create your first admin account in Supabase Auth,
-- then manually set their role to 'admin' in the profiles table.
-- ============================================================

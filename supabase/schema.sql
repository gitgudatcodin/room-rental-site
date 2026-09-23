-- ============================================================
-- Room Rental Site — database schema
-- Run this once in Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- Properties (each house/building you rent rooms in)
create table if not exists properties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  description text,
  created_at timestamptz default now()
);

-- Rooms (one row per rentable room)
create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references properties(id) on delete cascade,
  name text not null,                 -- e.g. "Room A — Master bedroom"
  description text,
  price_monthly numeric not null,     -- rent per month
  deposit numeric not null default 0, -- security deposit, due with first payment
  amenities text[] not null default '{}',
  photos text[] not null default '{}', -- public image URLs (Supabase Storage)
  is_available boolean not null default true,
  created_at timestamptz default now()
);

-- Bookings (one row per tenant booking request)
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete set null,
  guest_name text not null,
  guest_email text not null,
  guest_phone text not null,
  move_in_date date not null,
  term_months int not null,
  monthly_price numeric not null,  -- snapshot of price at booking time
  deposit numeric not null default 0,
  parking_permit boolean not null default false,
  parking_monthly_fee numeric not null default 0,
  total_amount numeric not null,   -- what the tenant must Zelle you
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'confirmed', 'cancelled')),
  admin_note text,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- Row Level Security
-- Public visitors: read properties + available rooms, create bookings.
-- Logged-in admin (you): full access to everything.
-- ------------------------------------------------------------
alter table properties enable row level security;
alter table rooms enable row level security;
alter table bookings enable row level security;

drop policy if exists "public read properties" on properties;
create policy "public read properties" on properties
  for select using (true);

drop policy if exists "public read available rooms" on rooms;
create policy "public read available rooms" on rooms
  for select using (is_available = true);

drop policy if exists "public create booking" on bookings;
create policy "public create booking" on bookings
  for insert to anon, authenticated with check (true);

drop policy if exists "admin all properties" on properties;
create policy "admin all properties" on properties
  for all to authenticated using (true) with check (true);

drop policy if exists "admin all rooms" on rooms;
create policy "admin all rooms" on rooms
  for all to authenticated using (true) with check (true);

drop policy if exists "admin all bookings" on bookings;
create policy "admin all bookings" on bookings
  for all to authenticated using (true) with check (true);

-- ------------------------------------------------------------
-- Photo storage bucket (public read, admin-only write)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('room-photos', 'room-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "public read photos" on storage.objects;
create policy "public read photos" on storage.objects
  for select using (bucket_id = 'room-photos');

drop policy if exists "admin upload photos" on storage.objects;
create policy "admin upload photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'room-photos');

drop policy if exists "admin update photos" on storage.objects;
create policy "admin update photos" on storage.objects
  for update to authenticated using (bucket_id = 'room-photos');

drop policy if exists "admin delete photos" on storage.objects;
create policy "admin delete photos" on storage.objects
  for delete to authenticated using (bucket_id = 'room-photos');

-- ------------------------------------------------------------
-- Public booking lookup (powers the "Track my booking" page).
-- SECURITY DEFINER: tenants prove ownership with their booking
-- reference code + the email they booked with. Returns NO contact
-- details (no phone/email), so it's safe to expose publicly.
-- ------------------------------------------------------------
create or replace function public.lookup_booking(ref_code text, guest_email text)
returns table (
  reference text,
  status text,
  room_name text,
  property_name text,
  term_months int,
  move_in_date date,
  total_amount numeric,
  parking_permit boolean,
  created_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    upper(left(b.id::text, 8)),
    b.status,
    r.name,
    p.name,
    b.term_months,
    b.move_in_date,
    b.total_amount,
    b.parking_permit,
    b.created_at
  from bookings b
  left join rooms r on r.id = b.room_id
  left join properties p on p.id = r.property_id
  where upper(left(b.id::text, 8)) = upper(trim(ref_code))
    and lower(b.guest_email) = lower(trim(guest_email))
  limit 1;
$$;

revoke all on function public.lookup_booking(text, text) from public;
grant execute on function public.lookup_booking(text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- Owner-configurable lease terms + per-term room pricing
-- ------------------------------------------------------------
create table if not exists lease_terms (
  id uuid primary key default gen_random_uuid(),
  months int not null unique,
  label text not null,
  sort_order int not null default 0,
  created_at timestamptz default now()
);

alter table lease_terms enable row level security;

drop policy if exists "public read lease terms" on lease_terms;
create policy "public read lease terms" on lease_terms
  for select using (true);

drop policy if exists "admin all lease terms" on lease_terms;
create policy "admin all lease terms" on lease_terms
  for all to authenticated using (true) with check (true);

insert into lease_terms (months, label, sort_order) values
  (1, '1 month', 10),
  (3, '3 months', 20),
  (6, '6 months', 30),
  (12, '12 months', 40)
on conflict (months) do nothing;

-- Per-term monthly prices per room, e.g. {"1": 900, "3": 850, "6": 800}.
-- Blank/missing entries fall back to the room's base price_monthly.
alter table rooms
  add column if not exists term_prices jsonb not null default '{}';

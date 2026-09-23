-- ============================================================
-- Migration: owner-configurable lease terms + per-term pricing
-- Run ONCE in Supabase Dashboard → SQL Editor → New query,
-- only if you ran schema.sql BEFORE this feature was added.
-- (Fresh setups: the latest schema.sql already includes this.)
-- ============================================================

-- 1) Lease terms the owner offers (managed in Admin → Rooms → Lease terms)
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

-- Seed the classic 1/3/6/12 options (edit them in the admin panel later)
insert into lease_terms (months, label, sort_order) values
  (1, '1 month', 10),
  (3, '3 months', 20),
  (6, '6 months', 30),
  (12, '12 months', 40)
on conflict (months) do nothing;

-- 2) Per-term monthly prices per room, e.g. {"1": 900, "3": 850, "6": 800}
--    Blank/missing entries fall back to the room's base price_monthly.
alter table rooms
  add column if not exists term_prices jsonb not null default '{}';

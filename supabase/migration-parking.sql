-- ============================================================
-- PARKING PERMIT — one-time migration
-- Run this in Supabase SQL Editor ONLY if you already ran
-- schema.sql before the parking-permit feature was added.
-- (Fresh setups don't need it: schema.sql already includes it.)
-- ============================================================

alter table bookings
  add column if not exists parking_permit boolean not null default false;

alter table bookings
  add column if not exists parking_monthly_fee numeric not null default 0;

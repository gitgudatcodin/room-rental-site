-- ============================================================
-- BOOKING LOOKUP — one-time migration
-- Run this in Supabase SQL Editor ONLY if you already ran
-- schema.sql before the "Track my booking" feature was added.
-- (Fresh setups don't need it: schema.sql already includes it.)
-- ============================================================

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

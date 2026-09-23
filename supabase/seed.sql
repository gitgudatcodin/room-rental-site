-- ============================================================
-- SAMPLE DATA — optional. Run after schema.sql to see the site
-- working immediately. Delete these rows (or the property) in the
-- admin panel once you add your real rooms.
-- ============================================================

with p as (
  insert into properties (name, address, description)
  values (
    'Maple Street House',
    '123 Maple St, Your Town',
    'Quiet 4-bedroom house, 10 minutes from downtown. Shared kitchen and laundry.'
  )
  returning id
)
insert into rooms (property_id, name, description, price_monthly, deposit, amenities, is_available)
select
  p.id,
  r.name, r.description, r.price_monthly, r.deposit, r.amenities, true
from p,
(values
  ('Room A — Master bedroom',
   'Spacious master bedroom with private bathroom and large windows.',
   950, 950,
   array['Private bathroom', 'Furnished', 'High-speed WiFi', 'Utilities included']),
  ('Room B — Cozy single',
   'Comfortable single room, perfect for one person. Shared bathroom.',
   650, 650,
   array['Furnished', 'High-speed WiFi', 'Utilities included', 'Shared kitchen']),
  ('Room C — Large double',
   'Large room that fits a queen bed plus desk. Shared bathroom.',
   750, 750,
   array['Furnished', 'High-speed WiFi', 'Utilities included', 'Washer/dryer'])
) as r(name, description, price_monthly, deposit, amenities);

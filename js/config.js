/* ============================================================
   SITE CONFIG — edit everything in this file to make the site yours.
   ============================================================ */

// 1) Paste your Supabase project credentials here (see README Step 1).
//    Supabase Dashboard → Project Settings → API
export const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
export const SUPABASE_ANON_KEY = "YOUR-ANON-PUBLISHABLE-KEY";

// 2) Your business details
export const SITE = {
  name: "Maple Room Rentals",
  tagline: "Clean, comfortable rooms for rent. Browse, pick your term, and book online in minutes.",
  contactPhone: "(555) 123-4567",
  contactEmail: "you@example.com",

  // Where tenants send the Zelle payment. Shown on the booking confirmation page.
  zelle: {
    label: "Zelle",
    value: "(555) 123-4567", // e.g. your phone number or email enrolled with Zelle
  },

  // Note shown under the Zelle instructions (e.g. how fast you confirm).
  confirmationNote: "I usually confirm Zelle payments within 24 hours.",
};

// 3) Lease terms tenants can choose from (in months)
// 3) Lease terms (fallback — the owner manages the real list in
//    Admin → Rooms → Lease terms; this is used only if that table
//    isn't set up yet)
export const TERMS = [
  { months: 1, label: "1 month" },
  { months: 3, label: "3 months" },
  { months: 6, label: "6 months" },
  { months: 12, label: "12 months" },
];

// 4) Optional parking permit tenants can add at booking time
export const PARKING_PERMIT = {
  enabled: true,
  monthlyFee: 75, // USD per month — multiplied by the lease term
  label: "Parking permit",
};

// 5) Email notifications (Resend + Supabase Edge Function "notify-booking")
//    Sends: booking receipt + Zelle instructions to the tenant,
//           "new booking" alert to you, and a confirmation email
//           when you confirm payment. See README "Email notifications".
export const EMAIL = {
  enabled: true, // set to false to turn emails off entirely
};

// Helper: format money
export const money = (n) =>
  "$" +
  Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

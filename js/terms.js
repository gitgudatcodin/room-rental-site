/* Lease terms + per-term pricing helpers.
   Terms come from the owner's `lease_terms` table (Admin → Rooms → Lease terms),
   falling back to the TERMS in config.js if the table isn't set up yet. */
import { TERMS } from "./config.js";
import { supabase } from "./db.js";

/** Owner's lease terms, ordered. Falls back to config TERMS on any problem. */
export async function loadTerms() {
  try {
    const { data, error } = await supabase
      .from("lease_terms")
      .select("months, label")
      .order("sort_order", { ascending: true });
    if (error || !data || !data.length) return TERMS;
    return data.map((t) => ({ months: Number(t.months), label: t.label }));
  } catch {
    return TERMS;
  }
}

/** Monthly rate for a room on a given term length. Falls back to base price. */
export function monthlyRateFor(room, months) {
  const override = room?.term_prices?.[String(months)];
  if (override != null && override !== "" && Number(override) > 0) return Number(override);
  return Number(room?.price_monthly || 0);
}

/** Cheapest monthly rate across the given terms (for "from $X/mo" badges). */
export function minRateFor(room, terms) {
  const rates = (terms && terms.length ? terms : TERMS).map((t) => monthlyRateFor(room, t.months));
  return Math.min(...rates);
}

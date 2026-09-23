/* Email notifications via the "notify-booking" Supabase Edge Function (Resend).
   Fire-and-forget: a failed email never breaks the booking flow. */
import { EMAIL, SITE } from "./config.js";
import { supabase } from "./db.js";

export async function notifyBooking(bookingId, event) {
  if (!EMAIL.enabled) return;
  try {
    const { error } = await supabase.functions.invoke("notify-booking", {
      body: {
        bookingId,
        event, // "created" | "confirmed"
        adminEmail: SITE.contactEmail,
        zelleTo: SITE.zelle.type === "phone" ? SITE.zelle.value : `${SITE.zelle.value} (${SITE.zelle.type})`,
        siteUrl: window.location.origin,
      },
    });
    if (error) throw error;
  } catch (e) {
    console.warn("Email notification failed (booking still saved):", e?.message || e);
  }
}

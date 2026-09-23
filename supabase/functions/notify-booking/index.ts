// ============================================================
// notify-booking — Supabase Edge Function
//
// Sends transactional emails via Resend (free tier: 3,000/mo):
//   event "created"   → tenant gets booking receipt + Zelle instructions
//                       admin gets a "new booking" alert
//   event "confirmed" → tenant gets "you're confirmed" email
//
// Deploy: Supabase Dashboard → Edge Functions → New Function →
//   name it "notify-booking" → paste this file → Deploy.
// Then set secrets (Edge Functions → Secrets):
//   RESEND_API_KEY = your Resend API key (resend.com → API Keys)
//   RESEND_FROM    = sender, e.g. "Sunrise Rooms <bookings@yourdomain.com>"
//                    (for testing before you verify a domain, use
//                    "onboarding@resend.dev" — Resend only lets
//                    unverified senders email your own account address)
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected
// automatically by Supabase — don't set them yourself.
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const RESEND_FROM = Deno.env.get("RESEND_FROM") || "onboarding@resend.dev";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const money = (n: number) =>
  "$" + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[c]
  );

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: RESEND_FROM, to, subject, html }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error ${res.status}: ${body}`);
  }
}

// ---------- Email templates (inline CSS for email clients) ----------
function shell(title: string, bodyHtml: string): string {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#182420;line-height:1.6;">
    <div style="background:linear-gradient(135deg,#0d5c46,#083b2d);padding:28px 32px;border-radius:12px 12px 0 0;">
      <div style="color:#f3d894;font-size:13px;letter-spacing:2px;text-transform:uppercase;font-weight:bold;">Room booking</div>
      <div style="color:#ffffff;font-size:24px;font-weight:bold;margin-top:6px;">${title}</div>
    </div>
    <div style="background:#ffffff;border:1px solid #e7dfcd;border-top:0;padding:28px 32px;border-radius:0 0 12px 12px;">
      ${bodyHtml}
      <p style="color:#7d8881;font-size:13px;margin-top:28px;border-top:1px solid #eee;padding-top:16px;">
        This is an automated message — please don't reply to it. Questions? Contact us directly.
      </p>
    </div>
  </div>`;
}

function refBadge(ref: string): string {
  return `<div style="text-align:center;margin:20px 0;">
    <div style="font-size:12px;color:#7d8881;text-transform:uppercase;letter-spacing:2px;">Booking reference</div>
    <div style="display:inline-block;background:#062a20;color:#ffe9bd;font-weight:bold;letter-spacing:4px;
      font-size:20px;padding:10px 22px;border-radius:8px;margin-top:6px;">${esc(ref)}</div>
  </div>`;
}

function zelleBox(total: number, zelleTo: string, ref: string, guestName: string): string {
  return `<div style="border:2px dashed #0d5c46;border-radius:10px;padding:18px;text-align:center;margin:18px 0;">
    <div style="font-size:12px;color:#7d8881;text-transform:uppercase;letter-spacing:2px;">Send via Zelle</div>
    <div style="font-size:32px;font-weight:bold;color:#083b2d;margin:6px 0;">${money(total)}</div>
    <div style="font-size:15px;">To: <strong>${esc(zelleTo)}</strong></div>
    <div style="font-size:13px;color:#43514b;margin-top:6px;">Memo: <strong>${esc(guestName)} — ${esc(ref)}</strong></div>
  </div>`;
}

function detailRows(rows: [string, string][]): string {
  return `<table style="width:100%;border-collapse:collapse;font-size:14px;">
    ${rows.map(([k, v]) => `
      <tr>
        <td style="padding:8px 0;color:#7d8881;border-bottom:1px solid #f0ebe0;">${k}</td>
        <td style="padding:8px 0;text-align:right;font-weight:bold;border-bottom:1px solid #f0ebe0;">${v}</td>
      </tr>`).join("")}
  </table>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY secret is not set.");

    const { bookingId, event, adminEmail, siteUrl, zelleTo } = await req.json();
    if (!bookingId || !["created", "confirmed"].includes(event)) {
      return json({ error: "Provide bookingId and event ('created' | 'confirmed')." }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: b, error } = await supabase
      .from("bookings")
      .select("*, rooms(name, properties(name))")
      .eq("id", bookingId)
      .single();
    if (error || !b) return json({ error: "Booking not found." }, 404);

    const ref = String(b.id).slice(0, 8).toUpperCase();
    const roomName = b.rooms?.name || "your room";
    const propName = b.rooms?.properties?.name || "";
    const trackUrl = siteUrl ? `${String(siteUrl).replace(/\/$/, "")}/track.html` : "";

    if (event === "created") {
      // Abuse guard: only fresh bookings can trigger the "created" email.
      const ageMin = (Date.now() - new Date(b.created_at).getTime()) / 60000;
      if (ageMin > 30) return json({ error: "Booking is too old for a receipt email." }, 403);

      // 1) Receipt to the tenant
      await sendEmail(
        b.guest_email,
        `Booking request received — ${roomName} (Ref ${ref})`,
        shell(
          "Request received",
          `<p>Hi ${esc(b.guest_name)},</p>
           <p>We've received your booking request for <strong>${esc(roomName)}</strong>${propName ? ` at ${esc(propName)}` : ""}. Your room is held while we wait for payment.</p>
           ${refBadge(ref)}
           ${zelleBox(Number(b.total_amount), zelleTo || "our Zelle number on the site", ref, b.guest_name)}
           ${detailRows([
             ["Lease term", `${b.term_months} month(s)`],
             ["Move-in date", esc(b.move_in_date)],
             ["Parking permit", b.parking_permit ? "Yes" : "No"],
             ["Total due", money(Number(b.total_amount))],
           ])}
           <p style="margin-top:18px;">Once your Zelle payment arrives we'll confirm your booking (usually within 24 hours).
           ${trackUrl ? `You can check your status anytime here: <a href="${trackUrl}" style="color:#0d5c46;font-weight:bold;">Track my booking</a>` : ""}</p>`
        )
      );

      // 2) Alert to the admin/owner
      if (adminEmail) {
        const adminUrl = siteUrl ? `${String(siteUrl).replace(/\/$/, "")}/admin.html` : "";
        await sendEmail(
          adminEmail,
          `New booking: ${b.guest_name} — ${roomName} — ${money(Number(b.total_amount))}`,
          shell(
            "New booking",
            `<p>A new booking just came in and is <strong>awaiting Zelle payment</strong>.</p>
             ${refBadge(ref)}
             ${detailRows([
               ["Guest", esc(b.guest_name)],
               ["Phone", esc(b.guest_phone)],
               ["Email", esc(b.guest_email)],
               ["Room", `${esc(roomName)}${propName ? ` (${esc(propName)})` : ""}`],
               ["Lease term", `${b.term_months} month(s)`],
               ["Move-in date", esc(b.move_in_date)],
               ["Parking permit", b.parking_permit ? "Yes" : "No"],
               ["Total expected", money(Number(b.total_amount))],
             ])}
             <p style="margin-top:18px;">When the Zelle payment arrives, open the
             ${adminUrl ? `<a href="${adminUrl}" style="color:#0d5c46;font-weight:bold;">admin panel</a>` : "admin panel"}
             and click <strong>Confirm payment</strong>.</p>`
          )
        );
      }
    } else {
      // event === "confirmed"
      if (b.status !== "confirmed") {
        return json({ error: "Booking is not confirmed — email not sent." }, 403);
      }
      await sendEmail(
        b.guest_email,
        `You're confirmed! ${roomName} — Ref ${ref}`,
        shell(
          "You're confirmed",
          `<p>Hi ${esc(b.guest_name)},</p>
           <p>Good news — your payment arrived and your booking is <strong>confirmed</strong>. The room is yours!</p>
           ${refBadge(ref)}
           ${detailRows([
             ["Room", `${esc(roomName)}${propName ? ` (${esc(propName)})` : ""}`],
             ["Lease term", `${b.term_months} month(s)`],
             ["Move-in date", esc(b.move_in_date)],
             ["Parking permit", b.parking_permit ? "Yes — details to follow" : "No"],
             ["Total paid", money(Number(b.total_amount))],
           ])}
           <p style="margin-top:18px;">We'll be in touch about move-in details. If anything changes, just reply to our regular contact number/email.</p>`
        )
      );
    }

    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: String(e?.message || e) }, 500);
  }
});

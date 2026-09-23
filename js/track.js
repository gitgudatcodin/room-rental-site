/* Track-my-booking page: reference code + email → secure status lookup. */
import { SITE, money } from "./config.js";
import { supabase, guardConfig } from "./db.js";

document.getElementById("brand-name").textContent = SITE.name;
document.getElementById("foot-name").textContent = SITE.name;
document.getElementById("foot-contact").textContent =
  `${SITE.contactPhone} · ${SITE.contactEmail}`;

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const resultEl = document.getElementById("track-result");
guardConfig(document.getElementById("config-warning"));

const STATUS_LABEL = {
  pending_payment: "Awaiting payment",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
};

document.getElementById("track-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("track-btn");
  const errEl = document.getElementById("track-error");
  errEl.innerHTML = "";
  resultEl.innerHTML = "";
  btn.disabled = true;
  btn.textContent = "Checking…";

  const ref = document.getElementById("t-ref").value.trim();
  const email = document.getElementById("t-email").value.trim();

  try {
    const { data, error } = await supabase.rpc("lookup_booking", {
      ref_code: ref,
      guest_email: email,
    });
    if (error) throw error;
    if (!data || !data.length) {
      errEl.innerHTML = `<div class="error">No booking found with that reference code and email. Double-check both and try again — or contact us at ${esc(SITE.contactPhone)}.</div>`;
      return;
    }
    renderResult(data[0]);
  } catch (err) {
    errEl.innerHTML = `<div class="error">Couldn't look that up: ${esc(err.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "Check status";
  }
});

function renderResult(b) {
  const steps = [
    { key: "received", label: "Request received" },
    { key: "payment", label: "Payment" },
    { key: "confirmed", label: "Confirmed" },
  ];
  // Map booking status → step states
  let state = [];
  if (b.status === "confirmed") state = ["done", "done", "done"];
  else if (b.status === "cancelled") state = ["done", "cancelled", "todo"];
  else state = ["done", "current", "todo"];

  const banner =
    b.status === "confirmed"
      ? `<div class="notice" style="border-color:#9fd8b8;background:#eef9f1;"><strong>You're confirmed!</strong> The room is yours for the term below. We'll be in touch about move-in details.</div>`
      : b.status === "cancelled"
        ? `<div class="error"><strong>This booking was cancelled.</strong> If you think this is a mistake, contact us at ${esc(SITE.contactPhone)}.</div>`
        : `<div class="notice"><strong>Awaiting your Zelle payment.</strong> Send <strong>${money(b.total_amount)}</strong> via Zelle to <strong>${esc(SITE.zelle.value)}</strong> with your name + reference <strong>${esc(b.reference)}</strong> in the memo.</div>`;

  resultEl.innerHTML = `
    <div class="panel" style="animation: rise .5s cubic-bezier(.22,.68,.32,1) both;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:18px;">
        <h3 style="margin:0;">Booking <span class="refcode">${esc(b.reference)}</span></h3>
        <span class="status ${b.status}">${STATUS_LABEL[b.status] || b.status}</span>
      </div>
      <div class="stepper">
        ${steps.map((s, i) => `
          <div class="tstep ${state[i]}">
            <div class="dot">${state[i] === "done" ? "✓" : i + 1}</div>
            <span>${s.label}</span>
          </div>${i < steps.length - 1 ? `<div class="tline ${state[i] === "done" ? "done" : ""}"></div>` : ""}
        `).join("")}
      </div>
      <div class="detail-grid">
        <div><span>Room</span><strong>${esc(b.room_name || "—")}</strong></div>
        <div><span>Property</span><strong>${esc(b.property_name || "—")}</strong></div>
        <div><span>Lease term</span><strong>${b.term_months} month(s)</strong></div>
        <div><span>Move-in</span><strong>${esc(b.move_in_date)}</strong></div>
        <div><span>Parking permit</span><strong>${b.parking_permit ? "Yes" : "No"}</strong></div>
        <div><span>Total</span><strong>${money(b.total_amount)}</strong></div>
      </div>
      <div style="margin-top:18px;">${banner}</div>
    </div>`;
  resultEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

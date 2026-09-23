/* Room detail page: gallery, term picker, booking form, Zelle confirmation. */
import { SITE, TERMS, PARKING_PERMIT, money } from "./config.js";
import { supabase, guardConfig } from "./db.js";
import { notifyBooking } from "./notify.js";

document.getElementById("brand-name").textContent = SITE.name;
document.getElementById("foot-name").textContent = SITE.name;
document.getElementById("foot-contact").textContent =
  `${SITE.contactPhone} · ${SITE.contactEmail}`;

const contentEl = document.getElementById("room-content");
const roomId = new URLSearchParams(location.search).get("id");

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

if (!guardConfig(document.getElementById("config-warning"))) {
  contentEl.innerHTML = "";
} else if (!roomId) {
  contentEl.innerHTML = `<div class="notice">No room selected. <a href="index.html">Back to all rooms</a>.</div>`;
} else {
  loadRoom();
}

async function loadRoom() {
  const { data: room, error } = await supabase
    .from("rooms")
    .select("*, properties(name, address)")
    .eq("id", roomId)
    .single();

  if (error || !room) {
    contentEl.innerHTML = `<div class="error">Room not found. <a href="index.html">Back to all rooms</a>.</div>`;
    return;
  }
  if (!room.is_available) {
    contentEl.innerHTML = `<div class="notice"><strong>${esc(room.name)}</strong> is no longer available. <a href="index.html">See other rooms</a>.</div>`;
    return;
  }
  renderRoom(room);
}

function renderRoom(room) {
  const photos = room.photos && room.photos.length ? room.photos : [];
  const mainPhoto = photos[0]
    ? `<img id="main-photo" src="${esc(photos[0])}" alt="${esc(room.name)}" />`
    : `<div class="photo-placeholder" style="width:100%;height:100%">${esc(room.name.trim().charAt(0).toUpperCase())}</div>`;

  const thumbs = photos
    .map((p, i) => `<img src="${esc(p)}" class="${i === 0 ? "active" : ""}" data-src="${esc(p)}" alt="Photo ${i + 1}" />`)
    .join("");

  const tags = (room.amenities || []).map((a) => `<span class="tag">${esc(a)}</span>`).join("");

  const today = new Date().toISOString().slice(0, 10);

  contentEl.innerHTML = `
    <div class="room-layout">
      <div>
        <div class="gallery">
          <div class="main">${mainPhoto}</div>
          ${thumbs ? `<div class="thumbs">${thumbs}</div>` : ""}
        </div>
        <div class="room-info" style="margin-top:20px">
          <h1>${esc(room.name)}</h1>
          <p class="addr">${esc(room.properties?.name || "")}${room.properties?.address ? " · " + esc(room.properties.address) : ""}</p>
          ${room.description ? `<p class="desc">${esc(room.description)}</p>` : ""}
          <div class="amenities" style="display:flex;flex-wrap:wrap;gap:6px">${tags}</div>
        </div>
      </div>

      <div>
        <div class="book-box">
          <div id="book-form-view">
            <h3>Book this room</h3>
            <p class="price-line">${money(room.price_monthly)} <small>/ month</small></p>
            ${room.deposit > 0 ? `<p class="hint">Security deposit: ${money(room.deposit)} (due with first payment)</p>` : ""}

            <div class="field" style="margin-top:16px">
              <label>Choose your lease term</label>
              <div class="term-pills" id="term-pills">
                ${TERMS.map((t, i) => `
                  <label><input type="radio" name="term" value="${t.months}" ${i === 0 ? "checked" : ""} />
                  <span class="pill">${esc(t.label)}</span></label>`).join("")}
              </div>
            </div>

            ${PARKING_PERMIT.enabled ? `
            <div class="field">
              <div class="checkbox-row">
                <input type="checkbox" id="f-parking" />
                <label for="f-parking" style="margin:0">Add ${esc(PARKING_PERMIT.label)} — ${money(PARKING_PERMIT.monthlyFee)}/month</label>
              </div>
            </div>` : ""}

            <div class="totals" id="totals"></div>

            <form id="booking-form">
              <div class="field">
                <label for="f-name">Full name</label>
                <input id="f-name" required autocomplete="name" />
              </div>
              <div class="field">
                <label for="f-email">Email</label>
                <input id="f-email" type="email" required autocomplete="email" />
              </div>
              <div class="field">
                <label for="f-phone">Phone</label>
                <input id="f-phone" type="tel" required autocomplete="tel" />
              </div>
              <div class="field">
                <label for="f-date">Move-in date</label>
                <input id="f-date" type="date" required min="${today}" value="${today}" />
              </div>
              <div id="book-error"></div>
              <button class="btn" type="submit" id="book-btn">Request booking</button>
              <p class="hint">No payment is taken here. You'll get Zelle instructions on the next screen.</p>
            </form>
          </div>
          <div id="book-done-view" class="hidden"></div>
        </div>
      </div>
    </div>`;

  // Gallery thumbs + fullscreen lightbox
  let currentPhoto = 0;
  const thumbImgs = contentEl.querySelectorAll(".thumbs img");
  thumbImgs.forEach((t, i) =>
    t.addEventListener("click", () => {
      currentPhoto = i;
      thumbImgs.forEach((x) => x.classList.remove("active"));
      t.classList.add("active");
      document.getElementById("main-photo").src = t.dataset.src;
    })
  );
  if (photos.length) {
    const mainEl = contentEl.querySelector(".gallery .main");
    mainEl.style.cursor = "zoom-in";
    mainEl.title = "Click to view fullscreen";
    mainEl.addEventListener("click", () => openLightbox(currentPhoto));
  }

  function openLightbox(startIdx) {
    let idx = startIdx;
    const overlay = document.createElement("div");
    overlay.className = "lightbox";
    overlay.innerHTML = `
      <button class="lb-close" aria-label="Close">×</button>
      ${photos.length > 1 ? `<button class="lb-prev" aria-label="Previous photo">‹</button>
      <button class="lb-next" aria-label="Next photo">›</button>` : ""}
      <img src="${esc(photos[idx])}" alt="${esc(room.name)} — photo ${idx + 1}" />
      ${photos.length > 1 ? `<span class="lb-count">${idx + 1} / ${photos.length}</span>` : ""}`;
    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";
    const img = overlay.querySelector("img");
    const count = overlay.querySelector(".lb-count");
    const show = (i) => {
      idx = (i + photos.length) % photos.length;
      img.src = photos[idx];
      img.alt = `${room.name} — photo ${idx + 1}`;
      if (count) count.textContent = `${idx + 1} / ${photos.length}`;
    };
    const close = () => {
      overlay.remove();
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
    overlay.querySelector(".lb-close").addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    const prev = overlay.querySelector(".lb-prev");
    const next = overlay.querySelector(".lb-next");
    if (prev) prev.addEventListener("click", (e) => { e.stopPropagation(); show(idx - 1); });
    if (next) next.addEventListener("click", (e) => { e.stopPropagation(); show(idx + 1); });
    const onKey = (e) => {
      if (e.key === "Escape") close();
      if (photos.length > 1 && e.key === "ArrowLeft") show(idx - 1);
      if (photos.length > 1 && e.key === "ArrowRight") show(idx + 1);
    };
    document.addEventListener("keydown", onKey);
  }

  // Totals
  const pills = contentEl.querySelector("#term-pills");
  const totalsEl = contentEl.querySelector("#totals");
  const parkingBox = contentEl.querySelector("#f-parking");
  const parkingOn = () => PARKING_PERMIT.enabled && parkingBox && parkingBox.checked;
  const currentTotals = () => {
    const months = Number(pills.querySelector("input:checked").value);
    const rent = Number(room.price_monthly) * months;
    const parking = parkingOn() ? Number(PARKING_PERMIT.monthlyFee) * months : 0;
    const deposit = Number(room.deposit || 0);
    return { months, rent, parking, deposit, total: rent + parking + deposit };
  };
  const paintTotals = () => {
    const { months, rent, parking, deposit, total } = currentTotals();
    totalsEl.innerHTML = `
      <div class="row"><span>Rent (${months} mo × ${money(room.price_monthly)})</span><span>${money(rent)}</span></div>
      ${parking > 0 ? `<div class="row"><span>${esc(PARKING_PERMIT.label)} (${months} mo × ${money(PARKING_PERMIT.monthlyFee)})</span><span>${money(parking)}</span></div>` : ""}
      ${deposit > 0 ? `<div class="row"><span>Security deposit</span><span>${money(deposit)}</span></div>` : ""}
      <div class="row grand"><span>Total due via Zelle</span><span>${money(total)}</span></div>`;
  };
  pills.addEventListener("change", paintTotals);
  if (parkingBox) parkingBox.addEventListener("change", paintTotals);
  paintTotals();

  // Submit booking
  contentEl.querySelector("#booking-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = contentEl.querySelector("#book-btn");
    const errEl = contentEl.querySelector("#book-error");
    btn.disabled = true;
    btn.textContent = "Submitting…";
    errEl.innerHTML = "";

    const { months, total } = currentTotals();
    const payload = {
      room_id: room.id,
      guest_name: contentEl.querySelector("#f-name").value.trim(),
      guest_email: contentEl.querySelector("#f-email").value.trim(),
      guest_phone: contentEl.querySelector("#f-phone").value.trim(),
      move_in_date: contentEl.querySelector("#f-date").value,
      term_months: months,
      monthly_price: room.price_monthly,
      deposit: room.deposit || 0,
      parking_permit: parkingOn(),
      parking_monthly_fee: parkingOn() ? PARKING_PERMIT.monthlyFee : 0,
      total_amount: total,
      status: "pending_payment",
    };

    const { data, error } = await supabase.from("bookings").insert(payload).select("id").single();

    if (error) {
      errEl.innerHTML = `<div class="error">Couldn't submit: ${esc(error.message)}</div>`;
      btn.disabled = false;
      btn.textContent = "Request booking";
      return;
    }

    // Fire-and-forget: receipt to tenant + alert to owner (never blocks booking)
    notifyBooking(data.id, "created");

    showConfirmation(room, payload, data.id.slice(0, 8).toUpperCase());
  });
}

function showConfirmation(room, booking, refCode) {
  contentEl.querySelector("#book-form-view").classList.add("hidden");
  const doneEl = contentEl.querySelector("#book-done-view");
  doneEl.classList.remove("hidden");
  doneEl.innerHTML = `
    <div class="confirm">
      <h3>✓ Booking request received!</h3>
      <p>Your booking reference is <span class="refcode">${esc(refCode)}</span></p>
      <p><strong>${esc(room.name)}</strong> — ${booking.term_months} month(s) starting ${esc(booking.move_in_date)}, for ${esc(booking.guest_name)}.${booking.parking_permit ? ` Includes <strong>${esc(PARKING_PERMIT.label.toLowerCase())}</strong>.` : ""}</p>
      <p>To finish, send the total below via <strong>${esc(SITE.zelle.label)}</strong>. Put your <strong>name + reference ${esc(refCode)}</strong> in the memo so we can match it.</p>
      <div class="zelle-box">
        <div class="amount">${money(booking.total_amount)}</div>
        <div class="to">${esc(SITE.zelle.label)}: ${esc(SITE.zelle.value)}</div>
      </div>
      <p class="hint">${esc(SITE.confirmationNote)} Your booking stays <em>pending</em> until the payment is confirmed — then the room is yours.</p>
      <p class="hint">Questions? Call/text ${esc(SITE.contactPhone)} or email ${esc(SITE.contactEmail)}.</p>
      <a class="btn secondary" href="index.html" style="margin-top:10px">Back to all rooms</a>
    </div>`;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

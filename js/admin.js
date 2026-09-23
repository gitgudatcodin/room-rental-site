/* Owner admin: dashboard stats, bookings (confirm Zelle / cancel / search / CSV),
   rooms + photos, and property management. */
import { money } from "./config.js";
import { supabase, guardConfig } from "./db.js";
import { notifyBooking } from "./notify.js";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const loginView = document.getElementById("login-view");
const dashView = document.getElementById("dash-view");
const logoutLink = document.getElementById("logout-link");

guardConfig(document.getElementById("config-warning"));

const STATUS_LABEL = {
  pending_payment: "Awaiting payment",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
};

/* ---------------- Auth ---------------- */
async function refreshAuth() {
  const { data } = await supabase.auth.getSession();
  const loggedIn = !!data.session;
  loginView.classList.toggle("hidden", loggedIn);
  dashView.classList.toggle("hidden", !loggedIn);
  logoutLink.classList.toggle("hidden", !loggedIn);
  if (loggedIn) {
    loadBookings();
    loadProperties();
    loadRoomAdmin();
  }
}

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("login-error");
  errEl.innerHTML = "";
  const { error } = await supabase.auth.signInWithPassword({
    email: document.getElementById("login-email").value.trim(),
    password: document.getElementById("login-password").value,
  });
  if (error) {
    errEl.innerHTML = `<div class="error">${esc(error.message)}</div>`;
    return;
  }
  refreshAuth();
});

logoutLink.addEventListener("click", async (e) => {
  e.preventDefault();
  await supabase.auth.signOut();
  refreshAuth();
});

supabase.auth.onAuthStateChange(() => refreshAuth());
refreshAuth();

/* ---------------- Tabs ---------------- */
document.querySelectorAll(".admin-tabs button").forEach((btn) =>
  btn.addEventListener("click", () => {
    document.querySelectorAll(".admin-tabs button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-bookings").classList.toggle("hidden", btn.dataset.tab !== "bookings");
    document.getElementById("tab-rooms").classList.toggle("hidden", btn.dataset.tab !== "rooms");
  })
);

/* ---------------- Bookings ---------------- */
let allBookings = [];
const bookingsList = document.getElementById("bookings-list");
document.getElementById("status-filter").addEventListener("change", renderBookings);
document.getElementById("booking-search").addEventListener("input", renderBookings);
document.getElementById("export-csv").addEventListener("click", exportCSV);

async function loadBookings() {
  const { data, error } = await supabase
    .from("bookings")
    .select("*, rooms(name, properties(name))")
    .order("created_at", { ascending: false });
  if (error) {
    bookingsList.innerHTML = `<div class="error">${esc(error.message)}</div>`;
    return;
  }
  allBookings = data || [];
  renderStats();
  renderBookings();
}

function renderStats() {
  const awaiting = allBookings.filter((b) => b.status === "pending_payment").length;
  const confirmed = allBookings.filter((b) => b.status === "confirmed");
  const revenue = confirmed.reduce((n, b) => n + Number(b.total_amount || 0), 0);
  document.getElementById("stat-awaiting").textContent = awaiting;
  document.getElementById("stat-confirmed").textContent = confirmed.length;
  document.getElementById("stat-revenue").textContent = money(revenue);
}

function filteredBookings() {
  const status = document.getElementById("status-filter").value;
  const q = document.getElementById("booking-search").value.trim().toLowerCase();
  return allBookings.filter((b) => {
    if (status !== "all" && b.status !== status) return false;
    if (q) {
      const hay = [
        b.guest_name, b.guest_email, b.guest_phone,
        b.id.slice(0, 8), b.rooms?.name, b.rooms?.properties?.name,
      ].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderBookings() {
  const data = filteredBookings();
  if (!data.length) {
    bookingsList.innerHTML = `<div class="notice">No bookings match this view.</div>`;
    return;
  }

  bookingsList.innerHTML = `
    <div class="data-wrap">
    <table class="data">
      <thead><tr>
        <th>Date</th><th>Guest</th><th>Room</th><th>Term</th><th>Total</th><th>Status</th><th></th>
      </tr></thead>
      <tbody>
        ${data.map((b) => `
          <tr>
            <td>${esc(new Date(b.created_at).toLocaleDateString())}<br/><small style="color:#7d8881">${esc(b.id.slice(0, 8).toUpperCase())}</small></td>
            <td><strong>${esc(b.guest_name)}</strong><br/>${esc(b.guest_phone)}<br/>${esc(b.guest_email)}<br/><small style="color:#7d8881">Move-in: ${esc(b.move_in_date)}</small></td>
            <td>${esc(b.rooms?.name || "(room deleted)")}<br/><small style="color:#7d8881">${esc(b.rooms?.properties?.name || "")}</small></td>
            <td>${b.term_months} mo${b.parking_permit ? `<br/><span class="tag">Parking</span>` : ""}</td>
            <td><strong>${money(b.total_amount)}</strong></td>
            <td><span class="status ${b.status}">${STATUS_LABEL[b.status]}</span></td>
            <td><div class="row-actions">
              ${b.status === "pending_payment" ? `
                <button class="btn small" data-act="confirm" data-id="${b.id}">Confirm payment</button>
                <button class="btn small danger" data-act="cancel" data-id="${b.id}">Cancel</button>` : ""}
              ${b.status === "confirmed" ? `<button class="btn small danger" data-act="cancel" data-id="${b.id}">Cancel</button>` : ""}
            </div></td>
          </tr>`).join("")}
      </tbody>
    </table>
    </div>`;

  bookingsList.querySelectorAll("button[data-act]").forEach((btn) =>
    btn.addEventListener("click", () => setBookingStatus(btn.dataset.id, btn.dataset.act))
  );
}

async function setBookingStatus(id, act) {
  const booking = allBookings.find((b) => b.id === id);
  if (!booking) return;

  if (act === "confirm") {
    if (!confirm(
      `Confirm Zelle payment of ${money(booking.total_amount)} received from ${booking.guest_name}?\n\nThe room will also be hidden from the site so it can't be double-booked.`
    )) return;
    const { error } = await supabase.from("bookings").update({ status: "confirmed" }).eq("id", id);
    if (error) { alert("Error: " + error.message); return; }
    if (booking.room_id) {
      await supabase.from("rooms").update({ is_available: false }).eq("id", booking.room_id);
    }
    // Fire-and-forget: "you're confirmed" email to the tenant
    notifyBooking(id, "confirmed");
  } else {
    if (!confirm(`Cancel the booking for ${booking.guest_name}?`)) return;
    const { error } = await supabase.from("bookings").update({ status: "cancelled" }).eq("id", id);
    if (error) { alert("Error: " + error.message); return; }
  }
  loadBookings();
  loadRoomAdmin();
}

function exportCSV() {
  const data = filteredBookings();
  if (!data.length) { alert("Nothing to export in this view."); return; }
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["Reference", "Submitted", "Name", "Email", "Phone", "Room", "Property", "Term (mo)", "Move-in", "Parking", "Total", "Status"];
  const lines = [head.map(q).join(",")].concat(
    data.map((b) => [
      b.id.slice(0, 8).toUpperCase(),
      new Date(b.created_at).toLocaleDateString(),
      b.guest_name, b.guest_email, b.guest_phone,
      b.rooms?.name || "", b.rooms?.properties?.name || "",
      b.term_months, b.move_in_date,
      b.parking_permit ? "yes" : "no",
      b.total_amount, STATUS_LABEL[b.status] || b.status,
    ].map(q).join(","))
  );
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `bookings-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------------- Properties ---------------- */
async function loadProperties() {
  const { data, error } = await supabase.from("properties").select("id, name, address").order("name");
  const props = data || [];
  if (error) {
    document.getElementById("prop-list").innerHTML = `<div class="error">${esc(error.message)}</div>`;
    return;
  }
  document.getElementById("room-property").innerHTML = props
    .map((p) => `<option value="${p.id}">${esc(p.name)}</option>`)
    .join("");
  document.getElementById("prop-list").innerHTML = props.length
    ? props.map((p) => `
      <div class="prop-row">
        <div><strong>${esc(p.name)}</strong><br/><small style="color:#7d8881">${esc(p.address || "No address")}</small></div>
        <button class="btn small danger" type="button" data-del-prop="${p.id}">Delete</button>
      </div>`).join("")
    : `<p class="hint">No properties yet — add your first below.</p>`;

  document.getElementById("prop-list").querySelectorAll("[data-del-prop]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this property? Its rooms will be deleted too (bookings are kept but unlinked).")) return;
      const { error } = await supabase.from("properties").delete().eq("id", btn.dataset.delProp);
      if (error) alert("Error: " + error.message);
      else { loadProperties(); loadRoomAdmin(); }
    })
  );
}

document.getElementById("prop-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("prop-name").value.trim();
  const address = document.getElementById("prop-address").value.trim();
  const errEl = document.getElementById("prop-form-error");
  errEl.innerHTML = "";
  if (!name) { errEl.innerHTML = `<div class="error">Give the property a name.</div>`; return; }
  const { error } = await supabase.from("properties").insert({ name, address: address || null });
  if (error) { errEl.innerHTML = `<div class="error">${esc(error.message)}</div>`; return; }
  document.getElementById("prop-name").value = "";
  document.getElementById("prop-address").value = "";
  loadProperties();
});

/* ---------------- Rooms ---------------- */
const roomsList = document.getElementById("rooms-list");
const roomForm = document.getElementById("room-form");
let editingPhotos = [];

async function loadRoomAdmin() {
  const { data: rooms, error } = await supabase
    .from("rooms")
    .select("*, properties(name)")
    .order("created_at", { ascending: false });

  if (error) {
    roomsList.innerHTML = `<div class="error">${esc(error.message)}</div>`;
    return;
  }
  if (!rooms.length) {
    roomsList.innerHTML = `<div class="notice">No rooms yet — add your first one with the form.</div>`;
    return;
  }

  roomsList.innerHTML = `
    <div class="data-wrap">
    <table class="data">
      <thead><tr><th>Room</th><th>Rent</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${rooms.map((r) => `
          <tr>
            <td><strong>${esc(r.name)}</strong><br/><small style="color:#7d8881">${esc(r.properties?.name || "")}</small></td>
            <td>${money(r.price_monthly)}/mo</td>
            <td>${r.is_available ? '<span class="status confirmed">Available</span>' : '<span class="status cancelled">Hidden</span>'}</td>
            <td><div class="row-actions">
              <button class="btn small secondary" data-act="edit" data-id="${r.id}">Edit</button>
              <button class="btn small danger" data-act="del" data-id="${r.id}">Delete</button>
            </div></td>
          </tr>`).join("")}
      </tbody>
    </table>
    </div>`;

  roomsList.querySelectorAll("button[data-act]").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (btn.dataset.act === "edit") startEdit(btn.dataset.id);
      else deleteRoom(btn.dataset.id);
    })
  );
}

async function startEdit(id) {
  const { data: r, error } = await supabase.from("rooms").select("*").eq("id", id).single();
  if (error) { alert("Error: " + error.message); return; }
  document.getElementById("room-form-title").textContent = "Edit room";
  document.getElementById("room-id").value = r.id;
  document.getElementById("room-property").value = r.property_id;
  document.getElementById("room-name").value = r.name;
  document.getElementById("room-desc").value = r.description || "";
  document.getElementById("room-price").value = r.price_monthly;
  document.getElementById("room-deposit").value = r.deposit || 0;
  document.getElementById("room-amenities").value = (r.amenities || []).join(", ");
  document.getElementById("room-available").checked = r.is_available;
  editingPhotos = [...(r.photos || [])];
  paintPhotoList();
  document.getElementById("room-save-btn").textContent = "Save changes";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetForm() {
  roomForm.reset();
  document.getElementById("room-id").value = "";
  document.getElementById("room-form-title").textContent = "Add a room";
  document.getElementById("room-save-btn").textContent = "Save room";
  document.getElementById("room-form-error").innerHTML = "";
  editingPhotos = [];
  paintPhotoList();
}

document.getElementById("room-cancel-btn").addEventListener("click", resetForm);

function paintPhotoList() {
  const el = document.getElementById("photo-list");
  el.innerHTML = editingPhotos
    .map((url, i) => `
      <span class="pwrap">
        <img src="${esc(url)}" alt="Room photo ${i + 1}" />
        <button type="button" data-i="${i}" title="Remove">×</button>
      </span>`)
    .join("");
  el.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", async () => {
      const url = editingPhotos[Number(b.dataset.i)];
      const path = url.split("/room-photos/")[1];
      if (path) await supabase.storage.from("room-photos").remove([decodeURIComponent(path)]);
      editingPhotos.splice(Number(b.dataset.i), 1);
      paintPhotoList();
    })
  );
}

async function deleteRoom(id) {
  if (!confirm("Delete this room? Its bookings will be kept but unlinked.")) return;
  const { error } = await supabase.from("rooms").delete().eq("id", id);
  if (error) alert("Error: " + error.message);
  else { resetForm(); loadRoomAdmin(); }
}

roomForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("room-form-error");
  const saveBtn = document.getElementById("room-save-btn");
  errEl.innerHTML = "";
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";

  try {
    const id = document.getElementById("room-id").value || null;

    const files = document.getElementById("room-photos").files;
    const folder = id || "tmp-" + Date.now();
    for (const file of files) {
      const path = `${folder}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("room-photos").upload(path, file);
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("room-photos").getPublicUrl(path);
      editingPhotos.push(data.publicUrl);
    }

    const payload = {
      property_id: document.getElementById("room-property").value,
      name: document.getElementById("room-name").value.trim(),
      description: document.getElementById("room-desc").value.trim() || null,
      price_monthly: Number(document.getElementById("room-price").value),
      deposit: Number(document.getElementById("room-deposit").value || 0),
      amenities: document.getElementById("room-amenities").value.split(",").map((s) => s.trim()).filter(Boolean),
      photos: editingPhotos,
      is_available: document.getElementById("room-available").checked,
    };

    let newId = id;
    if (id) {
      const { error } = await supabase.from("rooms").update(payload).eq("id", id);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from("rooms").insert(payload).select("id").single();
      if (error) throw error;
      newId = data.id;
    }

    if (!id && files.length) {
      const moved = [];
      for (const url of editingPhotos) {
        const oldPath = decodeURIComponent(url.split("/room-photos/")[1]);
        if (oldPath.startsWith("tmp-")) {
          const fileName = oldPath.split("/").pop();
          const newPath = `${newId}/${fileName}`;
          const { error: mvErr } = await supabase.storage.from("room-photos").move(oldPath, newPath);
          if (!mvErr) {
            const { data } = supabase.storage.from("room-photos").getPublicUrl(newPath);
            moved.push(data.publicUrl);
          } else moved.push(url);
        } else moved.push(url);
      }
      await supabase.from("rooms").update({ photos: moved }).eq("id", newId);
    }

    resetForm();
    loadRoomAdmin();
  } catch (err) {
    errEl.innerHTML = `<div class="error">${esc(err.message)}</div>`;
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = document.getElementById("room-id").value ? "Save changes" : "Save room";
  }
});

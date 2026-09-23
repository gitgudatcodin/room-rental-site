/* Homepage: listings with search / filter / sort, FAQ contact, live room count. */
import { SITE, money } from "./config.js";
import { supabase, guardConfig } from "./db.js";

document.getElementById("brand-name").textContent = SITE.name;
document.getElementById("foot-name").textContent = SITE.name;
document.getElementById("hero-tagline").textContent = SITE.tagline;
document.getElementById("foot-contact").textContent =
  `${SITE.contactPhone} · ${SITE.contactEmail}`;
const faqContact = document.getElementById("faq-contact");
if (faqContact) faqContact.textContent = `${SITE.contactPhone} / ${SITE.contactEmail}`;

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const listingsEl = document.getElementById("listings");
const filtersEl = document.getElementById("filters");
let allGroups = [];

if (!guardConfig(document.getElementById("config-warning"))) {
  listingsEl.innerHTML = "";
} else {
  paintSkeleton();
  loadRooms();
}

function paintSkeleton() {
  const card = `
    <div class="card" aria-hidden="true">
      <div class="photo"><div class="skel-block" style="width:100%;height:100%;"></div></div>
      <div class="body">
        <div class="skel-line" style="width:65%"></div>
        <div class="skel-line" style="width:40%"></div>
        <div class="skel-line" style="width:85%"></div>
      </div>
    </div>`;
  listingsEl.innerHTML = `<div class="cards">${card.repeat(3)}</div>`;
}

async function loadRooms() {
  const { data, error } = await supabase
    .from("properties")
    .select("id, name, address, rooms(id, name, price_monthly, amenities, photos, is_available)")
    .order("name");

  if (error) {
    listingsEl.innerHTML = `<div class="error">Couldn't load rooms: ${esc(error.message)}</div>`;
    return;
  }

  allGroups = (data || [])
    .map((p) => ({ ...p, rooms: (p.rooms || []).filter((r) => r.is_available) }))
    .filter((p) => p.rooms.length > 0);

  // Property filter options
  const propSel = document.getElementById("f-property");
  propSel.innerHTML =
    `<option value="">All properties</option>` +
    allGroups.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("");

  filtersEl.hidden = false;
  ["f-search", "f-property", "f-price", "f-sort"].forEach((id) =>
    document.getElementById(id).addEventListener("input", renderFiltered)
  );

  renderFiltered();
}

function renderFiltered() {
  const q = document.getElementById("f-search").value.trim().toLowerCase();
  const propId = document.getElementById("f-property").value;
  const maxPrice = Number(document.getElementById("f-price").value || 0);
  const sort = document.getElementById("f-sort").value;

  let groups = allGroups
    .map((p) => {
      if (propId && p.id !== propId) return null;
      let rooms = p.rooms.filter((r) => {
        if (maxPrice && Number(r.price_monthly) > maxPrice) return false;
        if (q && !(r.name + " " + p.name).toLowerCase().includes(q)) return false;
        return true;
      });
      if (sort === "asc") rooms = [...rooms].sort((a, b) => a.price_monthly - b.price_monthly);
      if (sort === "desc") rooms = [...rooms].sort((a, b) => b.price_monthly - a.price_monthly);
      return rooms.length ? { ...p, rooms } : null;
    })
    .filter(Boolean);

  const count = groups.reduce((n, g) => n + g.rooms.length, 0);
  setRoomCount(count);
  document.getElementById("filter-count").textContent =
    count === 1 ? "1 room matches your filters." : `${count} rooms match your filters.`;

  if (!count) {
    listingsEl.innerHTML = `<div class="notice">No rooms match those filters. Try widening your search — or contact us at ${esc(SITE.contactPhone)} and we'll help.</div>`;
    return;
  }

  listingsEl.innerHTML = groups
    .map(
      (p) => `
      <div class="property-group">
        <h3>${esc(p.name)}</h3>
        ${p.address ? `<p class="addr">${esc(p.address)}</p>` : ""}
        <div class="cards">
          ${p.rooms.map((r) => cardHtml(p, r)).join("")}
        </div>
      </div>`
    )
    .join("");
}

function setRoomCount(n) {
  const el = document.getElementById("stat-rooms");
  if (el) el.textContent = n;
}

function cardHtml(p, r) {
  const photo = (r.photos && r.photos[0])
    ? `<img src="${esc(r.photos[0])}" alt="${esc(r.name)}" loading="lazy" />`
    : `<div class="photo-placeholder">${esc(r.name.trim().charAt(0).toUpperCase() || "R")}</div>`;
  const tags = (r.amenities || []).slice(0, 4).map((a) => `<span class="tag">${esc(a)}</span>`).join("");
  return `
    <div class="card">
      <div class="photo">${photo}<span class="price-badge">${money(r.price_monthly)}<small> /mo</small></span></div>
      <div class="body">
        <h4>${esc(r.name)}</h4>
        <p class="prop">${esc(p.name)}</p>
        <div class="amenities">${tags}</div>
        <a class="btn" href="room.html?id=${r.id}">View &amp; Book</a>
      </div>
    </div>`;
}

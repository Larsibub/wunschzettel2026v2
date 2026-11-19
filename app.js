/* ============================================================
   app.js – Digitaler Wunschzettel (Dark Mode)
   Paket 4 – JavaScript-Logik
   Stack: Vanilla JS + Supabase (supabase-js via CDN)
   Abhängigkeiten (in index.html geladen, in dieser Reihenfolge):
     1) config.js  -> definiert window.CONFIG (SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_EMAIL)
     2) supabase-js CDN -> window.supabase
     3) app.js (diese Datei)
   ============================================================ */

"use strict";

/* ------------------------------------------------------------
   1. Supabase-Client-Initialisierung
   ------------------------------------------------------------ */
let supabaseClient = null;

function initSupabase() {
  if (!window.CONFIG || !window.CONFIG.SUPABASE_URL || !window.CONFIG.SUPABASE_ANON_KEY) {
    console.error("[app] CONFIG fehlt oder ist unvollständig (SUPABASE_URL / SUPABASE_ANON_KEY).");
    return null;
  }
  supabaseClient = window.supabase.createClient(
    window.CONFIG.SUPABASE_URL,
    window.CONFIG.SUPABASE_ANON_KEY
  );
  return supabaseClient;
}

/* ------------------------------------------------------------
   2. State & kleine Helfer
   ------------------------------------------------------------ */
let allWishes = [];          // komplette, unveränderte Liste (Quelle für Filter/Sorte)
let currentSession = null;   // aktuelle Supabase-Session (Admin)
let pendingUpload = null;    // { name, dataUrl } – wartendes Bild für Formulare

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const PRIORITY_LABELS = { 1: "Niedrig", 2: "Mittel", 3: "Hoch" };

const el = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatPrice(value) {
  const n = Number(value);
  if (!isFinite(n)) return "–";
  return n.toFixed(2).replace(".", ",") + " €";
}

function isValidUrl(value) {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/* Kleines Toast-System (keine alert()) */
let toastEl = null;
function showToast(message, variant = "info", timeoutMs = 3200) {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.setAttribute("role", "status");
    toastEl.setAttribute("aria-live", "polite");
    toastEl.style.cssText =
      "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);" +
      "max-width:90vw;padding:12px 18px;border-radius:10px;z-index:9999;" +
      "font-size:14px;line-height:1.4;box-shadow:0 8px 30px rgba(0,0,0,.45);" +
      "transition:opacity .25s ease, transform .25s ease;";
    document.body.appendChild(toastEl);
  }
  const colors = {
    info: { bg: "#1f2430", fg: "#e7ebf3", bd: "#2c3444" },
    success: { bg: "#12351f", fg: "#d6ffe2", bd: "#1f6b34" },
    error: { bg: "#3a1518", fg: "#ffdfe1", bd: "#7a2229" },
  };
  const c = colors[variant] || colors.info;
  toastEl.style.background = c.bg;
  toastEl.style.color = c.fg;
  toastEl.style.border = "1px solid " + c.bd;
  toastEl.style.opacity = "1";
  toastEl.style.transform = "translate(-50%, 0)";
  toastEl.textContent = message;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    if (toastEl) {
      toastEl.style.opacity = "0";
      toastEl.style.transform = "translate(-50%, 10px)";
    }
  }, timeoutMs);
}

/* ------------------------------------------------------------
   3. Session / Admin-UI
   ------------------------------------------------------------ */
function isAdmin() {
  return Boolean(currentSession);
}

function setAdminUI(visible) {
  const toolbar = el("admin-toolbar");
  const loginBtn = el("login-btn");
  if (toolbar) toolbar.hidden = !visible;
  if (loginBtn) loginBtn.hidden = visible;
}

function openModal(modalId) {
  const m = el(modalId);
  if (m) m.hidden = false;
}
function closeModal(modalId) {
  const m = el(modalId);
  if (m) m.hidden = true;
}

async function handleLogout() {
  try {
    if (supabaseClient) await supabaseClient.auth.signOut();
  } catch (err) {
    console.error("[app] signOut Fehler:", err);
  }
  currentSession = null;
  setAdminUI(false);
  showToast("Abgemeldet.", "info");
}

async function checkSession() {
  if (!supabaseClient) return;
  try {
    const { data } = await supabaseClient.auth.getSession();
    currentSession = data && data.session ? data.session : null;
  } catch (err) {
    console.error("[app] getSession Fehler:", err);
    currentSession = null;
  }
  setAdminUI(isAdmin());
}

/* ------------------------------------------------------------
   4. Laden & Rendern der Wunschkarten
   ------------------------------------------------------------ */
async function loadWishes() {
  const grid = el("wish-grid");
  if (!grid) return;
  grid.innerHTML = '<div class="empty-state">Lade Wünsche…</div>';

  try {
    const { data, error } = await supabaseClient
      .from("wishes")
      .select("id, title, description, price, priority, product_url, image_url, is_reserved, created_at");
    if (error) throw error;
    allWishes = Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("[app] Laden fehlgeschlagen:", err);
    grid.innerHTML = "";
    const empty = el("empty-state");
    if (empty) {
      empty.hidden = false;
      empty.textContent = "Fehler beim Laden. Bitte später erneut versuchen.";
    }
    return;
  }
  renderGrid();
}

function buildBadgeHtml(wish) {
  let badges = "";
  const p = Number(wish.priority);
  if (p === 1 || p === 2 || p === 3) {
    badges += `<span class="badge badge-priority-${p}">${PRIORITY_LABELS[p]}</span>`;
  }
  if (wish.is_reserved) {
    badges += `<span class="badge badge-reserved">Reserviert</span>`;
  }
  return badges;
}

function cardHtml(wish) {
  const hasImage = Boolean(wish.image_url);
  const image = hasImage
    ? `<img class="wish-card-image-img" src="${escapeHtml(wish.image_url)}" alt="${escapeHtml(wish.title)}" loading="lazy">`
    : `<div class="wish-card-image-placeholder" aria-hidden="true"></div>`;

  const title = escapeHtml(wish.title);
  const desc = wish.description
    ? `<div class="wish-card-desc">${escapeHtml(wish.description)}</div>`
    : "";

  const price = wish.price !== null && wish.price !== undefined && wish.price !== ""
    ? `<div class="wish-card-price">${escapeHtml(formatPrice(wish.price))}</div>`
    : "";

  let productLink = "";
  if (isValidUrl(wish.product_url)) {
    productLink = `<a class="product-link" href="${escapeHtml(wish.product_url)}" target="_blank" rel="noopener noreferrer">Zum Produkt</a>`;
  }

  const adminActions = `
    <div class="admin-actions" hidden>
      <button type="button" class="btn btn-ghost" data-action="edit" data-id="${escapeHtml(wish.id)}">Bearbeiten</button>
      <button type="button" class="btn btn-ghost" data-action="toggle" data-id="${escapeHtml(wish.id)}">${wish.is_reserved ? "Freigeben" : "Reservieren"}</button>
      <button type="button" class="btn btn-danger" data-action="delete" data-id="${escapeHtml(wish.id)}">Löschen</button>
    </div>`;

  const reservedClass = wish.is_reserved ? " is-reserved" : "";
  const reservedAria = wish.is_reserved ? ' aria-label="Reserviert"' : "";

  return `<article class="wish-card${reservedClass}" data-id="${escapeHtml(wish.id)}"${reservedAria}>
    <div class="wish-card-image">${image}</div>
    <div class="wish-card-badges">${buildBadgeHtml(wish)}</div>
    <div class="wish-card-title">${title}</div>
    ${desc}
    ${price}
    <div class="wish-card-actions">${productLink}</div>
    ${adminActions}
    <div class="wish-card-delete-confirm" hidden>
      <span>Löschen?</span>
      <button type="button" class="btn btn-danger" id="delete-confirm" data-id="${escapeHtml(wish.id)}">Löschen</button>
      <button type="button" class="btn btn-ghost" id="delete-cancel">Abbrechen</button>
    </div>
  </article>`;
}

function applyFilters(list) {
  const priorityVal = (el("filter-priority")?.value || "all").trim();
  const onlyAvailable = Boolean(el("filter-available")?.checked);
  const sortMode = el("sort-select")?.value || "priority_desc";
  const search = (el("search-input")?.value || "").trim().toLowerCase();

  let result = list.slice();

  if (priorityVal !== "all" && priorityVal !== "") {
    const pv = Number(priorityVal);
    result = result.filter((w) => Number(w.priority) === pv);
  }
  if (onlyAvailable) {
    result = result.filter((w) => !w.is_reserved);
  }
  if (search) {
    result = result.filter((w) => {
      const hay = ((w.title || "") + " " + (w.description || "")).toLowerCase();
      return hay.includes(search);
    });
  }

  const priceNum = (w) => Number(w.price) || 0;
  const priorityNum = (w) => Number(w.priority) || 0;
  switch (sortMode) {
    case "price_asc":
      result.sort((a, b) => priceNum(a) - priceNum(b));
      break;
    case "price_desc":
      result.sort((a, b) => priceNum(b) - priceNum(a));
      break;
    case "priority_asc":
      result.sort((a, b) => priorityNum(a) - priorityNum(b));
      break;
    case "priority_desc":
    default:
      result.sort((a, b) => priorityNum(b) - priorityNum(a));
      break;
  }
  return result;
}

function renderGrid() {
  const grid = el("wish-grid");
  const empty = el("empty-state");
  if (!grid) return;

  const filtered = applyFilters(allWishes);

  if (filtered.length === 0) {
    grid.innerHTML = "";
    if (empty) {
      empty.hidden = false;
      empty.textContent = allWishes.length === 0
        ? "Noch keine Wünsche vorhanden."
        : "Keine Wünsche entsprechen deinen Filtern.";
    }
  } else {
    if (empty) empty.hidden = true;
    grid.innerHTML = filtered.map(cardHtml).join("");
  }

  // Admin-Buttons je nach Session ein-/ausblenden
  const showAdmin = isAdmin();
  grid.querySelectorAll(".admin-actions").forEach((a) => (a.hidden = !showAdmin));
  // Verstecke ggf. aktive Löschbestätigung
  grid.querySelectorAll(".wish-card-delete-confirm").forEach((c) => (c.hidden = true));
}

/* ------------------------------------------------------------
   5. Löschbestätigung (in-card)
   ------------------------------------------------------------ */
function hideAllDeleteConfirms() {
  document.querySelectorAll(".wish-card-delete-confirm").forEach((c) => (c.hidden = true));
}

function showDeleteConfirm(card) {
  hideAllDeleteConfirms();
  const box = card.querySelector(".wish-card-delete-confirm");
  if (box) box.hidden = false;
}

async function handleDelete(id) {
  if (!isAdmin()) {
    showToast("Nur eingeloggter Admin kann löschen.", "error");
    return;
  }
  try {
    const { error } = await supabaseClient.from("wishes").delete().eq("id", id);
    if (error) throw error;
    allWishes = allWishes.filter((w) => w.id !== id);
    renderGrid();
    showToast("Wunsch gelöscht.", "success");
  } catch (err) {
    console.error("[app] Delete Fehler:", err);
    showToast("Löschen fehlgeschlagen.", "error");
  }
}

/* ------------------------------------------------------------
   6. Reserviert umschalten
   ------------------------------------------------------------ */
async function handleToggleReserved(id) {
  if (!isAdmin()) {
    showToast("Nur eingeloggter Admin darf reservieren.", "error");
    return;
  }
  const wish = allWishes.find((w) => w.id === id);
  if (!wish) return;
  const newValue = !wish.is_reserved;
  try {
    const { error } = await supabaseClient
      .from("wishes")
      .update({ is_reserved: newValue })
      .eq("id", id);
    if (error) throw error;
    wish.is_reserved = newValue;
    renderGrid();
    showToast(newValue ? "Als reserviert markiert." : "Freigegeben.", "success");
  } catch (err) {
    console.error("[app] Toggle Fehler:", err);
    showToast("Umschalten fehlgeschlagen.", "error");
  }
}

/* ------------------------------------------------------------
   7. Bild-Upload (Supabase Storage)
   ------------------------------------------------------------ */
function validateImageFile(file) {
  if (!file) return { ok: false, reason: "Keine Datei ausgewählt." };
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { ok: false, reason: "Nur JPG, PNG oder WebP erlaubt." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, reason: "Datei ist größer als 5 MB." };
  }
  return { ok: true };
}

function loadPreview(dataUrl) {
  const prev = el("field-image-preview");
  if (!prev) return;
  if (dataUrl) {
    prev.src = dataUrl;
    prev.removeAttribute("hidden");
  } else {
    prev.removeAttribute("src");
    prev.setAttribute("hidden", "hidden");
  }
}

function handleImageFileChange(e) {
  const input = el("field-image");
  const file = input ? input.files && input.files[0] : null;
  if (!file) {
    pendingUpload = null;
    loadPreview(null);
    return;
  }
  const check = validateImageFile(file);
  if (!check.ok) {
    showToast(check.reason, "error");
    if (input) input.value = "";
    pendingUpload = null;
    loadPreview(null);
    return;
  }
  // Client-seitige Vorschau
  const reader = new FileReader();
  reader.onload = () => loadPreview(reader.result);
  reader.onerror = () => showToast("Vorschau konnte nicht geladen werden.", "error");
  reader.readAsDataURL(file);
  pendingUpload = file;
}

async function uploadImage(file) {
  if (!file) return null;
  const check = validateImageFile(file);
  if (!check.ok) throw new Error(check.reason);

  const uuid = (crypto && crypto.randomUUID) ? crypto.randomUUID() : "id-" + Date.now();
  const safeName = String(file.name || "bild").replace(/[^\w.\-]+/g, "_");
  const path = `wish-images/${uuid}/${safeName}`;

  const { error } = await supabaseClient.storage.from("wish-images").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabaseClient.storage.from("wish-images").getPublicUrl(path);
  return data && data.publicUrl;
}

/* ------------------------------------------------------------
   8. Formular (Hinzufügen / Bearbeiten)
   ------------------------------------------------------------ */
function resetForm() {
  const form = el("wish-form");
  if (form) form.reset();
  el("field-id") && (el("field-id").value = "");
  el("field-image") && (el("field-image").value = "");
  pendingUpload = null;
  loadPreview(null);
}

function openCreateModal() {
  if (!isAdmin()) {
    showToast("Bitte zuerst einloggen.", "error");
    return;
  }
  resetForm();
  openModal("admin-modal");
  el("field-title") && el("field-title").focus();
}

function openEditModal(id) {
  if (!isAdmin()) {
    showToast("Bitte zuerst einloggen.", "error");
    return;
  }
  const wish = allWishes.find((w) => w.id === id);
  if (!wish) {
    showToast("Wunsch nicht gefunden.", "error");
    return;
  }
  el("field-id").value = wish.id;
  el("field-title").value = wish.title || "";
  el("field-description").value = wish.description || "";
  el("field-price").value = wish.price ?? "";
  el("field-priority").value = String(wish.priority ?? 1);
  el("field-product-url").value = wish.product_url || "";
  el("field-is-reserved").checked = Boolean(wish.is_reserved);

  // Bild: neue Auswahl zurücksetzen; Vorschau auf bestehendes Bild
  pendingUpload = null;
  el("field-image") && (el("field-image").value = "");
  loadPreview(wish.image_url || null);

  openModal("admin-modal");
  el("field-title") && el("field-title").focus();
}

function readForm() {
  const title = (el("field-title").value || "").trim();
  const description = (el("field-description").value || "").trim();
  const priceRaw = el("field-price").value;
  const priority = Number(el("field-priority").value || 1);
  const product_url = (el("field-product-url").value || "").trim();
  const is_reserved = el("field-is-reserved").checked;
  const id = (el("field-id").value || "").trim();

  let price = 0;
  if (priceRaw !== "" && priceRaw !== null && priceRaw !== undefined) {
    const parsed = Number(String(priceRaw).replace(",", "."));
    if (isNaN(parsed) || parsed < 0) {
      throw new Error("Preis ist ungültig.");
    }
    price = Math.round(parsed * 100) / 100;
  }

  if (!title) throw new Error("Titel ist erforderlich.");
  if (!(priority === 1 || priority === 2 || priority === 3)) {
    throw new Error("Priorität muss 1, 2 oder 3 sein.");
  }
  if (product_url && !isValidUrl(product_url)) {
    throw new Error("Produkt-URL muss http/https sein.");
  }

  return { id, title, description, price, priority, product_url: product_url || null, is_reserved };
}

async function handleSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();
  if (!isAdmin()) {
    showToast("Nur eingeloggter Admin kann speichern.", "error");
    return;
  }

  let data;
  try {
    data = readForm();
  } catch (err) {
    showToast(err.message || "Formular ungültig.", "error");
    return;
  }

  try {
    // Bild hochladen (falls neu ausgewählt)
    let image_url = null;
    if (pendingUpload) {
      image_url = await uploadImage(pendingUpload);
    } else if (data.id) {
      // beim Bearbeiten ohne neues Bild: vorhandenes beibehalten
      const existing = allWishes.find((w) => w.id === data.id);
      if (existing) image_url = existing.image_url || null;
    }

    if (data.id) {
      // UPDATE
      const payload = {
        title: data.title,
        description: data.description,
        price: data.price,
        priority: data.priority,
        product_url: data.product_url,
        is_reserved: data.is_reserved,
      };
      if (image_url) payload.image_url = image_url;
      const { error } = await supabaseClient.from("wishes").update(payload).eq("id", data.id);
      if (error) throw error;
    } else {
      // INSERT
      const { error } = await supabaseClient.from("wishes").insert({
        title: data.title,
        description: data.description,
        price: data.price,
        priority: data.priority,
        product_url: data.product_url,
        image_url: image_url,
        is_reserved: data.is_reserved,
      });
      if (error) throw error;
    }

    closeModal("admin-modal");
    await loadWishes();
    resetForm();
    showToast(data.id ? "Wunsch aktualisiert." : "Wunsch hinzugefügt.", "success");
  } catch (err) {
    console.error("[app] Speichern fehlgeschlagen:", err);
    showToast("Speichern fehlgeschlagen: " + (err.message || "Unbekannter Fehler"), "error");
  }
}

/* ------------------------------------------------------------
9. Admin-Login
   ------------------------------------------------------------ */
async function handleLogin(e) {
  if (e && e.preventDefault) e.preventDefault();
  const pwInput = el("login-password");
  const password = pwInput ? pwInput.value : "";

  if (!password) {
    showToast("Bitte Passwort eingeben.", "error");
    return;
  }
  if (!window.CONFIG || !window.CONFIG.ADMIN_EMAIL) {
    showToast("ADMIN_EMAIL in config.js fehlt.", "error");
    return;
  }

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: window.CONFIG.ADMIN_EMAIL,
      password: password,
    });
    if (error) throw error;

    currentSession = data.session;
    if (pwInput) pwInput.value = "";
    closeModal("login-modal");
    setAdminUI(true);
    renderGrid();
    showToast("Erfolgreich eingeloggt!", "success");
  } catch (err) {
    console.error("[app] Login fehlgeschlagen:", err);
    showToast("Falsches Passwort oder Login-Fehler.", "error");
  }
}

/* ------------------------------------------------------------
10. Event-Listener & App-Start
   ------------------------------------------------------------ */
function bindEvents() {
  // Login & Logout
  el("login-btn")?.addEventListener("click", () => {
    openModal("login-modal");
    el("login-password")?.focus();
  });
  el("login-close")?.addEventListener("click", () => closeModal("login-modal"));
  el("login-form")?.addEventListener("submit", handleLogin);
  el("logout-btn")?.addEventListener("click", handleLogout);

  // Wunsch-Modal (Neu & Abbrechen)
  el("add-wish-btn")?.addEventListener("click", openCreateModal);
  el("form-cancel")?.addEventListener("click", () => {
    closeModal("admin-modal");
    resetForm();
  });
  el("wish-form")?.addEventListener("submit", handleSubmit);
  el("field-image")?.addEventListener("change", handleImageFileChange);

  // Klick auf dunklen Modal-Hintergrund schließt Modals
  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", () => {
      closeModal("login-modal");
      closeModal("admin-modal");
    });
  });

  // Filter & Suche
  el("filter-priority")?.addEventListener("change", renderGrid);
  el("filter-available")?.addEventListener("change", renderGrid);
  el("sort-select")?.addEventListener("change", renderGrid);
  el("search-input")?.addEventListener("input", renderGrid);

  // Karten-Aktionen (Bearbeiten, Reservieren, Löschen) via Event-Delegation
  el("wish-grid")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const card = btn.closest(".wish-card");
    const id = btn.dataset.id || card?.dataset.id;

    if (btn.dataset.action === "edit" && id) {
      openEditModal(id);
    } else if (btn.dataset.action === "toggle" && id) {
      handleToggleReserved(id);
    } else if (btn.dataset.action === "delete" && card) {
      showDeleteConfirm(card);
    } else if (btn.id === "delete-confirm" && id) {
      handleDelete(id);
    } else if (btn.id === "delete-cancel") {
      hideAllDeleteConfirms();
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!initSupabase()) {
    showToast("Bitte erst config.js mit Supabase-Daten ausfüllen.", "error", 6000);
    return;
  }
  bindEvents();
  await checkSession();
  await loadWishes();
});
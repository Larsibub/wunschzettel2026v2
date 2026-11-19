# ARCHITEKTUR.md – Digitaler Wunschzettel (Dark Mode)

> **Status:** Verbindliche Spezifikation (Bauplan, KEIN Anwendungscode).
> **Stack:** Vanilla HTML + CSS + JavaScript + Supabase (via CDN `supabase-js`). **Kein Build-Step.**
> **Regel für alle Agenten:** Alle `id`-Attribute, CSS-Klassen und DB-Namen EXAKT wie in Abschnitt 4/3 verwenden. Abweichungen nur durch Update dieser Datei.

---

## 1. Projektübersicht & Features

Eine Single-Page-Anwendung (eine öffentliche URL) mit zwei Ansichten:

### 1.1 Öffentliche Ansicht (Basis, für alle Besucher)
- Zeigt alle Wünsche in einem **Responsiven Card-Grid**.
- Jede Karte: Produktbild (falls vorhanden), Titel, Beschreibung, Preis, **Prioritäts-Badge** und Button/Link „Zum Produkt“ (Öffnet `product_url` in neuem Tab).
- **Filter/Sortierung** (Client-side):
  - Filter nach Priorität (Alle / Niedrig / Mittel / Hoch).
  - Filter „Nur noch frei“ (ausgeblendet: reservierte Wünsche).
  - Sortierung nach Preis (auf/ab) oder Priorität (absteigend) – Standard: Priorität absteigend.
  - Textsuche über Titel + Beschreibung.
- **Dark-Mode-Design** als Default (kein Light-Toggle nötig, optional später).
- Reservierte Wünsche (`is_reserved = true`) werden **visuell markiert** (Badge „Reserviert“, gedämpftes Bild), bleiben aber sichtbar.

### 1.2 Bearbeitungsmodus (Admin-Ansicht, passwortgeschützt)
Nur nach erfolgreichem Login (siehe Sicherheitskonzept, Abschnitt 3.3):
- **Wunsch hinzufügen** (Formular: Titel, Beschreibung, Preis, Priorität, Produkt-URL, Bild-Upload).
- **Wunsch bearbeiten** (gleiche Felder, inkl. Bild austauschen).
- **Wunsch löschen** (mit Bestätigungs-Dialog).
- **Reserviert umschalten** (Checkbox/Toggle pro Wunsch).
- Admin-Kontrollleiste wird nur im Admin-Modus eingeblendet (Button „+ Neuen Wunsch“, Login-Ausloggen).

### 1.3 Bild-Upload
- Bild-Datei (JPG/PNG/WebP, max. ~5 MB, Client-Seite prüfen) wird per Drag&Drop oder Datei-Picker in den Supabase-Storage-Bucket `wish-images` hochgeladen.
- Nach Upload wird die **öffentliche Storage-URL** in `wishes.image_url` gespeichert.
- Ohne Bild → Card zeigt Platzhalter-Icon (CSS), kein Pflichtfeld.

### 1.4 Nicht-Features (explizit AUSSCHLIESSEN, schlank halten)
- Kein User-Management, keine Kommentare, keine Kategorien, keine Kategorien-DB, keine API, kein Backend-Server, keine Build-Tools, kein Framework.

---

## 2. Dateistruktur (EXAKT diese 5 Dateien)
/wunschzettel
├── supabase_setup.sql # 1) Tabellen + Storage-Bucket + RLS-Policies
├── index.html # 2) Öffentliche Ansicht + Login-Modal + Bearbeitungs-Modal
├── style.css # 3) Dark-Mode, Glassmorphism, Grid, Badges, Responsive
├── config.js # 4) Platzhalter: Supabase URL, Anon-Key, Admin-Auth-Daten
└── app.js # 5) Gesamte Logik (Supabase, CRUD, Filter, Login, Upload)


**Lade-Reihenfolge in `index.html` (wichtig):**
1. `config.js` (DEFINIERT GLOBALS VOR `app.js`)
2. Supabase CDN: `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`
3. `app.js` (nutzt `CONFIG` + `supabase-js`)

> `style.css` wird per `<link>` im `<head>` eingebunden. Keine Inline-Styles in HTML (nur Utility-/Layout-Exceptions ausnahmsweise).

---

## 3. Datenbank-Schema (Supabase)

### 3.1 Tabelle `wishes`

| Spalte        | Datentyp      | Constraint / Default                        | Beschreibung                              |
|---------------|---------------|--------------------------------------------|-------------------------------------------|
| `id`          | `uuid`        | `PRIMARY KEY`, DEFAULT `gen_random_uuid()` | Surrogate Key                             |
| `title`       | `text`        | `NOT NULL`                                  | Titel / Produktname                       |
| `description` | `text`        | DEFAULT `''`                                | Beschreibung                              |
| `price`       | `numeric(10,2)` | DEFAULT `0`                                 | Preis (z. B. `99.90`)                     |
| `priority`    | `integer`     | `NOT NULL` DEFAULT `1`, `CHECK (priority BETWEEN 1 AND 3)` | 1 = Niedrig, 2 = Mittel, 3 = Hoch |
| `product_url` | `text`        | –                                           | Externe Produkt-URL (http/https)          |
| `image_url`   | `text`        | –                                           | Öffentliche Storage-URL des Bildes        |
| `is_reserved` | `boolean`     | `NOT NULL` DEFAULT `false`                  | Ist der Wunsch schon vergeben?            |
| `created_at`  | `timestamptz` | `NOT NULL` DEFAULT `now()`                  | Erstellungszeitpunkt                      |

Index-Empfehlung: `CREATE INDEX idx_wishes_priority ON wishes(priority DESC);`

### 3.2 Supabase Storage-Bucket `wish-images`
- **Typ:** Public Bucket (damit Besucher die Bilder ohne Auth laden können).
- **Ziel-Pfad/Ordner:** `wish-images/{uuid}/{dateiname}` (jedes Bild in eigenem UUID-Ordner, Vermeidung von Kollisionen).
- **RLS auf Storage:**
  - `read`: `anon` UND `authenticated` dürfen lesen (public images).
  - `insert` + `update` + `delete`: NUR `authenticated`.
- **Client-seitige Validierung (in `app.js`):** Dateityp `image/jpeg|image/png|image/webp`, max. 5 MB.

### 3.3 Sicherheitskonzept (Passwortschutz)
**Ansatz:** Supabase-Auth (ein einzelner Admin-Account) + RLS-Policies auf `wishes`.
Damit bleibt es rein client-seitig (CDN) und sicher – das Passwort wird NICHT im JS-Code abgelegt.

- **Admin-Account:** Im Supabase-Dashboard **ein einziges Auth-User** anlegen (E-Mail + Passwort).
  - Die **E-Mail wird als Konstante in `config.js`** hinterlegt (`ADMIN_EMAIL`).
  - Der Besucher gibt **nur das Passwort** im Login-Modal ein (E-Mail wird vom Code mitgeschickt) → „nur Passwort“-Erfahrung.
- **Login in `app.js`:** `supabase.auth.signInWithPassword({ email: CONFIG.ADMIN_EMAIL, password })`.
- **RLS-Policies auf `wishes`:**

| Operation        | Erlaubt für                          | Regel (Kern)                                  |
|------------------|--------------------------------------|-----------------------------------------------|
| `SELECT`         | `anon` + `authenticated`             | Immer erlaubt (öffentliche Anzeige)         |
| `INSERT`         | NUR `authenticated`                  | `auth.role() = 'authenticated'`               |
| `UPDATE`         | NUR `authenticated`                  | `auth.role() = 'authenticated'`               |
| `DELETE`         | NUR `authenticated`                  | `auth.role() = 'authenticated'`               |

> **Effekt:** Besucher (Anon) können nur lesen. Nur eingeloggter Admin kann schreiben/löschen.
> **Logout:** `supabase.auth.signOut()` + Admin-UI ausblenden + lokale Session prüfen per `getSession()`.
> **Fallback/Verstärkung (optional):** RLS `WITH CHECK` auf Storage wie in 3.2; im Admin-Modal keine echten Schreibversuche ohne validierte Session.

---

## 4. HTML-IDs & CSS-Klassen (Vertrag zwischen HTML / CSS / JS)

> **Verbindlich:** CSS-Agent und JS-Agent verwenden EXAKT diese Namen.

### 4.1 Container & Struktur (IDs)
| ID                 | Zweck                                                        |
|--------------------|--------------------------------------------------------------|
| `#wish-grid`       | Grid-Container für alle Wunschkarten (JS rendert hier)      |
| `#admin-toolbar`   | Admin-Kontrollleiste (nur im Admin-Modus sichtbar)          |
| `#login-btn`       | Button „Login“ / öffnet Login-Modal                          |
| `#login-modal`     | Modal: Passwortfeld für Admin-Login                          |
| `#admin-modal`     | Modal: Formular zum Hinzufügen/Bearbeiten eines Wunsches     |
| `#wish-form`       | `<form>` innerhalb des `#admin-modal`                        |
| `#logout-btn`      | Button „Logout“ (nur Admin-Modus)                            |

### 4.2 Filter-Leiste (IDs)
| ID                    | Zweck                                                       |
|-----------------------|-------------------------------------------------------------|
| `#filter-priority`    | `<select>` Filter nach Priorität (alle/1/2/3)              |
| `#filter-available`   | `<input type="checkbox">` „Nur noch frei“                  |
| `#sort-select`        | `<select>` Sortierung (priority/price_asc/price_desc)      |
| `#search-input`       | `<input type="search">` Volltextsuche                       |
| `#add-wish-btn`       | Button „+ Neuen Wunsch“ (nur Admin)                         |
| `#empty-state`        | Platzhalter, wenn keine Wünsche passen (Text/Icon)          |

### 4.3 Formular-Felder im `#admin-modal` → `#wish-form` (IDs)
| ID                 | Feldart              | Pflicht | Hinweis                                      |
|--------------------|----------------------|---------|----------------------------------------------|
| `#field-title`     | `<input text>`       | ja      | Titel                                        |
| `#field-description`| `<textarea>`         | nein    | Beschreibung                                 |
| `#field-price`     | `<input number>`     | ja      | `step="0.01" min="0"`                        |
| `#field-priority`  | `<select>`           | ja      | Options `1/2/3`                              |
| `#field-product-url`| `<input url>`        | nein    | Produkt-Link                                 |
| `#field-image`     | `<input file>`       | nein    | `accept="image/png,image/jpeg,image/webp"`   |
| `#field-image-preview`| `<img>` / `<div>`   | –       | Live-Vorschau vor Upload                     |
| `#field-is-reserved` | `<input checkbox>`  | nein    | Reserviert                                   |
| `#field-id`        | `<input hidden>`     | –       | Getauschte `id` (leer = neu, gefüllt = Edit) |

### 4.4 Modal-Kontroll-Buttons (IDs)
| ID                    | Zweck                                          |
|-----------------------|------------------------------------------------|
| `#login-submit`       | „Anmelden“ (Login-Modal)                       |
| `#login-close`        | Schließen (Login-Modal)                        |
| `#form-submit`        | „Speichern“ (Wunsch-Modal)                     |
| `#form-cancel`        | „Abbrechen“ (Wunsch-Modal)                     |
| `#delete-confirm`     | „Löschen“ (Bestätigung, in-card)               |
| `#delete-cancel`      | „Abbrechen“ (Bestätigung, in-card)             |

### 4.5 Kern-CSS-Klassen (für die Wunschkarten, JS rendert sie)
| Klasse              | Zweck                                          |
|---------------------|------------------------------------------------|
| `.wish-card`        | Karte (Glassmorphism, Hover-Lift)             |
| `.wish-card-image`  | Bildbereich / Platzhalter                     |
| `.wish-card-title`  | Titel                                          |
| `.wish-card-desc`   | Beschreibung (Klammern/Zeilenbeschränkung)    |
| `.wish-card-price`  | Preis                                          |
| `.wish-card-actions`| Button-Zeile                                   |
| `.product-link`     | Button/Link „Zum Produkt“                      |
| `.badge`            | Basis-Badge                                    |
| `.badge-priority-1` | Priorität Niedrig (z. B. Grau/Blau)           |
| `.badge-priority-2` | Priorität Mittel (z. B. Gelb/Orange)          |
| `.badge-priority-3` | Priorität Hoch (z. B. Rot/Rosa)               |
| `.badge-reserved`   | „Reserviert“-Badge                            |
| `.wish-card.is-reserved` | Card im reservierten Zustand (gedämpft)  |
| `.admin-actions`    | In-Karten Admin-Buttons (bearbeiten/löschen/toggle) |
| `.btn`, `.btn-primary`, `.btn-danger`, `.btn-ghost` | Button-System |
| `.modal`, `.modal-overlay`, `.modal-content` | Modal-System (Login + Admin) |
| `.filter-bar`, `.search-input` | Filter-/Suchleisten-Layout     |
| `.empty-state`      | Leere-Ansicht-Layout                           |

> **Responsive-Grid:** `.wish-grid` nutzt CSS Grid mit `repeat(auto-fill, minmax(240px, 1fr))`, Gap, Breakpoints bei ~640px/1024px.

---

## 5. Arbeitspakete für meine Agenten

### Paket 1 – SQL & Config (Agent: Datenbank + Config)
**Dateien:** `supabase_setup.sql`, `config.js`
- [ ] `wishes`-Tabelle gemäß 3.1 (inkl. `CHECK priority BETWEEN 1 AND 3`, Defaults, Index).
- [ ] Storage-Bucket `wish-images` (Public) + Storage-RLS (read: alle; write/delete: authenticated).
- [ ] RLS-Policies auf `wishes` gemäß 3.3 (anon read-only; authenticated CRUD) + `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
- [ ] Hinweise im SQL-Kommentar: „Admin-Auth-User im Dashboard anlegen“.
- [ ] `config.js`: Platzhalter-Objekt `CONFIG` mit `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ADMIN_EMAIL`, plus kurze Kommentare. **Keine echten Keys committen.**
- **Ergebnis:** Läuft in Supabase; Policies verhindert Schreibzugriff ohne Session.

### Paket 2 – HTML (Agent: Design/HTML)
**Dateien:** `index.html`
- [ ] Semantische Grundstruktur: Header, Filter-Leiste, `#wish-grid`, `#empty-state`.
- [ ] Login-Modal (`#login-modal`) + Admin-Modal (`#admin-modal` mit `#wish-form`) gemäß IDs aus 4.1–4.4.
- [ ] Admin-Toolbar + Logout (`#admin-toolbar`, `#logout-btn`, `#add-wish-btn`) – initial `hidden`.
- [ ] Script-Lade-Reihenfolge: `config.js` → Supabase CDN → `app.js` (2.).
- [ ] **Keine Logik, keine Inline-Styles** (nur Struktur + `id`/`class`-Vertrag).
- **Ergebnis:** Vollständige, validierte DOM-Struktur mit exakten Namen aus Abschnitt 4.

### Paket 3 – CSS (Agent: Design)
**Dateien:** `style.css`
- [ ] Dark-Mode-Designsystem: Farbtokens (CSS Vars) – Hintergrund, Text, Akzent, Badges.
- [ ] Glassmorphism-Karten (`.wish-card`) + Hover-Effekt; Grid `.wish-grid` (responsive, `minmax(240px,1fr)`).
- [ ] Prioritäts-Badges `.badge-priority-1/2/3` + `.badge-reserved` + `.wish-card.is-reserved` (gedämpft).
- [ ] Button-System `.btn/-primary/-danger/-ghost`, `.product-link`.
- [ ] Modal-System `.modal/.modal-overlay/.modal-content` (Login + Admin), Filter-/Suchleisten-Layout.
- [ ] `.empty-state`, Formular-Styles für alle Felder aus 4.3, Fokus-/Validierungs-Zustände.
- [ ] Vollständig responsive (Mobile-first), keine Abhängigkeit von JS-Klassen außerhalb des Verbands (4.5).
- **Ergebnis:** Polierter, moderner Dark-Mode-Look, funktioniert mit leerem Grid UND mit gerenderten Karten.

### Paket 4 – JavaScript (Agent: JS-Logik)
**Dateien:** `app.js`
- [ ] Supabase-Client-Init aus `CONFIG`.
- [ ] **Login/Logout:** `signInWithPassword` (E-Mail aus Config), `getSession()`, Admin-UI ein/ausblenden, Session-Persistenz prüfen.
- [ ] **Laden:** `select * from wishes`, in `#wish-grid` als `.wish-card` rendern (alle Klassen aus 4.5), reservierte korrekt markieren.
- [ ] **Filtern/Sortieren/Suchen:** Client-side gemäß `#filter-priority`, `#filter-available`, `#sort-select`, `#search-input`; `#empty-state` bei 0 Treffern.
- [ ] **CRUD (nur wenn Session):** `#wish-form` erfassen → INSERT/UPDATE; DELETE mit Bestätigung (`#delete-confirm`); `is_reserved` Toggle.
- [ ] **Bild-Upload:** Typ+Größe prüfen → `wish-images/{uuid}/{file}` → öffentliche URL in `image_url`; Live-Vorschau in `#field-image-preview`.
- [ ] **Sicherheitsguards:** Alle Schreib-Handler prüfen `session`, sonst ignorieren/Toast; `#add-wish-btn` öffnet Modal im „Neu“-Zustand (`#field-id` leer), Karten-Bearbeiten füllt `#field-id`.
- [ ] **Robustheit:** Loading-/Error-Zustände, `try/catch` bei Supabase-Calls, keine `alert()` (kleine Toast-/inline-Nachrichten).
- **Ergebnis:** Vollständig funktionierendes CRUD + Filter + Login + Upload, rein client-seitig, ohne Build-Step.

---

### Akzeptanzkriterien (gemeinsam)
1. Öffnet `index.html` lokal/mit Supabase-Config: Grid lädt, Filter+Suche funktionieren.
2. Ohne Login: keinerlei Schreibzugriff möglich (UI ausgeblendet + RLS blockiert).
3. Mit Admin-Login: hinzufügen/bearbeiten/löschen/reservieren + Bild-Upload funktionieren.
4. Design: Konsistenter Dark-Mode, responsive, Badges & Glassmorphism sichtbar.
5. Keine Abweichung von DB-Namen, IDs, Klassen in Abschnitt 3 & 4.
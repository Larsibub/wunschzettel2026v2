// ============================================================
//  config.js – Platzhalter-Objekt CONFIG   (Paket 1)
//  Lade-Reihenfolge in index.html: Diese Datei MUSS vor app.js
//  geladen werden, da app.js das globale CONFIG-Objekt nutzt.
//
//  ⚠️  WICHTIG: Keine echten Keys committen!
//  Ersetze die Werte lokal. Für die Versionskontrolle besser:
//  eine lokale config.local.js / .env nutzen und diese Datei
//  in die .gitignore eintragen.
// ============================================================

window.CONFIG = {
  // Supabase-Projekt-URL, z. B. "https://abcxyzcompany.supabase.co"
  SUPABASE_URL: "https://dwhathosyuioqbcbzamw.supabase.co",

  // Supabase-Anon/Public-Key (sicher, darf im Frontend landen)
  SUPABASE_ANON_KEY: "sb_publishable_6l7T3_rZ_KdHKliEQfGtJg_pyIIin19",

  // E-Mail des Admin-Auth-Users, den du im Supabase-Dashboard
  // unter "Auth → Users" angelegt hast
  ADMIN_EMAIL: "kleinlarsibub@gmail.com",
};
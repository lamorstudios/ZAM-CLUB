# ZAM Club — Supabase Setup

Vollständige Schritt-für-Schritt-Anleitung für das Supabase-Backend.

---

## Schritt 1: Supabase-Projekt anlegen

1. Gehe zu [app.supabase.com](https://app.supabase.com) und melde dich an
2. Klicke auf **„New project"**
3. Fülle aus:
   - **Name:** `zam-club`
   - **Database Password:** Sicheres Passwort notieren (wird nur für direkte DB-Zugriffe benötigt)
   - **Region:** `eu-central-1` (Frankfurt — nächste Region zu München)
4. Klicke auf **„Create new project"** — dauert ca. 1–2 Minuten

---

## Schritt 2: Datenbank-Schema einrichten

Das Schema muss in dieser Reihenfolge ausgeführt werden:

### 2a. schema.sql — Tabellen, Trigger, Indizes

1. Im Supabase Dashboard: linke Seitenleiste → **„SQL Editor"**
2. Klicke auf **„New query"**
3. Öffne die Datei `supabase/schema.sql` auf deinem Computer
4. Kopiere den gesamten Inhalt und füge ihn in den SQL Editor ein
5. Klicke auf **„Run"** (oder `Cmd+Enter` / `Ctrl+Enter`)
6. Warte auf „Success. No rows returned"

### 2b. rls.sql — Row Level Security Policies

1. Klicke erneut auf **„New query"**
2. Öffne `supabase/rls.sql`, Inhalt kopieren → einfügen → **„Run"**

### 2c. roles.sql — Rollensystem und Punkte-Konfiguration

1. Klicke erneut auf **„New query"**
2. Öffne `supabase/roles.sql`, Inhalt kopieren → einfügen → **„Run"**

### 2d. seed.sql — Demo-Daten (optional, empfohlen für Tests)

1. Klicke erneut auf **„New query"**
2. Öffne `supabase/seed.sql`, Inhalt kopieren → einfügen → **„Run"**
3. Lädt Händler, Events, Deals, Badges und Glücksrad-Konfiguration

---

## Schritt 3: Environment Variables ermitteln

1. Im Supabase Dashboard: linke Seitenleiste → **„Project Settings"** (Zahnrad-Icon)
2. Dann → **„API"**
3. Du siehst:

| Variable | Wo du sie findest |
|---|---|
| `SUPABASE_URL` | „Project URL" — sieht so aus: `https://xyzxyzxyz.supabase.co` |
| `SUPABASE_ANON_KEY` | „Project API keys" → „anon public" (langer JWT-Token) |

> **Sicherheit:** Der `anon key` ist für den Browser gedacht und ist öffentlich. Er ist durch RLS-Policies abgesichert. Gib den `service_role key` niemals in Frontend-Code ein.

---

## Schritt 4: api.js konfigurieren

Öffne `api.js` und suche diese drei Zeilen ganz oben:

```js
// import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'
// const SUPABASE_URL     = 'https://DEIN-PROJEKT.supabase.co'
// const SUPABASE_ANON_KEY = 'eyJ...'
// const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
```

**Kommentarzeichen entfernen und Werte eintragen:**

```js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'
const SUPABASE_URL      = 'https://DEIN-PROJEKT.supabase.co'   // ← deine URL
const SUPABASE_ANON_KEY = 'eyJhbGciOi...'                      // ← dein anon key
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
```

Damit `import` funktioniert, muss das Script-Tag in `index.html` den Typ `module` haben:

```html
<script type="module" src="api.js"></script>
```

---

## Schritt 5: Supabase-Aufrufe in api.js aktivieren

Jede Methode in `api.js` enthält einen Kommentar mit dem Supabase-Aufruf.

**Beispiel: Posts laden**

```js
// Vorher (Demo / localStorage):
async list() {
  return ZAMData.communityPosts;
}

// Nachher (Supabase):
async list() {
  const { data, error } = await supabase
    .from('posts')
    .select('*, profiles(display_name, initials, avatar_url)')
    .eq('status', 'approved')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}
```

**Beispiel: Einloggen**

```js
// Vorher (Demo):
async signIn(email, password) { /* localStorage */ }

// Nachher (Supabase):
async signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}
```

---

## Schritt 6: Storage Buckets für Bilder anlegen

1. Im Supabase Dashboard: linke Seitenleiste → **„Storage"**
2. Klicke auf **„New bucket"** und erstelle zwei Buckets:

| Bucket Name | Public | Verwendung |
|---|---|---|
| `avatars` | ✅ Public | Profilbilder der Nutzer |
| `post-images` | ✅ Public | Bilder in Community-Posts |

3. Für jeden Bucket: Klicke auf **„Policies"** und füge hinzu:
   - `SELECT` für alle (öffentlich lesbar)
   - `INSERT` für eingeloggte Nutzer auf eigene Ordner

---

## Schritt 7: Authentifizierung konfigurieren

1. Im Supabase Dashboard: **„Authentication"** → **„Settings"**
2. **Site URL** eintragen: z.B. `https://deine-domain.de` (für Passwort-Reset-Links)
3. **„Email"** aktivieren (Standard — ist bereits aktiv)
4. Optional: **„Email confirmation"** deaktivieren für einfacheres Onboarding während der Beta

---

## Schritt 8: Ersten Admin-Nutzer anlegen

1. Über die App registrieren (Normal-Registrierung)
2. Im Supabase Dashboard → **SQL Editor** → Dieses Statement ausführen (E-Mail anpassen):

```sql
update public.profiles
  set role = 'admin'
  where id = (
    select id from auth.users where email = 'deine@email.de'
  );
```

3. Ab jetzt kann dieser Nutzer in der App (admin.html) Inhalte freigeben

---

## Schritt 9: Händler-Nutzer einrichten

1. Händler registriert sich über die App normal
2. Admin setzt Rolle im SQL Editor:

```sql
-- Rolle auf merchant setzen
update public.profiles
  set role = 'merchant'
  where id = (select id from auth.users where email = 'haendler@example.de');

-- Händler dem Merchant-Datensatz zuordnen
-- (Merchant-ID aus der merchants Tabelle kopieren)
insert into public.merchant_staff (merchant_id, user_id, role)
values (
  'a1000000-0000-0000-0000-000000000001',  -- Café Freiham ID aus seed.sql
  (select id from auth.users where email = 'haendler@example.de'),
  'owner'
);
```

---

## Tabellen-Übersicht

| Tabelle | Zweck | Zeilen nach Seed |
|---|---|---|
| `profiles` | Nutzerprofile (1:1 mit auth.users) | 0 (per Trigger) |
| `merchants` | Händler und Shops | 6 |
| `merchant_staff` | Händler-Zugriffsrechte | 0 |
| `posts` | Community-Beiträge | 0 |
| `post_likes` | Likes auf Posts | 0 |
| `comments` | Kommentare zu Posts | 0 |
| `events` | Veranstaltungen | 5 |
| `event_participants` | Event-Anmeldungen | 0 |
| `saved_events` | Gemerkte Events | 0 |
| `deals` | Angebote & Rabatte | 6 |
| `saved_deals` | Gemerkte Deals | 0 |
| `deal_redemptions` | Eingelöste Deals | 0 |
| `points_transactions` | Punkte-Transaktionen | 0 |
| `points_config` | Punkte-Regelwerk (Doku) | 8 |
| `badges` | Badge-Definitionen | 10 |
| `user_badges` | Verdiente Badges | 0 |
| `checkins` | QR Check-in Protokoll | 0 |
| `spin_rewards` | Glücksrad-Konfiguration | 6 |
| `notifications` | In-App Benachrichtigungen | 0 |

---

## Häufige Fehler

**„permission denied for table profiles"**
→ RLS ist aktiv und der Nutzer ist nicht eingeloggt. Im Frontend: sicherstellen dass `supabase.auth.getSession()` ein gültiges Token zurückgibt.

**„duplicate key value violates unique constraint"**
→ seed.sql wurde zweimal ausgeführt. Entweder zuerst `schema.sql` erneut ausführen (drop + recreate) oder den seed-Block überspringen.

**„new row violates row-level security policy"**
→ Der aktuelle Nutzer hat keine Berechtigung für diese Aktion. Prüfe mit `select public.fn_my_role()` welche Rolle zugewiesen ist.

**Trigger `fn_handle_new_user` schlägt fehl**
→ Passiert wenn ein Nutzer sich registriert aber der Username schon vergeben ist. Der Trigger generiert automatisch einen Suffix — prüfe die Supabase Logs unter „Logs" → „Database".

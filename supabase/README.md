# ZAM Club — Supabase Setup

## 1. Supabase Projekt anlegen

1. [app.supabase.com](https://app.supabase.com) → New project
2. Region: **eu-central-1** (Frankfurt)
3. Passwort notieren

## 2. Schema ausführen

SQL Editor → `schema.sql` einfügen → Run

## 3. Seed-Daten einspielen

SQL Editor → `seed.sql` einfügen → Run

## 4. Umgebungsvariablen setzen

In `api.js` die drei Zeilen einkommentieren und befüllen:

```js
const SUPABASE_URL  = 'https://DEIN-PROJEKT.supabase.co'
const SUPABASE_ANON_KEY = 'eyJ...'
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
```

## 5. Supabase-Aufrufe aktivieren

Jede Methode in `api.js` hat einen Kommentar mit dem entsprechenden Supabase-Aufruf.
Ersetze den localStorage-Block durch den auskommentierten Supabase-Block.

Beispiel in `posts.list()`:
```js
// Demo (localStorage):
return ZAMData.communityPosts;

// Supabase (einkommentieren):
// const { data } = await supabase
//   .from('posts')
//   .select('*, profiles(*)')
//   .eq('status', 'approved')
//   .order('created_at', { ascending: false })
// return data
```

## 6. Storage Bucket für Bilder

Storage → New bucket → Name: `avatars` (public)
Storage → New bucket → Name: `post-images` (public)

## Tabellen-Übersicht

| Tabelle | Zweck |
|---|---|
| `profiles` | Nutzerprofile (1:1 mit auth.users) |
| `merchants` | Händler im ZAM |
| `merchant_staff` | Händler-Zugriffsrechte |
| `posts` | Community-Beiträge |
| `post_likes` | Likes auf Posts |
| `comments` | Kommentare zu Posts |
| `events` | Veranstaltungen |
| `event_registrations` | Event-Anmeldungen |
| `saved_events` | Gemerkte Events |
| `deals` | Angebote & Rabatte |
| `saved_deals` | Gemerkte Deals |
| `deal_redemptions` | Eingelöste Deals |
| `points_log` | Punkte-Transaktionen |
| `badges` | Badge-Definitionen |
| `user_badges` | Verdiente Badges |
| `checkins` | QR Check-in Protokoll |
| `spin_rewards` | Glücksrad-Konfiguration |
| `notifications` | In-App Benachrichtigungen |

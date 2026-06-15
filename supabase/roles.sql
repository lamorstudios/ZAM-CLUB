-- ============================================================
-- ZAM Club — Rollen-System
-- Version: 2.0
--
-- Ausführen: nach schema.sql und rls.sql
--
-- Rollen werden als Spalte in public.profiles gespeichert
-- (kein PostgreSQL-Role, sondern Application-Level Role).
-- Das hat den Vorteil, dass RLS-Policies direkt darauf zugreifen
-- können ohne Supabase-Superuser-Rechte.
-- ============================================================

-- ── Überblick der Rollen ──────────────────────────────────────
--
-- ROLE: user (Standard für alle neuen Nutzer)
--   - Kann: Eigenes Profil bearbeiten
--   - Kann: Posts erstellen (pending → warten auf Freigabe)
--   - Kann: Events/Deals speichern, an Events teilnehmen
--   - Kann: Kommentare schreiben, Posts liken
--   - Kann: Eigene Posts/Kommentare löschen
--   - Kann NICHT: Posts/Deals/Events direkt freigeben
--   - Kann NICHT: Fremde Inhalte bearbeiten oder löschen
--
-- ROLE: merchant (zugewiesen von Admin)
--   + Alles was "user" kann
--   + Kann: Deals für eigene Merchants erstellen (pending)
--   + Kann: Events für eigene Merchants erstellen (pending)
--   + Kann: Eigene Deals/Events bearbeiten
--   + Kann NICHT: Deals/Events selbst freigeben
--   + Kann NICHT: Fremde Merchants verwalten
--
-- ROLE: admin (nur manuell in DB setzen)
--   + Alles was "merchant" kann
--   + Kann: Posts/Deals/Events freigeben oder ablehnen
--   + Kann: Alle Profile bearbeiten
--   + Kann: Händler anlegen, Merchant-Staff zuweisen
--   + Kann: Alle Inhalte löschen
--   + Kann: Punkte manuell vergeben/abziehen
--
-- ── Levelsystem (automatisch, aus points_transactions) ────────
--
-- Bronze:   0 – 499 Punkte      (Standard für neue Nutzer)
-- Silver:  500 – 1.499 Punkte
-- Gold:  1.500 – 2.999 Punkte
-- Platinum: 3.000+ Punkte
--
-- Level wird automatisch nach jeder Punkte-Transaktion
-- vom Trigger fn_sync_points() in profiles.level aktualisiert.

-- ── Admin-Nutzer setzen ───────────────────────────────────────
-- Ersetze die E-Mail-Adresse mit der des ersten Admin-Nutzers.
-- Führe diesen Block NACH der ersten Registrierung aus.

-- Beispiel (nach Anpassung auskommentieren und ausführen):
/*
update public.profiles
  set role = 'admin'
  where id = (
    select id from auth.users where email = 'admin@zamclub.de'
  );
*/

-- ── Händler-Rolle zuweisen ────────────────────────────────────
-- 1. Nutzer muss sich zuerst registrieren
-- 2. Dann role auf 'merchant' setzen:
/*
update public.profiles
  set role = 'merchant'
  where id = (
    select id from auth.users where email = 'haendler@example.de'
  );
*/

-- 3. Händler dem Merchant-Datensatz zuordnen:
/*
insert into public.merchant_staff (merchant_id, user_id, role)
values (
  'MERCHANT_UUID_HIER',
  (select id from auth.users where email = 'haendler@example.de'),
  'owner'
);
*/

-- ── Punkte-Regeln (Referenz) ──────────────────────────────────
-- Diese Werte werden in api.js / Server-Functions verwendet.
-- Hier als Dokumentation:

create table if not exists public.points_config (
  action       public.points_action primary key,
  points       int  not null,
  cooldown     text,            -- z.B. 'daily', 'once', 'unlimited'
  description  text
);

insert into public.points_config (action, points, cooldown, description) values
  ('welcome_bonus', 50,   'once',      'Einmalig bei Registrierung'),
  ('daily_spin',    25,   'daily',     'Tägliche Drehung am Glücksrad (variabler Bonus)'),
  ('qr_checkin',    25,   'daily',     'QR-Code Check-in, einmal täglich'),
  ('event_attend',  0,    'unlimited', 'Variabel — aus events.points_reward'),
  ('deal_redeem',   0,    'unlimited', 'Variabel — aus deals.points_reward'),
  ('post_approved', 10,   'unlimited', 'Post wurde vom Admin freigegeben'),
  ('referral',      100,  'unlimited', 'Für jeden geworbenen Neukunden'),
  ('admin_adjust',  0,    'unlimited', 'Manuelle Admin-Anpassung (positiv oder negativ)')
on conflict (action) do nothing;

comment on table public.points_config is 'Dokumentation der Punkte-Regeln — kein Hard-Enforcement, dient als Referenz';

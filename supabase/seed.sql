-- ============================================================
-- ZAM Club — Demo-Seed-Daten
-- Version: 2.0
--
-- WICHTIG: Erst schema.sql + rls.sql + roles.sql ausführen.
-- Diese Datei legt Händler, Events, Deals, Badges und
-- Glücksrad-Konfiguration an.
-- Nutzer werden über Auth + Trigger automatisch angelegt.
-- ============================================================

-- ── Glücksrad-Konfiguration ───────────────────────────────────
-- Summe der Wahrscheinlichkeiten muss exakt 1.0 ergeben
insert into public.spin_rewards (label, points, probability, is_active) values
  ('10 Punkte',       10,  0.3000, true),
  ('25 Punkte',       25,  0.2800, true),
  ('50 Punkte',       50,  0.2200, true),
  ('100 Punkte',      100, 0.1200, true),
  ('250 Punkte',      250, 0.0600, true),
  ('🎉 Jackpot 500', 500, 0.0200, true);

-- ── Händler ───────────────────────────────────────────────────
insert into public.merchants
  (id, name, icon, category, category_color, location, floor, hours, phone,
   description, current_promo, promo_color, is_open, rating, review_count, tags)
values
  (
    'a1000000-0000-0000-0000-000000000001',
    'Café Freiham', '☕', 'Café & Bäckerei', '#f59e0b',
    'EG, Eingang West', 'EG',
    'Mo–Sa 07:30–20:00, So 09:00–18:00',
    '+49 89 4521-0110',
    'Das gemütliche Herzstück des ZAM. Frische Backwaren aus der Region, handgefertigte Kaffeespezialitäten und ein großer Außensitzbereich.',
    '2. Heißgetränk für 1 €', '#f59e0b',
    true, 4.9, 318,
    array['Frühstück', 'Bio-Kaffee', 'Kuchen', 'Terrasse']
  ),
  (
    'a1000000-0000-0000-0000-000000000002',
    'Odeya Fashion', '👗', 'Mode & Accessoires', '#ec4899',
    'OG 1, Shop 14', 'OG 1',
    'Mo–Sa 10:00–20:00',
    '+49 89 4521-0214',
    'Kuratierte Mode aus nachhaltiger Produktion – von lässig bis elegant. Exklusive Designlabels aus Deutschland und Europa.',
    '20% auf Nachhaltigkeits-Labels', '#ec4899',
    true, 4.6, 204,
    array['Damen', 'Herren', 'Nachhaltig', 'Lokal']
  ),
  (
    'a1000000-0000-0000-0000-000000000003',
    'Levante Kitchen', '🥙', 'Restaurant', '#ef4444',
    'Food Court, OG 2', 'OG 2',
    'Mo–So 11:00–21:30',
    '+49 89 4521-0321',
    'Mediterran-levantinische Küche mit frischen Zutaten. Hummus, Falafel, Shakshuka und hausgemachtes Pita – ein Stück Tel Aviv in Freiham.',
    'Business Lunch: Tagesgericht + Getränk 10,90 €', '#ef4444',
    true, 4.8, 441,
    array['Vegetarisch', 'Vegan', 'Halal', 'Mittagstisch']
  ),
  (
    'a1000000-0000-0000-0000-000000000004',
    'Westside Gym', '💪', 'Sport & Wellness', '#10b981',
    'OG 3, gesamte Etage', 'OG 3',
    'Mo–Fr 06:00–23:00, Sa–So 08:00–21:00',
    '+49 89 4521-0430',
    'Münchens modernster Fitness-Hub. 200+ Geräte, 30+ Kursformate pro Woche, Rooftop-Sauna mit Blick über Freiham.',
    'Probetraining: 7 Tage kostenlos', '#10b981',
    true, 4.7, 582,
    array['Gym', 'Yoga', 'Sauna', 'Personal Training', 'Rooftop']
  ),
  (
    'a1000000-0000-0000-0000-000000000005',
    'Welt der Bücher', '📚', 'Bücher & Kreatives', '#3b82f6',
    'OG 1, Shop 08', 'OG 1',
    'Mo–Sa 09:30–20:00',
    '+49 89 4521-0108',
    'Über 35.000 Titel, Kinderbuch-Paradies, Schreibwaren und gemütliche Leselounge. Jeden Samstag: Autorenlesung für Kinder.',
    '10% auf alle Neuerscheinungen', '#3b82f6',
    true, 4.5, 173,
    array['Romane', 'Sachbücher', 'Kinder', 'Lesung', 'Schreibwaren']
  ),
  (
    'a1000000-0000-0000-0000-000000000006',
    'Freiham Apotheke', '💊', 'Gesundheit & Beauty', '#06b6d4',
    'EG, Shop 03', 'EG',
    'Mo–Sa 08:00–20:00',
    '+49 89 4521-0103',
    'Gesundheitsapotheke mit Naturkosmetik-Sortiment und kostenlosem Blutdruck-Check jeden Mittwoch.',
    'Sonnenschutz-Set 3 für 2', '#06b6d4',
    true, 4.8, 267,
    array['Medikamente', 'Naturkosmetik', 'Beratung']
  );

-- ── Events (status = approved für Demo) ───────────────────────
insert into public.events
  (id, merchant_id, title, category, category_color,
   date_iso, time_start, time_end, location, description,
   spots_total, spots_left, points_reward, is_featured, status)
values
  (
    'b1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000004',
    'Morgen-Yoga im Atrium',
    'Sport & Wellness', '#10b981',
    '2026-06-18', '08:00', '09:00',
    'Atrium, Erdgeschoss',
    'Eine Stunde Yoga für alle Levels direkt unter dem Glasdach. Keine Vorkenntnisse nötig, Leihmatten vorhanden.',
    40, 8, 60, true, 'approved'
  ),
  (
    'b1000000-0000-0000-0000-000000000002',
    null,
    'Freiham Sommer-Markt',
    'Food & Lifestyle', '#f59e0b',
    '2026-06-21', '10:00', '19:00',
    'Vorplatz ZAM, Außenbereich',
    'Regionale Erzeuger, Münchner Foodtrucks und Live-Musik. Über 40 Aussteller, Kinderbereich mit Hüpfburg. Eintritt frei!',
    null, null, 80, true, 'approved'
  ),
  (
    'b1000000-0000-0000-0000-000000000003',
    null,
    'Kids Kreativ-Werkstatt',
    'Familie', '#ec4899',
    '2026-06-25', '14:30', '16:30',
    'Kinderbereich, OG 1',
    'Basteln, malen, stempeln für Kinder von 4–10 Jahren. Thema: „Unser Freiham". Alle Materialien inklusive.',
    18, 4, 35, false, 'approved'
  ),
  (
    'b1000000-0000-0000-0000-000000000004',
    null,
    'Live-Konzert: Sommernacht-Beats',
    'Kultur & Musik', '#7c3aed',
    '2026-06-28', '17:00', '20:00',
    'Hauptbühne, EG',
    'Soul, Jazz und Singer-Songwriter aus München – drei Acts live. Eintritt frei!',
    300, 182, 45, false, 'approved'
  ),
  (
    'b1000000-0000-0000-0000-000000000005',
    null,
    'Nachhaltigkeits-Workshop',
    'Community', '#06b6d4',
    '2026-07-03', '18:00', '19:30',
    'Eventfläche, OG 2',
    'Repair Café, Zero-Waste-Tipps und offene Runde. Kostenlos, ohne Anmeldung.',
    60, 31, 50, false, 'approved'
  );

-- ── Deals (status = approved für Demo) ────────────────────────
insert into public.deals
  (id, merchant_id, title, description, category, category_color,
   discount, expiry_date, points_reward, is_hot, barcode, status)
values
  (
    'c1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    '2. Heißgetränk nur 1 Euro',
    'Kauf ein Heißgetränk und bezahl für das zweite nur 1 €. Gilt auf alle Kaffee- und Tee-Spezialitäten.',
    'Food & Drinks', '#f59e0b',
    '2. für 1 €', '2026-06-30', 20, true, '7821-4430-1190', 'approved'
  ),
  (
    'c1000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000002',
    '20% auf nachhaltige Labels',
    'Exklusiv für ZAM-Club: 20% auf ARMEDANGELS, Recolution und Rewoolution.',
    'Mode', '#ec4899',
    '20%', '2026-07-20', 30, false, '2210-9931-4482', 'approved'
  ),
  (
    'c1000000-0000-0000-0000-000000000003',
    'a1000000-0000-0000-0000-000000000003',
    'Gratis Hummus zu jedem Hauptgericht',
    'Zu jedem Hauptgericht eine Portion Hummus mit Pita gratis. Mo–Fr, 11–15 Uhr.',
    'Restaurant', '#ef4444',
    'Gratis', '2026-06-29', 25, true, '3308-7742-6610', 'approved'
  ),
  (
    'c1000000-0000-0000-0000-000000000004',
    'a1000000-0000-0000-0000-000000000004',
    '7 Tage kostenlos trainieren',
    'Teste den Westside Gym eine ganze Woche lang gratis – alle Geräte, alle Kurse, Sauna inklusive.',
    'Sport & Wellness', '#10b981',
    '7 Tage', '2026-07-31', 100, true, '9901-2255-8843', 'approved'
  ),
  (
    'c1000000-0000-0000-0000-000000000005',
    'a1000000-0000-0000-0000-000000000005',
    '10% auf alle Neuerscheinungen',
    'Alle Neuerscheinungen des Monats mit 10% Mitgliederrabatt, inklusive vorbestellter Titel.',
    'Bücher & Kultur', '#3b82f6',
    '10%', '2026-06-30', 15, false, '5512-3390-7721', 'approved'
  ),
  (
    'c1000000-0000-0000-0000-000000000006',
    'a1000000-0000-0000-0000-000000000006',
    'Sonnenschutz-Set: 3 für 2',
    'Kaufe 3 Sonnenschutz-Produkte und bezahle nur 2. Günstigstes Produkt gratis.',
    'Gesundheit & Beauty', '#06b6d4',
    '3 für 2', '2026-07-15', 20, false, '6643-8821-0057', 'approved'
  );

-- ── Badges ────────────────────────────────────────────────────
insert into public.badges (name, icon, description, color, trigger_type, trigger_value) values
  ('Erster Besuch',      '🏆', 'Herzlich willkommen im ZAM Freiham!',              '#f59e0b', 'visits',   1),
  ('Stammgast',          '⭐', '10 Besuche im ZAM',                                '#7c3aed', 'visits',  10),
  ('Deal Hunter',        '🎯', '10 Deals erfolgreich eingelöst',                   '#10b981', 'deals',   10),
  ('Community Star',     '💬', '5 Beiträge in der Community geteilt',              '#3b82f6', 'posts',    5),
  ('Freiham Urgestein',  '🏘️', '365 Tage treues ZAM-Club-Mitglied',               '#ef4444', 'days',   365),
  ('Spin Master',        '🎰', '7 Tage in Folge am Glücksrad gedreht',             '#a855f7', 'streak',   7),
  ('Event-Enthusiast',   '🎟️', 'An 5 ZAM-Events teilgenommen',                    '#f59e0b', 'events',   5),
  ('Platin-Star',        '💎', '3.000 Punkte gesammelt',                           '#c084fc', 'points', 3000),
  ('Foodie',             '🍕', '5 Food & Drinks Deals eingelöst',                  '#f97316', 'deals',    5),
  ('Check-in König',     '📍', '20× im ZAM eingecheckt',                           '#06b6d4', 'checkins',20);

-- ── Beispielnutzer (für lokale Tests) ─────────────────────────
-- Hinweis: Echte Nutzer werden über Supabase Auth angelegt.
-- Diese Nutzer sind nur für SQL-Tests gedacht (kein auth.users Eintrag).
-- In Produktion: Nutzer registrieren sich über die App.

-- Beispiel-Profil für Demo (nur ausführen wenn ein auth.users Eintrag existiert):
/*
insert into public.profiles (id, username, display_name, initials, role, level, points, member_since)
values (
  'f1000000-0000-0000-0000-000000000001',  -- muss auth.users.id entsprechen
  'juliamaier',
  'Julia Maier',
  'JM',
  'user',
  'gold',
  1840,
  '2024-03-10'
);

insert into public.profiles (id, username, display_name, initials, role, level, points, member_since)
values (
  'f1000000-0000-0000-0000-000000000002',
  'zamadmin',
  'ZAM Admin',
  'ZA',
  'admin',
  'platinum',
  9999,
  '2024-01-01'
);

-- Händler-Staff zuordnen
insert into public.merchant_staff (merchant_id, user_id, role)
values ('a1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000002', 'owner');
*/

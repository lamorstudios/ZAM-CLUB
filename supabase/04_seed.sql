-- ============================================================
-- ZAM CLUB — Seed Data
-- File: 04_seed.sql
-- Run after: 01_schema.sql, 02_rls.sql, 03_functions.sql
-- ============================================================

-- ============================================================
-- DEFAULT CHAT ROOMS
-- ============================================================
INSERT INTO public.chat_rooms (id, type, name, created_at)
VALUES
  ('room_allgemein', 'global', 'Allgemein',         now()),
  ('room_food',      'global', 'Essen & Gastro',    now()),
  ('room_events',    'global', 'Events',            now()),
  ('room_deals',     'global', 'Deals & Aktionen',  now())
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- DEMO CHALLENGES
-- ============================================================
INSERT INTO public.challenges (
  id,
  title,
  description,
  icon,
  type,
  target_value,
  points_reward,
  valid_from,
  valid_until,
  is_active,
  created_at
)
VALUES
  (
    uuid_generate_v4(),
    'Deal-Jäger',
    'Löse 5 verschiedene Deals ein und werde zum echten Schnäppchenjäger im ZAM.',
    'ticket-percent',
    'deal_redemptions',
    5,
    150,
    now(),
    now() + interval '90 days',
    true,
    now()
  ),
  (
    uuid_generate_v4(),
    'Community-Starter',
    'Erstelle deinen ersten Community-Post und stelle dich der ZAM-Community vor.',
    'pencil-square',
    'posts_created',
    1,
    50,
    now(),
    now() + interval '365 days',
    true,
    now()
  ),
  (
    uuid_generate_v4(),
    'Treuer Stammgast',
    'Checke an 7 verschiedenen Tagen im ZAM ein und beweise deine Treue.',
    'map-pin',
    'checkin_days',
    7,
    200,
    now(),
    now() + interval '60 days',
    true,
    now()
  ),
  (
    uuid_generate_v4(),
    'Silber-Aufsteiger',
    'Sammle insgesamt 500 Punkte und erreiche den Silver-Status im ZAM Club.',
    'star',
    'total_points',
    500,
    100,
    now(),
    NULL,
    true,
    now()
  ),
  (
    uuid_generate_v4(),
    'Event-Enthusiast',
    'Nimm an 3 verschiedenen Events im ZAM teil und erlebe das volle Programm.',
    'calendar-days',
    'events_attended',
    3,
    175,
    now(),
    now() + interval '120 days',
    true,
    now()
  )
ON CONFLICT DO NOTHING;

-- ============================================================
-- NOTE: Demo user accounts
-- Demo user accounts are created via Supabase Auth signup flow,
-- not seeded here. Use the Supabase dashboard or the app's
-- registration screen to create test users.
-- ============================================================

-- ============================================================
-- NOTE: Merchant data
-- Merchant data is seeded from data.js on first app load.
-- The app's initialization routine reads merchant definitions
-- from data.js and inserts them via the Supabase client.
-- ============================================================

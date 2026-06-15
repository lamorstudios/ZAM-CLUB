-- ============================================================
-- ZAM Club — Supabase Schema
-- Version: 2.0
-- Reihenfolge: Extensions → Typen → Tabellen → Indizes → Trigger
--
-- Ausführen: Supabase Dashboard → SQL Editor → Datei einfügen → Run
-- ============================================================

-- ── 0. Erweiterungen ─────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ── 1. Aufräumen (bei erneutem Ausführen) ────────────────────
-- Reihenfolge umgekehrt zu Foreign Keys
drop table if exists public.notifications         cascade;
drop table if exists public.checkins              cascade;
drop table if exists public.spin_rewards          cascade;
drop table if exists public.user_badges           cascade;
drop table if exists public.badges                cascade;
drop table if exists public.points_transactions   cascade;
drop table if exists public.deal_redemptions      cascade;
drop table if exists public.saved_deals           cascade;
drop table if exists public.saved_events          cascade;
drop table if exists public.event_participants    cascade;
drop table if exists public.comments              cascade;
drop table if exists public.post_likes            cascade;
drop table if exists public.posts                 cascade;
drop table if exists public.deals                 cascade;
drop table if exists public.events                cascade;
drop table if exists public.merchant_staff        cascade;
drop table if exists public.merchants             cascade;
drop table if exists public.profiles              cascade;

drop type if exists public.user_role    cascade;
drop type if exists public.user_level   cascade;
drop type if exists public.item_status  cascade;
drop type if exists public.points_action cascade;
drop type if exists public.notif_type   cascade;

-- ── 2. Enums ─────────────────────────────────────────────────

-- Rollen
create type public.user_role as enum ('user', 'merchant', 'admin');

-- Mitgliedsstufen (Punkte-basiert)
create type public.user_level as enum ('bronze', 'silver', 'gold', 'platinum');

-- Content-Status
create type public.item_status as enum ('pending', 'approved', 'rejected');

-- Punkte-Transaktionstypen
create type public.points_action as enum (
  'daily_spin',
  'qr_checkin',
  'event_attend',
  'deal_redeem',
  'post_approved',
  'referral',
  'admin_adjust',
  'welcome_bonus'
);

-- Benachrichtigungstypen
create type public.notif_type as enum ('info', 'points', 'event', 'deal', 'badge');

-- ============================================================
-- TABELLEN
-- ============================================================

-- ── profiles ─────────────────────────────────────────────────
-- 1:1 mit auth.users — wird per Trigger automatisch angelegt
create table public.profiles (
  id                      uuid        primary key references auth.users(id) on delete cascade,
  role                    public.user_role   not null default 'user',
  level                   public.user_level  not null default 'bronze',
  username                text        not null unique,
  display_name            text        not null,
  initials                text        not null default '',
  avatar_url              text,                          -- Supabase Storage: avatars/
  bio                     text,
  points                  int         not null default 0 check (points >= 0),
  member_since            timestamptz not null default now(),
  is_active               boolean     not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table  public.profiles              is 'Öffentliches Nutzerprofil — 1:1 mit auth.users';
comment on column public.profiles.role         is 'user | merchant | admin';
comment on column public.profiles.level        is 'Mitgliedsstufe (bronze/silver/gold/platinum), berechnet aus points';
comment on column public.profiles.points       is 'Aktuelle Gesamtpunkte, per Trigger aus points_transactions summiert';
comment on column public.profiles.avatar_url   is 'Supabase Storage URL: avatars/{user_id}/avatar.jpg';

-- ── merchants ─────────────────────────────────────────────────
create table public.merchants (
  id              uuid        primary key default uuid_generate_v4(),
  name            text        not null,
  icon            text        not null default '🏪',
  category        text        not null,
  category_color  text        not null default '#8b5cf6',
  location        text,
  floor           text,
  hours           text,
  phone           text,
  description     text,
  current_promo   text,
  promo_color     text        default '#8b5cf6',
  is_open         boolean     not null default true,
  rating          numeric(2,1)         check (rating >= 0 and rating <= 5),
  review_count    int         not null default 0,
  tags            text[]      not null default '{}',
  is_active       boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.merchants is 'Händler und Shops im ZAM Freiham';

-- ── merchant_staff ────────────────────────────────────────────
-- Welche Nutzer dürfen welchen Händler verwalten
create table public.merchant_staff (
  merchant_id  uuid        not null references public.merchants(id) on delete cascade,
  user_id      uuid        not null references public.profiles(id)  on delete cascade,
  role         text        not null default 'manager' check (role in ('owner', 'manager')),
  added_at     timestamptz not null default now(),
  primary key (merchant_id, user_id)
);

comment on table public.merchant_staff is 'Zugriffskontrolle: Händler → Nutzer (owner/manager)';

-- ── posts ────────────────────────────────────────────────────
create table public.posts (
  id              uuid              primary key default uuid_generate_v4(),
  user_id         uuid              not null references public.profiles(id) on delete cascade,
  content         text              not null check (char_length(content) between 1 and 500),
  image_url       text,                          -- Supabase Storage: post-images/
  tags            text[]            not null default '{}',
  status          public.item_status not null default 'pending',
  reject_reason   text,
  likes_count     int               not null default 0 check (likes_count >= 0),
  comments_count  int               not null default 0 check (comments_count >= 0),
  created_at      timestamptz       not null default now(),
  updated_at      timestamptz       not null default now()
);

comment on table  public.posts              is 'Community-Beiträge — müssen von Admin freigegeben werden (status=approved)';
comment on column public.posts.image_url    is 'Supabase Storage URL: post-images/{user_id}/{uuid}.jpg';
comment on column public.posts.likes_count  is 'Denormalisiert für Performance — per Trigger aus post_likes aktuell gehalten';

-- ── post_likes ────────────────────────────────────────────────
create table public.post_likes (
  post_id   uuid        not null references public.posts(id)    on delete cascade,
  user_id   uuid        not null references public.profiles(id) on delete cascade,
  liked_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);

comment on table public.post_likes is 'Like-Relation: jeder Nutzer kann jeden Post genau einmal liken';

-- ── comments ─────────────────────────────────────────────────
create table public.comments (
  id          uuid        primary key default uuid_generate_v4(),
  post_id     uuid        not null references public.posts(id)    on delete cascade,
  user_id     uuid        not null references public.profiles(id) on delete cascade,
  content     text        not null check (char_length(content) between 1 and 300),
  created_at  timestamptz not null default now()
);

comment on table public.comments is 'Kommentare zu Posts — keine Moderation, direkt sichtbar';

-- ── events ───────────────────────────────────────────────────
create table public.events (
  id              uuid               primary key default uuid_generate_v4(),
  merchant_id     uuid               references public.merchants(id) on delete set null,
  created_by      uuid               references public.profiles(id)  on delete set null,
  title           text               not null,
  category        text               not null,
  category_color  text               not null default '#8b5cf6',
  date_iso        date               not null,
  time_start      time               not null,
  time_end        time,
  location        text               not null,
  description     text,
  spots_total     int                check (spots_total > 0),
  spots_left      int                check (spots_left >= 0),
  points_reward   int                not null default 0 check (points_reward >= 0),
  is_featured     boolean            not null default false,
  image_url       text,
  status          public.item_status not null default 'pending',
  reject_reason   text,
  created_at      timestamptz        not null default now(),
  updated_at      timestamptz        not null default now(),

  constraint spots_consistency check (spots_left is null or spots_total is null or spots_left <= spots_total)
);

comment on table  public.events             is 'Veranstaltungen — von ZAM-Team oder Händlern erstellt, Admin-Freigabe nötig';
comment on column public.events.merchant_id is 'null = direkt von ZAM veranstaltet';

-- ── event_participants ────────────────────────────────────────
create table public.event_participants (
  event_id       uuid        not null references public.events(id)   on delete cascade,
  user_id        uuid        not null references public.profiles(id)  on delete cascade,
  registered_at  timestamptz not null default now(),
  primary key (event_id, user_id)
);

comment on table public.event_participants is 'Anmeldungen zu Events (event_registrations im Schema als event_participants)';

-- ── saved_events ──────────────────────────────────────────────
create table public.saved_events (
  event_id  uuid        not null references public.events(id)   on delete cascade,
  user_id   uuid        not null references public.profiles(id)  on delete cascade,
  saved_at  timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- ── deals ────────────────────────────────────────────────────
create table public.deals (
  id              uuid               primary key default uuid_generate_v4(),
  merchant_id     uuid               not null references public.merchants(id) on delete cascade,
  created_by      uuid               references public.profiles(id) on delete set null,
  title           text               not null,
  description     text,
  category        text,
  category_color  text               not null default '#8b5cf6',
  discount        text               not null,
  expiry_date     date               not null,
  points_reward   int                not null default 0 check (points_reward >= 0),
  is_hot          boolean            not null default false,
  barcode         text,
  status          public.item_status not null default 'pending',
  reject_reason   text,
  created_at      timestamptz        not null default now(),
  updated_at      timestamptz        not null default now()
);

comment on table public.deals is 'Angebote und Rabattaktionen — Admin-Freigabe nötig';

-- ── saved_deals ───────────────────────────────────────────────
create table public.saved_deals (
  deal_id   uuid        not null references public.deals(id)    on delete cascade,
  user_id   uuid        not null references public.profiles(id)  on delete cascade,
  saved_at  timestamptz not null default now(),
  primary key (deal_id, user_id)
);

comment on table public.saved_deals is 'Gemerkte Deals pro Nutzer';

-- ── deal_redemptions ──────────────────────────────────────────
create table public.deal_redemptions (
  id           uuid        primary key default uuid_generate_v4(),
  deal_id      uuid        not null references public.deals(id)    on delete cascade,
  user_id      uuid        not null references public.profiles(id)  on delete cascade,
  redeemed_at  timestamptz not null default now()
);

comment on table public.deal_redemptions is 'Protokoll eingelöster Deals — darf mehrfach vorkommen';

-- ── points_transactions ───────────────────────────────────────
create table public.points_transactions (
  id            uuid                 primary key default uuid_generate_v4(),
  user_id       uuid                 not null references public.profiles(id) on delete cascade,
  points        int                  not null,   -- positiv = Gutschrift, negativ = Abbuchung
  action        public.points_action not null,
  description   text,
  reference_id  uuid,               -- FK zu events.id, deals.id etc. — polymorph, kein hard FK
  created_at    timestamptz          not null default now()
);

comment on table  public.points_transactions            is 'Vollständige Punkte-Transaktionshistorie';
comment on column public.points_transactions.points     is 'Positiv = Gutschrift, Negativ = Abbuchung';
comment on column public.points_transactions.reference_id is 'Optionaler Verweis auf Event, Deal oder Check-in (polymorph)';

-- ── badges ───────────────────────────────────────────────────
create table public.badges (
  id             uuid        primary key default uuid_generate_v4(),
  name           text        not null,
  icon           text        not null,
  description    text        not null,
  color          text        not null default '#8b5cf6',
  trigger_type   text        check (trigger_type in ('visits','events','deals','checkins','streak','points','posts','manual')),
  trigger_value  int,
  is_active      boolean     not null default true,
  created_at     timestamptz not null default now()
);

comment on table public.badges is 'Badge-Definitionen — vom Admin verwaltet, Vergabe über trigger_type/trigger_value';

-- ── user_badges ───────────────────────────────────────────────
create table public.user_badges (
  badge_id   uuid        not null references public.badges(id)   on delete cascade,
  user_id    uuid        not null references public.profiles(id)  on delete cascade,
  earned_at  timestamptz not null default now(),
  primary key (badge_id, user_id)
);

comment on table public.user_badges is 'M:N — welche Nutzer haben welche Badges verdient';

-- ── checkins ─────────────────────────────────────────────────
create table public.checkins (
  id              uuid        primary key default uuid_generate_v4(),
  user_id         uuid        not null references public.profiles(id)  on delete cascade,
  merchant_id     uuid        references public.merchants(id) on delete set null,
  points_awarded  int         not null default 25,
  checked_in_at   timestamptz not null default now()
);

comment on table public.checkins is 'QR Check-in Protokoll — ein Eintrag pro Besuch';

-- ── spin_rewards ──────────────────────────────────────────────
create table public.spin_rewards (
  id           uuid        primary key default uuid_generate_v4(),
  label        text        not null,
  points       int         not null check (points > 0),
  probability  numeric(5,4) not null check (probability > 0 and probability <= 1),
  is_active    boolean     not null default true
);

comment on table public.spin_rewards is 'Glücksrad-Konfiguration — Wahrscheinlichkeiten müssen sich zu 1.0 summieren';

-- ── notifications ─────────────────────────────────────────────
create table public.notifications (
  id          uuid             primary key default uuid_generate_v4(),
  user_id     uuid             not null references public.profiles(id) on delete cascade,
  title       text             not null,
  body        text             not null,
  type        public.notif_type not null default 'info',
  action_url  text,
  is_read     boolean          not null default false,
  created_at  timestamptz      not null default now()
);

comment on table public.notifications is 'In-App Benachrichtigungen — Vorbereitung für spätere Push-Integration';

-- ============================================================
-- INDIZES (Performance)
-- ============================================================

-- Posts: häufigste Abfrage — alle approved, nach Datum sortiert
create index idx_posts_status_created    on public.posts(status, created_at desc);
create index idx_posts_user_id           on public.posts(user_id);

-- Kommentare nach Post
create index idx_comments_post_id        on public.comments(post_id);

-- Events: nach Datum
create index idx_events_date             on public.events(date_iso);
create index idx_events_status           on public.events(status, date_iso);
create index idx_events_merchant         on public.events(merchant_id);

-- Deals: nach Ablaufdatum
create index idx_deals_expiry            on public.deals(expiry_date);
create index idx_deals_status            on public.deals(status);
create index idx_deals_merchant          on public.deals(merchant_id);

-- Punkte-Historie
create index idx_points_user_created     on public.points_transactions(user_id, created_at desc);

-- Benachrichtigungen (ungelesen zuerst)
create index idx_notifs_user_unread      on public.notifications(user_id, is_read, created_at desc);

-- ============================================================
-- TRIGGER-FUNKTIONEN
-- ============================================================

-- updated_at automatisch setzen
create or replace function public.fn_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Trigger für alle Tabellen mit updated_at
create trigger trg_profiles_updated_at  before update on public.profiles  for each row execute function public.fn_set_updated_at();
create trigger trg_merchants_updated_at before update on public.merchants for each row execute function public.fn_set_updated_at();
create trigger trg_posts_updated_at     before update on public.posts     for each row execute function public.fn_set_updated_at();
create trigger trg_events_updated_at    before update on public.events    for each row execute function public.fn_set_updated_at();
create trigger trg_deals_updated_at     before update on public.deals     for each row execute function public.fn_set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Punkte-Transaktion → profiles.points + Level synchronisieren
-- ─────────────────────────────────────────────────────────────
create or replace function public.fn_sync_points()
returns trigger language plpgsql security definer as $$
declare
  v_total int;
  v_level public.user_level;
begin
  -- Punkte summieren
  update public.profiles
    set points = points + new.points
    where id = new.user_id
    returning points into v_total;

  -- Level automatisch anpassen
  v_level := case
    when v_total >= 3000 then 'platinum'::public.user_level
    when v_total >= 1500 then 'gold'::public.user_level
    when v_total >= 500  then 'silver'::public.user_level
    else                      'bronze'::public.user_level
  end;

  update public.profiles set level = v_level where id = new.user_id;

  return new;
end;
$$;

create trigger trg_sync_points
  after insert on public.points_transactions
  for each row execute function public.fn_sync_points();

-- ─────────────────────────────────────────────────────────────
-- Post-Like → posts.likes_count synchronisieren
-- ─────────────────────────────────────────────────────────────
create or replace function public.fn_sync_likes()
returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set likes_count = likes_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.posts set likes_count = greatest(0, likes_count - 1) where id = old.post_id;
  end if;
  return null;
end;
$$;

create trigger trg_sync_likes
  after insert or delete on public.post_likes
  for each row execute function public.fn_sync_likes();

-- ─────────────────────────────────────────────────────────────
-- Kommentar → posts.comments_count synchronisieren
-- ─────────────────────────────────────────────────────────────
create or replace function public.fn_sync_comments()
returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set comments_count = comments_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.posts set comments_count = greatest(0, comments_count - 1) where id = old.post_id;
  end if;
  return null;
end;
$$;

create trigger trg_sync_comments
  after insert or delete on public.comments
  for each row execute function public.fn_sync_comments();

-- ─────────────────────────────────────────────────────────────
-- Neuer Auth-User → Profil automatisch anlegen
-- ─────────────────────────────────────────────────────────────
create or replace function public.fn_handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  v_username     text;
  v_display_name text;
  v_initials     text;
begin
  v_display_name := coalesce(
    new.raw_user_meta_data->>'display_name',
    split_part(new.email, '@', 1)
  );
  v_username := coalesce(
    new.raw_user_meta_data->>'username',
    regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9_]', '', 'g')
  );
  -- Sicherstellen dass username unique ist
  v_username := v_username || case when exists(
    select 1 from public.profiles where username = v_username
  ) then '_' || floor(random()*9000+1000)::text else '' end;

  -- Initialen aus Display-Name
  v_initials := upper(
    left(split_part(v_display_name, ' ', 1), 1) ||
    left(coalesce(nullif(split_part(v_display_name, ' ', 2), ''), ''), 1)
  );

  insert into public.profiles (id, username, display_name, initials)
  values (new.id, v_username, v_display_name, v_initials);

  -- Willkommens-Bonus
  insert into public.points_transactions (user_id, points, action, description)
  values (new.id, 50, 'welcome_bonus', 'Willkommen im ZAM Club!');

  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.fn_handle_new_user();

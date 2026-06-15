-- ============================================================
-- ZAM Club — Supabase Schema
-- Reihenfolge beachten (Fremdschlüssel-Abhängigkeiten)
-- ============================================================

-- Erweiterungen
create extension if not exists "uuid-ossp";

-- ============================================================
-- profiles — Öffentliches Nutzerprofil (1:1 mit auth.users)
-- ============================================================
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text unique not null,
  display_name  text not null,
  initials      text not null default '',
  avatar_url    text,                        -- Supabase Storage URL
  level         text not null default 'bronze'
                  check (level in ('bronze','silver','gold','platinum')),
  points        int  not null default 0,
  member_since  timestamptz not null default now(),
  is_merchant   boolean not null default false,
  is_admin      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.profiles is 'Öffentliches Nutzerprofil, verknüpft mit auth.users';

-- ============================================================
-- merchants — Händler / Shops im ZAM
-- ============================================================
create table public.merchants (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  icon            text not null default '🏪',
  category        text not null,
  category_color  text not null default '#8b5cf6',
  location        text,
  floor           text,
  hours           text,
  phone           text,
  description     text,
  current_promo   text,
  promo_color     text,
  is_open         boolean not null default true,
  rating          numeric(2,1),
  review_count    int not null default 0,
  tags            text[] default '{}',
  created_at      timestamptz not null default now()
);
comment on table public.merchants is 'Händler und Shops im ZAM Freiham';

-- ============================================================
-- merchant_staff — Wer darf welchen Händler verwalten
-- ============================================================
create table public.merchant_staff (
  merchant_id  uuid not null references public.merchants(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  role         text not null default 'manager'
                 check (role in ('owner','manager')),
  primary key (merchant_id, user_id)
);
comment on table public.merchant_staff is 'Zugriffsrechte: welche Nutzer welchen Händler verwalten dürfen';

-- ============================================================
-- points_log — Punkte-Transaktionshistorie
-- ============================================================
create table public.points_log (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  points        int  not null,               -- positiv = Gutschrift, negativ = Abbuchung
  action        text not null,               -- 'daily_spin' | 'qr_checkin' | 'deal_redeem' | 'event_attend' | ...
  reference_id  uuid,                        -- optionale FK zu events, deals, etc.
  created_at    timestamptz not null default now()
);
comment on table public.points_log is 'Vollständige Punkte-Transaktionshistorie pro Nutzer';

-- ============================================================
-- checkins — QR Check-in Protokoll
-- ============================================================
create table public.checkins (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  merchant_id     uuid references public.merchants(id),
  points_awarded  int not null default 25,
  checked_in_at   timestamptz not null default now()
);
comment on table public.checkins is 'QR Check-in Protokoll — ein Eintrag pro Besuch';

-- ============================================================
-- badges — Badge-Definitionen (globale Tabelle)
-- ============================================================
create table public.badges (
  id             uuid primary key default uuid_generate_v4(),
  name           text not null,
  icon           text not null,
  description    text not null,
  color          text not null default '#8b5cf6',
  trigger_type   text,    -- 'visits' | 'events' | 'deals' | 'checkins' | 'streak' | 'points' | 'manual'
  trigger_value  int,     -- z.B. 10 (für "10 Besuche")
  created_at     timestamptz not null default now()
);
comment on table public.badges is 'Badge-Definitionen — vom Admin verwaltet';

-- ============================================================
-- user_badges — Welche Badges hat welcher Nutzer verdient
-- ============================================================
create table public.user_badges (
  badge_id   uuid not null references public.badges(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  earned_at  timestamptz not null default now(),
  primary key (badge_id, user_id)
);
comment on table public.user_badges is 'M:N — Nutzer ↔ verdiente Badges';

-- ============================================================
-- posts — Community-Beiträge
-- ============================================================
create table public.posts (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  content         text not null check (char_length(content) <= 500),
  image_url       text,                      -- Supabase Storage URL
  tags            text[] default '{}',
  status          text not null default 'pending'
                    check (status in ('pending','approved','rejected')),
  reject_reason   text,
  likes_count     int not null default 0,
  comments_count  int not null default 0,
  created_at      timestamptz not null default now()
);
comment on table public.posts is 'Community-Beiträge — müssen von Admin freigegeben werden';

-- ============================================================
-- post_likes — Likes auf Posts (1 pro Nutzer)
-- ============================================================
create table public.post_likes (
  post_id   uuid not null references public.posts(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  liked_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);
comment on table public.post_likes is 'Like-Status pro Nutzer und Post';

-- ============================================================
-- comments — Kommentare zu Posts
-- ============================================================
create table public.comments (
  id          uuid primary key default uuid_generate_v4(),
  post_id     uuid not null references public.posts(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  content     text not null check (char_length(content) <= 300),
  created_at  timestamptz not null default now()
);
comment on table public.comments is 'Kommentare zu Community-Posts';

-- ============================================================
-- events — Veranstaltungen im ZAM
-- ============================================================
create table public.events (
  id              uuid primary key default uuid_generate_v4(),
  merchant_id     uuid references public.merchants(id),
  created_by      uuid references public.profiles(id),
  title           text not null,
  category        text not null,
  category_color  text not null default '#8b5cf6',
  date_iso        date not null,
  time_start      time not null,
  time_end        time,
  location        text not null,
  description     text,
  spots_total     int,
  spots_left      int,
  points_reward   int not null default 0,
  is_featured     boolean not null default false,
  image_url       text,
  status          text not null default 'pending'
                    check (status in ('pending','approved','rejected')),
  reject_reason   text,
  created_at      timestamptz not null default now()
);
comment on table public.events is 'Veranstaltungen — von ZAM-Team oder Händlern erstellt';

-- ============================================================
-- event_registrations — Anmeldungen zu Events
-- ============================================================
create table public.event_registrations (
  event_id       uuid not null references public.events(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  registered_at  timestamptz not null default now(),
  primary key (event_id, user_id)
);
comment on table public.event_registrations is 'Nutzer-Anmeldungen zu Events';

-- ============================================================
-- saved_events — Gemerkte Events
-- ============================================================
create table public.saved_events (
  event_id  uuid not null references public.events(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  saved_at  timestamptz not null default now(),
  primary key (event_id, user_id)
);
comment on table public.saved_events is 'Gemerkte / bookmarkte Events pro Nutzer';

-- ============================================================
-- deals — Angebote und Rabattaktionen
-- ============================================================
create table public.deals (
  id              uuid primary key default uuid_generate_v4(),
  merchant_id     uuid not null references public.merchants(id) on delete cascade,
  created_by      uuid references public.profiles(id),
  title           text not null,
  description     text,
  category        text,
  category_color  text not null default '#8b5cf6',
  discount        text not null,
  expiry_date     date not null,
  points_reward   int not null default 0,
  is_hot          boolean not null default false,
  barcode         text,
  status          text not null default 'pending'
                    check (status in ('pending','approved','rejected')),
  reject_reason   text,
  created_at      timestamptz not null default now()
);
comment on table public.deals is 'Angebote und Rabattaktionen von Händlern';

-- ============================================================
-- saved_deals — Gemerkte Deals
-- ============================================================
create table public.saved_deals (
  deal_id   uuid not null references public.deals(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  saved_at  timestamptz not null default now(),
  primary key (deal_id, user_id)
);
comment on table public.saved_deals is 'Gemerkte Deals pro Nutzer';

-- ============================================================
-- deal_redemptions — Eingelöste Deals
-- ============================================================
create table public.deal_redemptions (
  id           uuid primary key default uuid_generate_v4(),
  deal_id      uuid not null references public.deals(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  redeemed_at  timestamptz not null default now()
);
comment on table public.deal_redemptions is 'Protokoll eingelöster Deals';

-- ============================================================
-- spin_rewards — Konfiguration des Glücksrads
-- ============================================================
create table public.spin_rewards (
  id           uuid primary key default uuid_generate_v4(),
  label        text not null,
  points       int  not null,
  probability  numeric(4,3) not null check (probability >= 0 and probability <= 1),
  is_active    boolean not null default true
);
comment on table public.spin_rewards is 'Glücksrad-Felder mit Punktwert und Wahrscheinlichkeit';

-- ============================================================
-- notifications — In-App Benachrichtigungen (kein Push, Vorbereitung)
-- ============================================================
create table public.notifications (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  body        text not null,
  type        text not null default 'info'   -- 'info' | 'points' | 'event' | 'deal' | 'badge'
                check (type in ('info','points','event','deal','badge')),
  action_url  text,                          -- Deeplink, z.B. 'events/evt_001'
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);
comment on table public.notifications is 'In-App Benachrichtigungen — Vorbereitung für Push Notifications';

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

-- profiles
alter table public.profiles enable row level security;
create policy "Eigenes Profil lesen" on public.profiles for select using (auth.uid() = id);
create policy "Öffentliche Profile lesen" on public.profiles for select using (true);
create policy "Eigenes Profil aktualisieren" on public.profiles for update using (auth.uid() = id);

-- posts
alter table public.posts enable row level security;
create policy "Freigegebene Posts lesen" on public.posts for select using (status = 'approved');
create policy "Eigene Posts lesen" on public.posts for select using (auth.uid() = user_id);
create policy "Post erstellen" on public.posts for insert with check (auth.uid() = user_id);
create policy "Eigenen Post löschen" on public.posts for delete using (auth.uid() = user_id);

-- comments
alter table public.comments enable row level security;
create policy "Kommentare lesen" on public.comments for select using (true);
create policy "Kommentar erstellen" on public.comments for insert with check (auth.uid() = user_id);
create policy "Eigenen Kommentar löschen" on public.comments for delete using (auth.uid() = user_id);

-- post_likes
alter table public.post_likes enable row level security;
create policy "Likes lesen" on public.post_likes for select using (true);
create policy "Liken" on public.post_likes for insert with check (auth.uid() = user_id);
create policy "Entliken" on public.post_likes for delete using (auth.uid() = user_id);

-- events
alter table public.events enable row level security;
create policy "Freigegebene Events lesen" on public.events for select using (status = 'approved');

-- deals
alter table public.deals enable row level security;
create policy "Freigegebene Deals lesen" on public.deals for select using (status = 'approved');

-- points_log
alter table public.points_log enable row level security;
create policy "Eigene Punkte-Historie lesen" on public.points_log for select using (auth.uid() = user_id);

-- notifications
alter table public.notifications enable row level security;
create policy "Eigene Benachrichtigungen lesen" on public.notifications for select using (auth.uid() = user_id);
create policy "Eigene Benachrichtigungen aktualisieren" on public.notifications for update using (auth.uid() = user_id);

-- ============================================================
-- Trigger: updated_at automatisch setzen
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ============================================================
-- Trigger: points_log → profiles.points synchronisieren
-- ============================================================
create or replace function public.sync_points()
returns trigger language plpgsql security definer as $$
begin
  update public.profiles
    set points = points + new.points
    where id = new.user_id;
  return new;
end;
$$;
create trigger sync_points_on_log after insert on public.points_log
  for each row execute function public.sync_points();

-- ============================================================
-- Trigger: Neuer Auth-User → Profil anlegen
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, username, display_name, initials)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)),
    upper(left(coalesce(new.raw_user_meta_data->>'display_name', new.email), 1))
      || upper(left(coalesce(split_part(new.raw_user_meta_data->>'display_name',' ',2),''), 1))
  );
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

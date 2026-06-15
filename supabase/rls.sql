-- ============================================================
-- ZAM Club — Row Level Security Policies
-- Version: 2.0
--
-- WICHTIG: Erst schema.sql ausführen, dann rls.sql
-- Dieses Script aktiviert RLS auf allen Tabellen und definiert
-- feingranulare Zugriffsregeln für user / merchant / admin.
-- ============================================================

-- ── Hilfsfunktionen ──────────────────────────────────────────

-- Gibt die Rolle des aktuell eingeloggten Nutzers zurück
create or replace function public.fn_my_role()
returns public.user_role
language sql stable security definer as $$
  select role from public.profiles where id = auth.uid()
$$;

-- Prüft ob der aktuelle Nutzer Admin ist
create or replace function public.fn_is_admin()
returns boolean
language sql stable security definer as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

-- Prüft ob der aktuelle Nutzer ein bestimmtes Merchant-Profil verwalten darf
create or replace function public.fn_manages_merchant(p_merchant_id uuid)
returns boolean
language sql stable security definer as $$
  select exists(
    select 1 from public.merchant_staff
    where merchant_id = p_merchant_id and user_id = auth.uid()
  ) or public.fn_is_admin()
$$;

-- ============================================================
-- profiles
-- ============================================================
alter table public.profiles enable row level security;

-- Alle können öffentliche Profile lesen
create policy "profile_select_public"
  on public.profiles for select
  using (is_active = true);

-- Jeder sieht sein eigenes Profil (auch wenn inaktiv)
create policy "profile_select_own"
  on public.profiles for select
  using (auth.uid() = id);

-- Nur eigenes Profil aktualisieren (role/points/level nicht selbst änderbar)
create policy "profile_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    -- role darf nicht selbst erhöht werden:
    and role = (select role from public.profiles where id = auth.uid())
  );

-- Admins dürfen alle Profile bearbeiten
create policy "profile_admin_all"
  on public.profiles for all
  using (public.fn_is_admin());

-- ============================================================
-- merchants
-- ============================================================
alter table public.merchants enable row level security;

-- Alle können aktive Händler lesen
create policy "merchant_select_active"
  on public.merchants for select
  using (is_active = true);

-- Händler-Betreiber und Admins dürfen ihren Händler bearbeiten
create policy "merchant_update_staff"
  on public.merchants for update
  using (public.fn_manages_merchant(id));

-- Nur Admins dürfen neue Händler anlegen oder löschen
create policy "merchant_insert_admin"
  on public.merchants for insert
  with check (public.fn_is_admin());

create policy "merchant_delete_admin"
  on public.merchants for delete
  using (public.fn_is_admin());

-- ============================================================
-- merchant_staff
-- ============================================================
alter table public.merchant_staff enable row level security;

create policy "mstaff_select_own"
  on public.merchant_staff for select
  using (user_id = auth.uid() or public.fn_is_admin());

create policy "mstaff_admin_all"
  on public.merchant_staff for all
  using (public.fn_is_admin());

-- ============================================================
-- posts
-- ============================================================
alter table public.posts enable row level security;

-- Alle sehen freigegebene Posts
create policy "post_select_approved"
  on public.posts for select
  using (status = 'approved');

-- Eigene Posts immer sichtbar (auch pending/rejected)
create policy "post_select_own"
  on public.posts for select
  using (auth.uid() = user_id);

-- Eingeloggte Nutzer dürfen Posts erstellen
create policy "post_insert"
  on public.posts for insert
  with check (auth.uid() = user_id);

-- Nur eigene Posts löschen (oder Admin)
create policy "post_delete_own"
  on public.posts for delete
  using (auth.uid() = user_id or public.fn_is_admin());

-- Admins dürfen alles bearbeiten (status ändern = freigeben/ablehnen)
create policy "post_admin_update"
  on public.posts for update
  using (public.fn_is_admin());

-- ============================================================
-- post_likes
-- ============================================================
alter table public.post_likes enable row level security;

create policy "likes_select_all"
  on public.post_likes for select
  using (true);

create policy "likes_insert_own"
  on public.post_likes for insert
  with check (auth.uid() = user_id);

create policy "likes_delete_own"
  on public.post_likes for delete
  using (auth.uid() = user_id);

-- ============================================================
-- comments
-- ============================================================
alter table public.comments enable row level security;

-- Kommentare zu freigegebenen Posts lesbar
create policy "comment_select_approved"
  on public.comments for select
  using (
    exists(select 1 from public.posts where id = post_id and status = 'approved')
  );

-- Eingeloggte Nutzer dürfen kommentieren
create policy "comment_insert"
  on public.comments for insert
  with check (auth.uid() = user_id);

-- Nur Ersteller oder Admin kann Kommentar löschen
create policy "comment_delete_own"
  on public.comments for delete
  using (auth.uid() = user_id or public.fn_is_admin());

-- ============================================================
-- events
-- ============================================================
alter table public.events enable row level security;

-- Alle sehen freigegebene, zukünftige Events
create policy "event_select_approved"
  on public.events for select
  using (status = 'approved' and date_iso >= current_date);

-- Eigene Events immer sichtbar
create policy "event_select_own"
  on public.events for select
  using (auth.uid() = created_by);

-- Händler und Admins dürfen Events erstellen
create policy "event_insert"
  on public.events for insert
  with check (
    public.fn_is_admin()
    or (
      auth.uid() = created_by
      and merchant_id is not null
      and public.fn_manages_merchant(merchant_id)
    )
  );

-- Ersteller oder zuständiger Händler-Staff darf bearbeiten
create policy "event_update_own"
  on public.events for update
  using (
    auth.uid() = created_by
    or (merchant_id is not null and public.fn_manages_merchant(merchant_id))
  );

-- Admins dürfen Status ändern (freigeben/ablehnen) und alles bearbeiten
create policy "event_admin_all"
  on public.events for all
  using (public.fn_is_admin());

-- ============================================================
-- event_participants
-- ============================================================
alter table public.event_participants enable row level security;

create policy "participant_select_own"
  on public.event_participants for select
  using (auth.uid() = user_id or public.fn_is_admin());

create policy "participant_insert_own"
  on public.event_participants for insert
  with check (auth.uid() = user_id);

create policy "participant_delete_own"
  on public.event_participants for delete
  using (auth.uid() = user_id or public.fn_is_admin());

-- ============================================================
-- saved_events
-- ============================================================
alter table public.saved_events enable row level security;

create policy "saved_event_own"
  on public.saved_events for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- deals
-- ============================================================
alter table public.deals enable row level security;

-- Alle sehen freigegebene, nicht abgelaufene Deals
create policy "deal_select_approved"
  on public.deals for select
  using (status = 'approved' and expiry_date >= current_date);

-- Eigene Deals (vom Händler erstellt)
create policy "deal_select_own"
  on public.deals for select
  using (auth.uid() = created_by or public.fn_manages_merchant(merchant_id));

-- Händler dürfen Deals für ihre eigenen Merchants erstellen
create policy "deal_insert"
  on public.deals for insert
  with check (
    public.fn_is_admin()
    or (auth.uid() = created_by and public.fn_manages_merchant(merchant_id))
  );

-- Händler dürfen eigene Deals bearbeiten (nicht Status)
create policy "deal_update_own"
  on public.deals for update
  using (public.fn_manages_merchant(merchant_id))
  with check (
    -- Händler darf Status nicht selbst ändern
    public.fn_is_admin() or status = (select status from public.deals where id = deals.id)
  );

-- Admin darf alles
create policy "deal_admin_all"
  on public.deals for all
  using (public.fn_is_admin());

-- ============================================================
-- saved_deals
-- ============================================================
alter table public.saved_deals enable row level security;

create policy "saved_deal_own"
  on public.saved_deals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- deal_redemptions
-- ============================================================
alter table public.deal_redemptions enable row level security;

create policy "redemption_select_own"
  on public.deal_redemptions for select
  using (auth.uid() = user_id or public.fn_is_admin());

create policy "redemption_insert_own"
  on public.deal_redemptions for insert
  with check (auth.uid() = user_id);

-- ============================================================
-- points_transactions
-- ============================================================
alter table public.points_transactions enable row level security;

-- Nur eigene Transaktionen lesbar
create policy "points_select_own"
  on public.points_transactions for select
  using (auth.uid() = user_id);

-- Nur Admins und Server-seitige Funktionen (security definer) schreiben Punkte
create policy "points_insert_admin"
  on public.points_transactions for insert
  with check (public.fn_is_admin());

-- ============================================================
-- badges / user_badges
-- ============================================================
alter table public.badges enable row level security;

create policy "badge_select_all"
  on public.badges for select
  using (is_active = true);

create policy "badge_admin_all"
  on public.badges for all
  using (public.fn_is_admin());

alter table public.user_badges enable row level security;

create policy "user_badge_select_all"
  on public.user_badges for select
  using (true);

create policy "user_badge_admin_all"
  on public.user_badges for all
  using (public.fn_is_admin());

-- ============================================================
-- checkins
-- ============================================================
alter table public.checkins enable row level security;

create policy "checkin_select_own"
  on public.checkins for select
  using (auth.uid() = user_id or public.fn_is_admin());

create policy "checkin_insert_own"
  on public.checkins for insert
  with check (auth.uid() = user_id);

-- ============================================================
-- spin_rewards
-- ============================================================
alter table public.spin_rewards enable row level security;

create policy "spinreward_select_active"
  on public.spin_rewards for select
  using (is_active = true);

create policy "spinreward_admin_all"
  on public.spin_rewards for all
  using (public.fn_is_admin());

-- ============================================================
-- notifications
-- ============================================================
alter table public.notifications enable row level security;

create policy "notif_select_own"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "notif_update_own"
  on public.notifications for update
  using (auth.uid() = user_id);

create policy "notif_admin_insert"
  on public.notifications for insert
  with check (public.fn_is_admin());

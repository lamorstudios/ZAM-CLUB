-- ============================================================
-- ZAM Club — Chat & Social Features (Phase 7)
-- Supabase Realtime aktivieren: Database → Replication → chat_messages ✓
-- ============================================================

-- ── Enum: chat room type ──────────────────────────────────
CREATE TYPE chat_room_type AS ENUM ('global', 'event', 'merchant');

-- ── chat_rooms ───────────────────────────────────────────
CREATE TABLE public.chat_rooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  type        chat_room_type NOT NULL DEFAULT 'global',
  icon        TEXT DEFAULT '💬',
  description TEXT,
  event_id    UUID REFERENCES public.events(id) ON DELETE CASCADE,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed global rooms
INSERT INTO public.chat_rooms (id, name, type, icon, description) VALUES
  ('00000000-0000-0000-0001-000000000001', 'Allgemein',        'global', '💬', 'Allgemeine Unterhaltungen'),
  ('00000000-0000-0000-0001-000000000002', 'Essen & Gastro',   'global', '🍕', 'Restaurants, Cafés & Foodtrends'),
  ('00000000-0000-0000-0001-000000000003', 'Events',           'global', '📅', 'Veranstaltungen & Aktivitäten'),
  ('00000000-0000-0000-0001-000000000004', 'Deals & Aktionen', 'global', '🏷️', 'Angebote & Empfehlungen');

-- Auto-create event chat rooms via trigger
CREATE OR REPLACE FUNCTION fn_create_event_chat_room()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.chat_rooms (name, type, icon, description, event_id)
  VALUES (NEW.title, 'event', '📅', NEW.date_formatted || ' · ' || NEW.location, NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_event_chat_room
  AFTER INSERT ON public.events
  FOR EACH ROW EXECUTE FUNCTION fn_create_event_chat_room();

-- ── chat_messages ────────────────────────────────────────
CREATE TABLE public.chat_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id      UUID NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content      TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  is_deleted   BOOLEAN NOT NULL DEFAULT false,
  deleted_by   UUID REFERENCES auth.users(id),
  deleted_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast room message load
CREATE INDEX idx_chat_messages_room_created ON public.chat_messages (room_id, created_at DESC);
CREATE INDEX idx_chat_messages_user         ON public.chat_messages (user_id);

-- ── chat_participants (presence / read receipts) ──────────
CREATE TABLE public.chat_participants (
  room_id      UUID NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

-- ── blocked_users ────────────────────────────────────────
CREATE TABLE public.blocked_users (
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

-- ── reports ──────────────────────────────────────────────
CREATE TYPE report_content_type AS ENUM ('message', 'post', 'user', 'comment');

CREATE TABLE public.reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_type     report_content_type NOT NULL,
  content_id       UUID NOT NULL,
  reported_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason           TEXT NOT NULL DEFAULT 'other',
  is_resolved      BOOLEAN NOT NULL DEFAULT false,
  resolved_by      UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reports_unresolved ON public.reports (is_resolved, created_at DESC);

-- ── user_presence (online status) ────────────────────────
CREATE TABLE public.user_presence (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'offline',  -- online | recent | offline
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update last_seen when a message is sent
CREATE OR REPLACE FUNCTION fn_update_presence()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.user_presence (user_id, status, last_seen)
  VALUES (NEW.user_id, 'online', now())
  ON CONFLICT (user_id) DO UPDATE SET status = 'online', last_seen = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_message_presence
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION fn_update_presence();

-- ── RLS Policies ────────────────────────────────────────
ALTER TABLE public.chat_rooms        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_users     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_presence     ENABLE ROW LEVEL SECURITY;

-- chat_rooms: everyone can read active rooms
CREATE POLICY "rooms_read"    ON public.chat_rooms FOR SELECT USING (is_active = true);
CREATE POLICY "rooms_admin"   ON public.chat_rooms FOR ALL   USING (fn_is_admin());

-- chat_messages: read non-deleted, own insert, admin delete
CREATE POLICY "msgs_read"     ON public.chat_messages FOR SELECT
  USING (
    is_deleted = false
    AND NOT EXISTS (
      SELECT 1 FROM public.blocked_users
      WHERE blocker_id = auth.uid() AND blocked_id = chat_messages.user_id
    )
  );
CREATE POLICY "msgs_insert"   ON public.chat_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "msgs_delete"   ON public.chat_messages FOR UPDATE
  USING (auth.uid() = user_id OR fn_is_admin());

-- blocked_users: own only
CREATE POLICY "blocked_own"   ON public.blocked_users FOR ALL USING (blocker_id = auth.uid());

-- reports: own insert, admin reads all
CREATE POLICY "reports_insert" ON public.reports FOR INSERT WITH CHECK (reporter_id = auth.uid());
CREATE POLICY "reports_admin"  ON public.reports FOR SELECT USING (fn_is_admin());

-- user_presence: everyone can read, own can update
CREATE POLICY "presence_read"   ON public.user_presence FOR SELECT USING (true);
CREATE POLICY "presence_update" ON public.user_presence FOR ALL USING (user_id = auth.uid());

-- ── Realtime Setup ───────────────────────────────────────
-- Enable in Supabase Dashboard: Database → Replication → Tables:
--   ✓ chat_messages
--   ✓ user_presence
--
-- Client-side subscription (add to api.js when going live):
--
--   const channel = supabase.channel(`room:${roomId}`)
--     .on('postgres_changes', {
--       event: 'INSERT', schema: 'public',
--       table: 'chat_messages', filter: `room_id=eq.${roomId}`
--     }, payload => appendMessage(payload.new))
--     .subscribe()

-- ── Online count view ────────────────────────────────────
CREATE VIEW public.online_count AS
  SELECT count(*) AS online
  FROM   public.user_presence
  WHERE  last_seen > now() - INTERVAL '5 minutes';

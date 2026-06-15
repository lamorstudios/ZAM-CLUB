-- ============================================================
-- ZAM Club — Live Map & Social Features (Phase 8)
-- Datenschutz: keine GPS-Koordinaten, nur freiwillige Zonen.
-- ============================================================

-- ── Enum: zone names ─────────────────────────────────────
CREATE TYPE map_zone AS ENUM ('eingang', 'food', 'shops', 'events', 'aussen');

-- ── Enum: visibility ─────────────────────────────────────
CREATE TYPE map_visibility AS ENUM ('all', 'connections', 'hidden');

-- ── user_locations ───────────────────────────────────────
-- Records which zone a user is currently in (voluntary, no GPS).
CREATE TABLE public.user_locations (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  zone       map_zone NOT NULL,
  visibility map_visibility NOT NULL DEFAULT 'all',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── user_statuses ────────────────────────────────────────
-- Short status message shown on the map next to the user avatar.
CREATE TABLE public.user_statuses (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL CHECK (char_length(status) BETWEEN 1 AND 80),
  emoji      TEXT DEFAULT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── nudges ───────────────────────────────────────────────
-- Anstupsen: A nudges B → B gets notification → B accepts/rejects → private chat unlocked.
CREATE TYPE nudge_status AS ENUM ('pending', 'accepted', 'rejected');

CREATE TABLE public.nudges (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status     nudge_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (from_id, to_id),
  CHECK (from_id <> to_id)
);

CREATE INDEX idx_nudges_to_pending ON public.nudges (to_id, status) WHERE status = 'pending';

-- ── connections ──────────────────────────────────────────
-- Created automatically when a nudge is accepted.
CREATE TABLE public.connections (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_a, user_b),
  CHECK (user_a < user_b)   -- canonical ordering to avoid duplicates
);

-- Auto-create connection when nudge is accepted
CREATE OR REPLACE FUNCTION fn_nudge_accept_connection()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    INSERT INTO public.connections (user_a, user_b)
    VALUES (LEAST(NEW.from_id, NEW.to_id), GREATEST(NEW.from_id, NEW.to_id))
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_nudge_connection
  AFTER UPDATE OF status ON public.nudges
  FOR EACH ROW EXECUTE FUNCTION fn_nudge_accept_connection();

-- ── private_chats ────────────────────────────────────────
-- Room record for private 1-on-1 chats (references chat_rooms).
-- The room is auto-created in chat_rooms when a connection is made.
CREATE TABLE public.private_chats (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.connections(id) ON DELETE CASCADE,
  room_id      UUID NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (connection_id)
);

-- Auto-create private chat room when connection is created
CREATE OR REPLACE FUNCTION fn_connection_private_chat()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_room_id UUID;
  v_name_a  TEXT;
  v_name_b  TEXT;
BEGIN
  SELECT raw_user_meta_data->>'name' INTO v_name_a FROM auth.users WHERE id = NEW.user_a;
  SELECT raw_user_meta_data->>'name' INTO v_name_b FROM auth.users WHERE id = NEW.user_b;
  INSERT INTO public.chat_rooms (name, type, icon, description)
  VALUES (COALESCE(v_name_a,'?') || ' & ' || COALESCE(v_name_b,'?'), 'merchant', '💬', 'Privater Chat')
  RETURNING id INTO v_room_id;
  INSERT INTO public.private_chats (connection_id, room_id) VALUES (NEW.id, v_room_id);
  -- Add both users as participants
  INSERT INTO public.chat_participants (room_id, user_id) VALUES (v_room_id, NEW.user_a), (v_room_id, NEW.user_b);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_connection_chat
  AFTER INSERT ON public.connections
  FOR EACH ROW EXECUTE FUNCTION fn_connection_private_chat();

-- ── RLS Policies ─────────────────────────────────────────
ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_statuses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nudges         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connections    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_chats  ENABLE ROW LEVEL SECURITY;

-- user_locations: visible to all unless hidden; own can update
CREATE POLICY "loc_read" ON public.user_locations FOR SELECT
  USING (visibility <> 'hidden' OR user_id = auth.uid());
CREATE POLICY "loc_own"  ON public.user_locations FOR ALL  USING (user_id = auth.uid());

-- user_statuses: everyone reads, own can write
CREATE POLICY "status_read" ON public.user_statuses FOR SELECT USING (true);
CREATE POLICY "status_own"  ON public.user_statuses FOR ALL  USING (user_id = auth.uid());

-- nudges: own outgoing (from) or incoming (to)
CREATE POLICY "nudge_own" ON public.nudges FOR ALL
  USING (from_id = auth.uid() OR to_id = auth.uid());

-- connections: both participants can read
CREATE POLICY "conn_read" ON public.connections FOR SELECT
  USING (user_a = auth.uid() OR user_b = auth.uid());

-- private_chats: connection participants only
CREATE POLICY "pc_read" ON public.private_chats FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.connections c
      WHERE c.id = private_chats.connection_id
        AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
    )
  );

-- ── Realtime ─────────────────────────────────────────────
-- Enable in Supabase Dashboard: Database → Replication → Tables:
--   ✓ user_locations   (zone presence updates)
--   ✓ nudges           (incoming nudge notifications)
--
-- Client-side subscription example:
--
--   supabase.channel('map-presence')
--     .on('postgres_changes', { event: '*', schema: 'public', table: 'user_locations' },
--         payload => updateMapUser(payload.new))
--     .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'nudges',
--         filter: `to_id=eq.${myUserId}` },
--         payload => showNudgeInbox(payload.new))
--     .subscribe()

-- ── Helper view: my connections with profile info ─────────
CREATE VIEW public.my_connections AS
  SELECT
    c.id AS connection_id,
    c.connected_at,
    CASE WHEN c.user_a = auth.uid() THEN c.user_b ELSE c.user_a END AS other_user_id
  FROM public.connections c
  WHERE c.user_a = auth.uid() OR c.user_b = auth.uid();

-- ═══════════════════════════════════════════════════════════
-- Phase 10 — Private Messages & Blocks
-- ═══════════════════════════════════════════════════════════

-- ── Private messages ─────────────────────────────────────
CREATE TABLE public.private_messages (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id           UUID        NOT NULL REFERENCES public.private_chats(id) ON DELETE CASCADE,
  sender_id         UUID        NOT NULL REFERENCES auth.users(id)            ON DELETE CASCADE,
  content           TEXT        NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  read_by_recipient BOOLEAN     NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.private_messages ENABLE ROW LEVEL SECURITY;

-- Only participants of the chat can read/insert messages
CREATE POLICY "pm_select" ON public.private_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.private_chat_participants pcp
      WHERE pcp.chat_id = private_messages.chat_id
        AND pcp.user_id = auth.uid()
    )
  );

CREATE POLICY "pm_insert" ON public.private_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.private_chat_participants pcp
      WHERE pcp.chat_id = private_messages.chat_id
        AND pcp.user_id = auth.uid()
    )
  );

-- Recipient can mark as read
CREATE POLICY "pm_update_read" ON public.private_messages
  FOR UPDATE USING (
    sender_id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.private_chat_participants pcp
      WHERE pcp.chat_id = private_messages.chat_id
        AND pcp.user_id = auth.uid()
    )
  );

-- ── Blocks ───────────────────────────────────────────────
CREATE TABLE public.blocks (
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

-- Users can manage their own blocks
CREATE POLICY "blocks_own" ON public.blocks
  FOR ALL USING (blocker_id = auth.uid());

-- Index for fast lookup
CREATE INDEX idx_blocks_blocker ON public.blocks(blocker_id);
CREATE INDEX idx_pm_chat_created ON public.private_messages(chat_id, created_at);

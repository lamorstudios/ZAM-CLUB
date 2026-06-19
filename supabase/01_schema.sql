-- ============================================================
-- ZAM CLUB — PostgreSQL Schema
-- File: 01_schema.sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLE: users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id                uuid          DEFAULT uuid_generate_v4() PRIMARY KEY,
  email             text          UNIQUE NOT NULL,
  email_verified    boolean       DEFAULT false,
  display_name      text          NOT NULL,
  username          text          UNIQUE,
  initials          text,
  avatar_url        text,
  role              text          NOT NULL DEFAULT 'user'
                                  CHECK (role IN ('user','merchant','staff','centerManagement','admin')),
  points            integer       NOT NULL DEFAULT 0,
  tier              text          DEFAULT 'bronze'
                                  CHECK (tier IN ('bronze','silver','gold','platin')),
  referral_code     text          UNIQUE,
  referred_by       uuid          REFERENCES users(id),
  consent_given     boolean       DEFAULT false,
  consent_at        timestamptz,
  is_banned         boolean       DEFAULT false,
  ban_reason        text,
  merchant_status   text          CHECK (merchant_status IN ('pending','approved','suspended','rejected')),
  created_at        timestamptz   DEFAULT now(),
  last_login_at     timestamptz
);

-- ============================================================
-- TABLE: merchants
-- ============================================================
CREATE TABLE IF NOT EXISTS merchants (
  id            uuid          DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id       uuid          REFERENCES users(id) UNIQUE NOT NULL,
  shop_name     text          NOT NULL,
  category      text,
  description   text,
  logo_url      text,
  cover_url     text,
  address       text,
  floor         text,
  phone         text,
  website       text,
  instagram     text,
  opening_hours jsonb,
  status        text          DEFAULT 'pending'
                              CHECK (status IN ('pending','approved','suspended','rejected')),
  approved_by   uuid          REFERENCES users(id),
  approved_at   timestamptz,
  is_featured   boolean       DEFAULT false,
  is_sponsored  boolean       DEFAULT false,
  lat           decimal(10,8),
  lng           decimal(11,8),
  created_at    timestamptz   DEFAULT now()
);

-- ============================================================
-- TABLE: merchant_staff
-- ============================================================
CREATE TABLE IF NOT EXISTS merchant_staff (
  id            uuid          DEFAULT uuid_generate_v4() PRIMARY KEY,
  merchant_id   uuid          REFERENCES merchants(id) NOT NULL,
  user_id       uuid          REFERENCES users(id),
  name          text          NOT NULL,
  email         text          NOT NULL,
  role          text          DEFAULT 'staff'
                              CHECK (role IN ('staff','schichtleiter')),
  invite_code   text          UNIQUE NOT NULL,
  status        text          DEFAULT 'invited'
                              CHECK (status IN ('invited','active','removed')),
  invited_at    timestamptz   DEFAULT now(),
  accepted_at   timestamptz,
  last_scan_at  timestamptz,
  total_scans   integer       DEFAULT 0
);

-- ============================================================
-- TABLE: deals
-- ============================================================
CREATE TABLE IF NOT EXISTS deals (
  id                uuid          DEFAULT uuid_generate_v4() PRIMARY KEY,
  merchant_id       uuid          REFERENCES merchants(id) NOT NULL,
  title             text          NOT NULL,
  description       text,
  image_url         text,
  discount_type     text          CHECK (discount_type IN ('percent','fixed','free_item','combo')),
  discount_value    decimal(10,2),
  original_price    decimal(10,2),
  category          text,
  tags              text[],
  is_hot            boolean       DEFAULT false,
  is_active         boolean       DEFAULT true,
  max_redemptions   integer,
  redemption_count  integer       DEFAULT 0,
  points_reward     integer       DEFAULT 10,
  valid_from        timestamptz   DEFAULT now(),
  valid_until       timestamptz,
  created_at        timestamptz   DEFAULT now()
);

-- ============================================================
-- TABLE: vouchers
-- ============================================================
CREATE TABLE IF NOT EXISTS vouchers (
  id            uuid          DEFAULT uuid_generate_v4() PRIMARY KEY,
  deal_id       uuid          REFERENCES deals(id) NOT NULL,
  user_id       uuid          REFERENCES users(id) NOT NULL,
  code          text          UNIQUE NOT NULL,
  token         uuid          UNIQUE DEFAULT uuid_generate_v4(),
  status        text          DEFAULT 'active'
                              CHECK (status IN ('active','redeemed','expired','cancelled')),
  secured_at    timestamptz   DEFAULT now(),
  expires_at    timestamptz   NOT NULL,
  redeemed_at   timestamptz,
  redeemed_by   uuid          REFERENCES users(id),
  staff_id      uuid          REFERENCES merchant_staff(id)
);

-- ============================================================
-- TABLE: redemptions
-- ============================================================
CREATE TABLE IF NOT EXISTS redemptions (
  id              uuid          DEFAULT uuid_generate_v4() PRIMARY KEY,
  voucher_id      uuid          REFERENCES vouchers(id) NOT NULL,
  deal_id         uuid          REFERENCES deals(id) NOT NULL,
  merchant_id     uuid          REFERENCES merchants(id) NOT NULL,
  user_id         uuid          REFERENCES users(id) NOT NULL,
  scanned_by      uuid          REFERENCES users(id) NOT NULL,
  staff_id        uuid          REFERENCES merchant_staff(id),
  points_awarded  integer       NOT NULL DEFAULT 0,
  status          text          DEFAULT 'ok'
                                CHECK (status IN ('ok','wrong_merchant','already_redeemed','expired')),
  redeemed_at     timestamptz   DEFAULT now(),
  device_info     text
);

-- ============================================================
-- TABLE: points_transactions
-- ============================================================
CREATE TABLE IF NOT EXISTS points_transactions (
  id            uuid          DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id       uuid          REFERENCES users(id) NOT NULL,
  amount        integer       NOT NULL,
  balance_after integer       NOT NULL,
  type          text          NOT NULL,
  reference_id  uuid,
  label         text,
  created_at    timestamptz   DEFAULT now(),
  created_by    uuid          REFERENCES users(id)
);

-- ============================================================
-- TABLE: referrals
-- ============================================================
CREATE TABLE IF NOT EXISTS referrals (
  id            uuid          DEFAULT uuid_generate_v4() PRIMARY KEY,
  referrer_id   uuid          REFERENCES users(id) NOT NULL,
  referred_id   uuid          REFERENCES users(id) NOT NULL UNIQUE,
  code_used     text          NOT NULL,
  status        text          DEFAULT 'pending'
                              CHECK (status IN ('pending','qualified','rewarded','fraud')),
  rewarded_at   timestamptz,
  points_given  integer       DEFAULT 0,
  created_at    timestamptz   DEFAULT now()
);

-- ============================================================
-- TABLE: events
-- ============================================================
CREATE TABLE IF NOT EXISTS events (
  id                  uuid          DEFAULT uuid_generate_v4() PRIMARY KEY,
  merchant_id         uuid          REFERENCES merchants(id),
  title               text          NOT NULL,
  description         text,
  image_url           text,
  category            text,
  location            text,
  starts_at           timestamptz   NOT NULL,
  ends_at             timestamptz,
  max_participants    integer,
  participant_count   integer       DEFAULT 0,
  is_free             boolean       DEFAULT true,
  price               decimal(10,2),
  points_reward       integer       DEFAULT 0,
  checkin_radius_m    integer       DEFAULT 100,
  is_active           boolean       DEFAULT true,
  status              text          DEFAULT 'pending'
                                    CHECK (status IN ('pending','approved','rejected','inactive')),
  created_at          timestamptz   DEFAULT now()
);

-- ============================================================
-- TABLE: event_participants
-- ============================================================
CREATE TABLE IF NOT EXISTS event_participants (
  id              uuid          DEFAULT uuid_generate_v4() PRIMARY KEY,
  event_id        uuid          REFERENCES events(id) NOT NULL,
  user_id         uuid          REFERENCES users(id) NOT NULL,
  status          text          DEFAULT 'registered'
                                CHECK (status IN ('registered','checked_in','cancelled')),
  registered_at   timestamptz   DEFAULT now(),
  checked_in_at   timestamptz,
  points_awarded  integer       DEFAULT 0,
  UNIQUE(event_id, user_id)
);

-- ============================================================
-- TABLE: challenges
-- ============================================================
CREATE TABLE IF NOT EXISTS challenges (
  id              uuid          DEFAULT uuid_generate_v4() PRIMARY KEY,
  title           text          NOT NULL,
  description     text,
  icon            text,
  type            text,
  target_value    integer       NOT NULL,
  points_reward   integer       NOT NULL,
  valid_from      timestamptz,
  valid_until     timestamptz,
  is_active       boolean       DEFAULT true,
  created_at      timestamptz   DEFAULT now()
);

-- ============================================================
-- TABLE: challenge_progress
-- ============================================================
CREATE TABLE IF NOT EXISTS challenge_progress (
  id              uuid          DEFAULT uuid_generate_v4() PRIMARY KEY,
  challenge_id    uuid          REFERENCES challenges(id) NOT NULL,
  user_id         uuid          REFERENCES users(id) NOT NULL,
  current_value   integer       DEFAULT 0,
  status          text          DEFAULT 'active'
                                CHECK (status IN ('active','completed','claimed')),
  completed_at    timestamptz,
  claimed_at      timestamptz,
  points_awarded  integer       DEFAULT 0,
  UNIQUE(challenge_id, user_id)
);

-- ============================================================
-- TABLE: notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id          uuid          DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id     uuid          REFERENCES users(id) NOT NULL,
  type        text          NOT NULL,
  title       text          NOT NULL,
  body        text,
  image_url   text,
  action_url  text,
  is_read     boolean       DEFAULT false,
  sent_at     timestamptz   DEFAULT now(),
  read_at     timestamptz,
  push_sent   boolean       DEFAULT false
);

-- ============================================================
-- TABLE: push_tokens
-- ============================================================
CREATE TABLE IF NOT EXISTS push_tokens (
  id              uuid          DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id         uuid          REFERENCES users(id) NOT NULL,
  token           text          UNIQUE NOT NULL,
  platform        text          NOT NULL CHECK (platform IN ('ios','android','web')),
  is_active       boolean       DEFAULT true,
  registered_at   timestamptz   DEFAULT now(),
  last_used_at    timestamptz
);

-- ============================================================
-- TABLE: posts
-- ============================================================
CREATE TABLE IF NOT EXISTS posts (
  id          uuid          DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id     uuid          REFERENCES users(id) NOT NULL,
  content     text          NOT NULL,
  tags        text[],
  image_url   text,
  likes       integer       DEFAULT 0,
  comments    integer       DEFAULT 0,
  status      text          DEFAULT 'pending'
                            CHECK (status IN ('pending','approved','rejected','inactive')),
  created_at  timestamptz   DEFAULT now()
);

-- ============================================================
-- TABLE: post_likes
-- ============================================================
CREATE TABLE IF NOT EXISTS post_likes (
  post_id     uuid          REFERENCES posts(id) NOT NULL,
  user_id     uuid          REFERENCES users(id) NOT NULL,
  created_at  timestamptz   DEFAULT now(),
  PRIMARY KEY(post_id, user_id)
);

-- ============================================================
-- TABLE: comments
-- ============================================================
CREATE TABLE IF NOT EXISTS comments (
  id          uuid          DEFAULT uuid_generate_v4() PRIMARY KEY,
  post_id     uuid          REFERENCES posts(id) NOT NULL,
  user_id     uuid          REFERENCES users(id) NOT NULL,
  content     text          NOT NULL,
  is_deleted  boolean       DEFAULT false,
  created_at  timestamptz   DEFAULT now()
);

-- ============================================================
-- TABLE: chat_rooms
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_rooms (
  id            text          PRIMARY KEY,
  type          text          NOT NULL CHECK (type IN ('global','event','private')),
  name          text,
  reference_id  uuid,
  created_at    timestamptz   DEFAULT now()
);

-- ============================================================
-- TABLE: chat_messages
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id          uuid          DEFAULT uuid_generate_v4() PRIMARY KEY,
  room_id     text          REFERENCES chat_rooms(id) NOT NULL,
  user_id     uuid          REFERENCES users(id) NOT NULL,
  content     text          NOT NULL,
  is_deleted  boolean       DEFAULT false,
  deleted_by  uuid          REFERENCES users(id),
  created_at  timestamptz   DEFAULT now()
);

-- ============================================================
-- TABLE: spin_history
-- ============================================================
CREATE TABLE IF NOT EXISTS spin_history (
  id          uuid          DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id     uuid          REFERENCES users(id) NOT NULL,
  result      text          NOT NULL,
  points_won  integer       DEFAULT 0,
  spun_at     timestamptz   DEFAULT now()
);

-- ============================================================
-- TABLE: checkins
-- ============================================================
CREATE TABLE IF NOT EXISTS checkins (
  id              uuid          DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id         uuid          REFERENCES users(id) NOT NULL,
  merchant_id     uuid          REFERENCES merchants(id),
  event_id        uuid          REFERENCES events(id),
  points_awarded  integer       DEFAULT 0,
  lat             decimal(10,8),
  lng             decimal(11,8),
  checked_in_at   timestamptz   DEFAULT now()
);

-- ============================================================
-- TABLE: merchant_analytics
-- ============================================================
CREATE TABLE IF NOT EXISTS merchant_analytics (
  id                  uuid          DEFAULT uuid_generate_v4() PRIMARY KEY,
  merchant_id         uuid          REFERENCES merchants(id) NOT NULL,
  date                date          NOT NULL,
  profile_views       integer       DEFAULT 0,
  deal_views          integer       DEFAULT 0,
  deal_saves          integer       DEFAULT 0,
  deal_redemptions    integer       DEFAULT 0,
  event_views         integer       DEFAULT 0,
  event_joins         integer       DEFAULT 0,
  points_generated    integer       DEFAULT 0,
  UNIQUE(merchant_id, date)
);

-- ============================================================
-- TABLE: saved_deals
-- ============================================================
CREATE TABLE IF NOT EXISTS saved_deals (
  user_id   uuid          REFERENCES users(id) NOT NULL,
  deal_id   uuid          REFERENCES deals(id) NOT NULL,
  saved_at  timestamptz   DEFAULT now(),
  PRIMARY KEY(user_id, deal_id)
);

-- ============================================================
-- TABLE: saved_events
-- ============================================================
CREATE TABLE IF NOT EXISTS saved_events (
  user_id   uuid          REFERENCES users(id) NOT NULL,
  event_id  uuid          REFERENCES events(id) NOT NULL,
  saved_at  timestamptz   DEFAULT now(),
  PRIMARY KEY(user_id, event_id)
);

-- ============================================================
-- TABLE: nudges
-- ============================================================
CREATE TABLE IF NOT EXISTS nudges (
  id          uuid          DEFAULT uuid_generate_v4() PRIMARY KEY,
  from_id     uuid          REFERENCES users(id) NOT NULL,
  to_id       uuid          REFERENCES users(id) NOT NULL,
  status      text          DEFAULT 'pending'
                            CHECK (status IN ('pending','accepted','rejected')),
  created_at  timestamptz   DEFAULT now(),
  UNIQUE(from_id, to_id)
);

-- ============================================================
-- TABLE: connections
-- ============================================================
CREATE TABLE IF NOT EXISTS connections (
  id            uuid          DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_a        uuid          REFERENCES users(id) NOT NULL,
  user_b        uuid          REFERENCES users(id) NOT NULL,
  connected_at  timestamptz   DEFAULT now(),
  UNIQUE(user_a, user_b)
);

-- ============================================================
-- TABLE: audit_log
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id            uuid          DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id       uuid          REFERENCES users(id),
  action        text          NOT NULL,
  entity_type   text,
  entity_id     uuid,
  details       jsonb,
  ip_address    inet,
  user_agent    text,
  created_at    timestamptz   DEFAULT now()
);

-- ============================================================
-- TABLE: fraud_flags
-- ============================================================
CREATE TABLE IF NOT EXISTS fraud_flags (
  id            uuid          DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id       uuid          REFERENCES users(id) NOT NULL,
  flag_type     text          NOT NULL,
  details       jsonb,
  created_at    timestamptz   DEFAULT now(),
  resolved      boolean       DEFAULT false,
  resolved_by   uuid          REFERENCES users(id),
  resolved_at   timestamptz
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_users_email          ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_referral_code  ON users(referral_code);
CREATE INDEX IF NOT EXISTS idx_users_role           ON users(role);

CREATE INDEX IF NOT EXISTS idx_vouchers_token       ON vouchers(token);
CREATE INDEX IF NOT EXISTS idx_vouchers_user_id     ON vouchers(user_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_status      ON vouchers(status);

CREATE INDEX IF NOT EXISTS idx_points_tx_user_date  ON points_transactions(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_redemptions_merchant ON redemptions(merchant_id, redeemed_at);

CREATE INDEX IF NOT EXISTS idx_notifications_user   ON notifications(user_id, is_read);

CREATE INDEX IF NOT EXISTS idx_posts_status_date    ON posts(status, created_at);

CREATE INDEX IF NOT EXISTS idx_chat_messages_room   ON chat_messages(room_id, created_at);

CREATE INDEX IF NOT EXISTS idx_analytics_merchant   ON merchant_analytics(merchant_id, date);

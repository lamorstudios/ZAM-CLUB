-- ============================================================
-- ZAM CLUB — Datenbankfunktionen & Trigger
-- File: 03_functions.sql
-- Reihenfolge: nach 01_schema.sql und 02_rls.sql ausführen
-- ============================================================

-- ── Hilfsfunktion: Rolle des aktuellen Auth-Users ────────────
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS text AS $$
  SELECT role FROM users WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── Hilfsfunktion: Initials aus Display Name ─────────────────
CREATE OR REPLACE FUNCTION make_initials(display_name text)
RETURNS text AS $$
DECLARE
  parts text[];
BEGIN
  parts := string_to_array(trim(display_name), ' ');
  IF array_length(parts, 1) >= 2 THEN
    RETURN upper(left(parts[1], 1) || left(parts[2], 1));
  ELSE
    RETURN upper(left(display_name, 2));
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- TRIGGER: Neuer Auth-User → Profil in public.users anlegen
-- ============================================================
CREATE OR REPLACE FUNCTION fn_handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_display_name   text;
  v_username       text;
  v_initials       text;
  v_referral_code  text;
BEGIN
  -- Display Name aus Metadata oder E-Mail
  v_display_name := COALESCE(
    NEW.raw_user_meta_data->>'display_name',
    split_part(NEW.email, '@', 1)
  );

  -- Username bereinigen
  v_username := '@' || lower(regexp_replace(
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    '[^a-z0-9_]', '', 'g'
  ));
  -- Username einmalig machen falls belegt
  WHILE EXISTS (SELECT 1 FROM users WHERE username = v_username) LOOP
    v_username := v_username || floor(random() * 100)::text;
  END LOOP;

  -- Initialen
  v_initials := COALESCE(
    NEW.raw_user_meta_data->>'initials',
    make_initials(v_display_name)
  );

  -- Referral-Code: 'ZAM' + erste 6 Zeichen der UUID ohne Bindestriche
  v_referral_code := 'ZAM' || upper(substring(replace(NEW.id::text, '-', ''), 1, 6));

  -- User-Profil anlegen
  INSERT INTO users (
    id, email, email_verified, display_name, username, initials,
    role, points, tier, referral_code, created_at
  ) VALUES (
    NEW.id, NEW.email, NEW.email_confirmed_at IS NOT NULL,
    v_display_name, v_username, v_initials,
    'user', 50, 'bronze', v_referral_code, now()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Willkommens-Bonus Transaction
  INSERT INTO points_transactions (user_id, amount, balance_after, type, label, created_by)
  VALUES (NEW.id, 50, 50, 'welcome_bonus', '🎉 Willkommen im ZAM Club!', NEW.id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger auf auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION fn_handle_new_user();

-- ============================================================
-- FUNKTION: Punkte vergeben (serverseitig, mit Limits)
-- ============================================================
CREATE OR REPLACE FUNCTION add_points(
  p_user_id      uuid,
  p_amount       integer,
  p_type         text,
  p_label        text,
  p_reference_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_pts   integer;
  v_new_pts       integer;
  v_new_tier      text;
  v_daily_total   integer;
  v_daily_limit   integer := 500;
BEGIN
  -- Tageslimit prüfen (Admin-Anpassungen ausgenommen)
  IF p_type NOT IN ('admin_adjustment', 'welcome_bonus') THEN
    SELECT COALESCE(SUM(amount), 0)
    INTO v_daily_total
    FROM points_transactions
    WHERE user_id = p_user_id
      AND created_at >= date_trunc('day', now())
      AND amount > 0
      AND type NOT IN ('admin_adjustment');

    IF v_daily_total + p_amount > v_daily_limit THEN
      -- Tageslimit erreicht: nur noch den Rest vergeben
      p_amount := GREATEST(0, v_daily_limit - v_daily_total);
      IF p_amount = 0 THEN
        SELECT points INTO v_current_pts FROM users WHERE id = p_user_id;
        RETURN COALESCE(v_current_pts, 0);
      END IF;
    END IF;
  END IF;

  -- Einzelbetrag-Fraud-Check: Beträge über 250 Punkte loggen
  IF p_amount > 250 AND p_type NOT IN ('admin_adjustment', 'challenge_reward', 'season_reward') THEN
    INSERT INTO fraud_flags (user_id, flag_type, details)
    VALUES (p_user_id, 'large_points_award', jsonb_build_object(
      'amount', p_amount, 'type', p_type, 'label', p_label
    ));
  END IF;

  -- Punkte atomar aktualisieren
  UPDATE users
  SET
    points = points + p_amount,
    tier = CASE
      WHEN points + p_amount >= 3000 THEN 'platin'
      WHEN points + p_amount >= 1500 THEN 'gold'
      WHEN points + p_amount >= 500  THEN 'silver'
      ELSE 'bronze'
    END
  WHERE id = p_user_id
  RETURNING points, tier INTO v_new_pts, v_new_tier;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % nicht gefunden', p_user_id;
  END IF;

  -- Transaktion loggen
  INSERT INTO points_transactions (user_id, amount, balance_after, type, label, reference_id, created_by)
  VALUES (p_user_id, p_amount, v_new_pts, p_type, p_label, p_reference_id, p_user_id);

  RETURN v_new_pts;
END;
$$;

-- ============================================================
-- FUNKTION: Voucher einlösen (ATOMAR — Race-Condition-sicher)
-- ============================================================
CREATE OR REPLACE FUNCTION redeem_voucher(
  p_token      uuid,
  p_scanner_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_voucher      vouchers%ROWTYPE;
  v_deal         deals%ROWTYPE;
  v_merchant_id  uuid;
  v_staff_id     uuid;
  v_pts          integer;
  v_user_name    text;
  v_new_pts      integer;
BEGIN
  -- Voucher atomar sperren und validieren
  SELECT * INTO v_voucher
  FROM vouchers
  WHERE token = p_token
    AND status = 'active'
    AND expires_at > now()
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    -- Prüfen ob bereits eingelöst (ohne Lock)
    IF EXISTS (SELECT 1 FROM vouchers WHERE token = p_token AND status = 'redeemed') THEN
      RETURN '{"ok":false,"error":"Dieser Gutschein wurde bereits eingelöst."}'::jsonb;
    END IF;
    IF EXISTS (SELECT 1 FROM vouchers WHERE token = p_token AND status = 'expired') THEN
      RETURN '{"ok":false,"error":"Dieser Gutschein ist abgelaufen."}'::jsonb;
    END IF;
    RETURN '{"ok":false,"error":"Ungültiger Gutschein."}'::jsonb;
  END IF;

  -- Deal laden
  SELECT * INTO v_deal FROM deals WHERE id = v_voucher.deal_id;
  IF NOT FOUND THEN
    RETURN '{"ok":false,"error":"Deal nicht gefunden."}'::jsonb;
  END IF;

  -- Scanner-Berechtigung prüfen
  -- Option A: Scanner ist Händler-Owner
  SELECT m.id INTO v_merchant_id
  FROM merchants m
  WHERE m.user_id = p_scanner_id AND m.id = v_deal.merchant_id AND m.status = 'approved';

  -- Option B: Scanner ist aktiver Mitarbeiter dieses Händlers
  IF v_merchant_id IS NULL THEN
    SELECT ms.id, ms.merchant_id INTO v_staff_id, v_merchant_id
    FROM merchant_staff ms
    WHERE ms.user_id = p_scanner_id
      AND ms.merchant_id = v_deal.merchant_id
      AND ms.status = 'active';
  END IF;

  -- Option C: Scanner ist Admin
  IF v_merchant_id IS NULL AND EXISTS (SELECT 1 FROM users WHERE id = p_scanner_id AND role = 'admin') THEN
    v_merchant_id := v_deal.merchant_id;
  END IF;

  IF v_merchant_id IS NULL THEN
    -- Falscher Händler — loggen aber nicht entwerten
    INSERT INTO redemptions (voucher_id, deal_id, merchant_id, user_id, scanned_by, staff_id, points_awarded, status)
    VALUES (v_voucher.id, v_deal.id, v_deal.merchant_id, v_voucher.user_id, p_scanner_id, v_staff_id, 0, 'wrong_merchant');
    RETURN '{"ok":false,"error":"Dieser Gutschein gehört nicht zu deinem Händler."}'::jsonb;
  END IF;

  -- Voucher entwerten
  UPDATE vouchers
  SET status = 'redeemed', redeemed_at = now(), redeemed_by = p_scanner_id, staff_id = v_staff_id
  WHERE id = v_voucher.id;

  -- Punkte für den Kunden gutschreiben
  v_pts := COALESCE(v_deal.points_reward, 10);
  v_new_pts := add_points(v_voucher.user_id, v_pts, 'deal_redemption',
    '🎉 Deal eingelöst: ' || v_deal.title, v_voucher.id);

  -- Redemption loggen
  INSERT INTO redemptions (voucher_id, deal_id, merchant_id, user_id, scanned_by, staff_id, points_awarded, status)
  VALUES (v_voucher.id, v_deal.id, v_merchant_id, v_voucher.user_id, p_scanner_id, v_staff_id, v_pts, 'ok');

  -- Händler-Analytics aktualisieren (UPSERT)
  INSERT INTO merchant_analytics (merchant_id, date, deal_redemptions, points_generated)
  VALUES (v_merchant_id, current_date, 1, v_pts)
  ON CONFLICT (merchant_id, date)
  DO UPDATE SET
    deal_redemptions = merchant_analytics.deal_redemptions + 1,
    points_generated = merchant_analytics.points_generated + v_pts;

  -- Mitarbeiter-Scan zählen
  IF v_staff_id IS NOT NULL THEN
    UPDATE merchant_staff
    SET total_scans = total_scans + 1, last_scan_at = now()
    WHERE id = v_staff_id;
  END IF;

  -- User-Name für Response
  SELECT display_name INTO v_user_name FROM users WHERE id = v_voucher.user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'points_awarded', v_pts,
    'new_balance', v_new_pts,
    'deal_title', v_deal.title,
    'user_display_name', COALESCE(v_user_name, 'Nutzer')
  );
END;
$$;

-- ============================================================
-- FUNKTION: Voucher generieren (Deal sichern)
-- ============================================================
CREATE OR REPLACE FUNCTION generate_voucher(
  p_deal_id  uuid,
  p_user_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deal       deals%ROWTYPE;
  v_code       text;
  v_voucher    vouchers%ROWTYPE;
BEGIN
  -- Deal validieren
  SELECT * INTO v_deal FROM deals WHERE id = p_deal_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN '{"ok":false,"error":"Deal nicht verfügbar."}'::jsonb;
  END IF;

  -- Ablaufdatum prüfen
  IF v_deal.valid_until IS NOT NULL AND v_deal.valid_until < now() THEN
    RETURN '{"ok":false,"error":"Dieser Deal ist abgelaufen."}'::jsonb;
  END IF;

  -- Max-Redemptions prüfen
  IF v_deal.max_redemptions IS NOT NULL AND v_deal.redemption_count >= v_deal.max_redemptions THEN
    RETURN '{"ok":false,"error":"Deal ist ausgebucht."}'::jsonb;
  END IF;

  -- Prüfen ob User diesen Deal schon gesichert hat
  IF EXISTS (
    SELECT 1 FROM vouchers
    WHERE deal_id = p_deal_id AND user_id = p_user_id AND status IN ('active', 'redeemed')
  ) THEN
    -- Bestehenden Voucher zurückgeben
    SELECT * INTO v_voucher FROM vouchers
    WHERE deal_id = p_deal_id AND user_id = p_user_id AND status IN ('active', 'redeemed')
    LIMIT 1;
    RETURN jsonb_build_object('ok', true, 'already_exists', true,
      'id', v_voucher.id, 'code', v_voucher.code, 'token', v_voucher.token,
      'status', v_voucher.status, 'expires_at', v_voucher.expires_at);
  END IF;

  -- Einmaliger Code generieren
  LOOP
    v_code := 'ZAM-' ||
      upper(substring(md5(random()::text), 1, 4)) || '-' ||
      upper(substring(md5(random()::text), 1, 4));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM vouchers WHERE code = v_code);
  END LOOP;

  -- Voucher anlegen
  INSERT INTO vouchers (deal_id, user_id, code, expires_at)
  VALUES (p_deal_id, p_user_id, v_code, now() + interval '30 days')
  RETURNING * INTO v_voucher;

  RETURN jsonb_build_object(
    'ok', true, 'already_exists', false,
    'id', v_voucher.id, 'code', v_voucher.code,
    'token', v_voucher.token, 'status', v_voucher.status,
    'expires_at', v_voucher.expires_at
  );
END;
$$;

-- ============================================================
-- FUNKTION: Center-Leaderboard
-- ============================================================
CREATE OR REPLACE FUNCTION get_leaderboard(p_period text DEFAULT 'weekly')
RETURNS TABLE (
  merchant_id   uuid,
  shop_name     text,
  logo_url      text,
  points_total  bigint,
  redemptions   bigint,
  rank          bigint
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    ma.merchant_id,
    m.shop_name,
    m.logo_url,
    SUM(ma.points_generated) AS points_total,
    SUM(ma.deal_redemptions) AS redemptions,
    ROW_NUMBER() OVER (ORDER BY SUM(ma.points_generated) DESC) AS rank
  FROM merchant_analytics ma
  JOIN merchants m ON m.id = ma.merchant_id
  WHERE
    CASE p_period
      WHEN 'daily'   THEN ma.date = current_date
      WHEN 'weekly'  THEN ma.date >= date_trunc('week', current_date)
      WHEN 'monthly' THEN ma.date >= date_trunc('month', current_date)
      ELSE ma.date >= date_trunc('week', current_date)
    END
  GROUP BY ma.merchant_id, m.shop_name, m.logo_url
  ORDER BY points_total DESC
  LIMIT 10;
$$;

-- ============================================================
-- TRIGGER: Tier automatisch aktualisieren bei Punkte-Änderung
-- ============================================================
CREATE OR REPLACE FUNCTION fn_update_tier()
RETURNS trigger AS $$
BEGIN
  NEW.tier := CASE
    WHEN NEW.points >= 3000 THEN 'platin'
    WHEN NEW.points >= 1500 THEN 'gold'
    WHEN NEW.points >= 500  THEN 'silver'
    ELSE 'bronze'
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_tier ON users;
CREATE TRIGGER trg_update_tier
  BEFORE UPDATE OF points ON users
  FOR EACH ROW EXECUTE FUNCTION fn_update_tier();

-- ============================================================
-- FUNKTION: Täglicher Spin (1x pro Tag)
-- ============================================================
CREATE OR REPLACE FUNCTION record_spin(
  p_user_id   uuid,
  p_result    text,
  p_points    integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_pts integer;
BEGIN
  -- Prüfen ob heute schon gespin
  IF EXISTS (
    SELECT 1 FROM spin_history
    WHERE user_id = p_user_id AND date_trunc('day', spun_at) = date_trunc('day', now())
  ) THEN
    RETURN '{"ok":false,"error":"Heute bereits gedreht."}'::jsonb;
  END IF;

  INSERT INTO spin_history (user_id, result, points_won) VALUES (p_user_id, p_result, p_points);

  IF p_points > 0 THEN
    v_new_pts := add_points(p_user_id, p_points, 'spin', '🎰 Glücksrad: ' || p_result);
  END IF;

  RETURN jsonb_build_object('ok', true, 'points_won', p_points, 'new_balance', COALESCE(v_new_pts, 0));
END;
$$;

-- ============================================================
-- ZAM CLUB — PostgreSQL Functions & Triggers
-- File: 03_functions.sql
-- ============================================================

-- ============================================================
-- 1. fn_handle_new_user()
--    Trigger function: fires AFTER INSERT ON auth.users
--    Creates a corresponding row in public.users with defaults,
--    assigns a welcome points bonus, and generates a referral code.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_display_name  text;
  v_username      text;
  v_username_base text;
  v_initials      text;
  v_referral_code text;
  v_words         text[];
  v_initial_a     text;
  v_initial_b     text;
BEGIN
  -- Derive display_name from metadata or email prefix
  v_display_name := COALESCE(
    NEW.raw_user_meta_data->>'display_name',
    split_part(NEW.email, '@', 1)
  );

  -- Derive username base from metadata or email prefix, then sanitize
  v_username_base := lower(
    regexp_replace(
      COALESCE(
        NEW.raw_user_meta_data->>'username',
        split_part(NEW.email, '@', 1)
      ),
      '[^a-z0-9_]',
      '',
      'g'
    )
  );

  -- Ensure username is not empty after sanitization
  IF v_username_base = '' OR v_username_base IS NULL THEN
    v_username_base := 'user' || lower(substring(NEW.id::text, 1, 6));
  END IF;

  v_username := '@' || v_username_base;

  -- If username already exists, append short uid suffix
  IF EXISTS (SELECT 1 FROM public.users WHERE username = v_username) THEN
    v_username := '@' || v_username_base || lower(substring(NEW.id::text, 1, 4));
  END IF;

  -- Derive initials from first two words of display_name
  v_words     := string_to_array(trim(v_display_name), ' ');
  v_initial_a := upper(substring(v_words[1], 1, 1));
  IF array_length(v_words, 1) >= 2 THEN
    v_initial_b := upper(substring(v_words[2], 1, 1));
  ELSE
    v_initial_b := '';
  END IF;
  v_initials := v_initial_a || v_initial_b;

  -- Generate referral code: 'ZAM' + first 6 chars of UUID (uppercased)
  v_referral_code := 'ZAM' || upper(substring(NEW.id::text, 1, 6));

  -- Insert into public.users
  INSERT INTO public.users (
    id,
    email,
    email_verified,
    display_name,
    username,
    initials,
    role,
    points,
    tier,
    referral_code,
    created_at
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.email_confirmed_at IS NOT NULL, false),
    v_display_name,
    v_username,
    v_initials,
    'user',
    50,
    'bronze',
    v_referral_code,
    now()
  );

  -- Insert welcome points transaction
  INSERT INTO public.points_transactions (
    user_id,
    amount,
    balance_after,
    type,
    label,
    created_at
  ) VALUES (
    NEW.id,
    50,
    50,
    'welcome_bonus',
    'Willkommen im ZAM Club!',
    now()
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION fn_handle_new_user();

-- ============================================================
-- 2. add_points(p_user_id, p_amount, p_type, p_label, p_reference_id)
--    Atomically adds points, updates tier, enforces daily cap,
--    logs fraud for large single grants, records transaction.
--    Returns new balance as integer.
-- ============================================================
CREATE OR REPLACE FUNCTION add_points(
  p_user_id       uuid,
  p_amount        integer,
  p_type          text,
  p_label         text,
  p_reference_id  uuid DEFAULT NULL
)
RETURNS integer AS $$
DECLARE
  v_current_balance  integer;
  v_new_balance      integer;
  v_daily_total      integer;
  v_new_tier         text;
BEGIN
  -- Get current balance with row lock
  SELECT points INTO v_current_balance
  FROM public.users
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found', p_user_id;
  END IF;

  -- Daily limit check: sum of points earned today
  SELECT COALESCE(SUM(amount), 0) INTO v_daily_total
  FROM public.points_transactions
  WHERE user_id   = p_user_id
    AND created_at >= date_trunc('day', now())
    AND amount     > 0;

  IF v_daily_total >= 500 THEN
    -- Daily cap reached; return current balance without adding
    RETURN v_current_balance;
  END IF;

  -- Fraud check: single grant over 250 points
  IF p_amount > 250 THEN
    INSERT INTO public.fraud_flags (
      user_id,
      flag_type,
      details,
      created_at
    ) VALUES (
      p_user_id,
      'large_single_grant',
      jsonb_build_object(
        'amount',       p_amount,
        'type',         p_type,
        'reference_id', p_reference_id,
        'label',        p_label
      ),
      now()
    );
  END IF;

  -- Calculate new balance
  v_new_balance := v_current_balance + p_amount;

  -- Determine new tier
  v_new_tier := CASE
    WHEN v_new_balance >= 3000 THEN 'platin'
    WHEN v_new_balance >= 1500 THEN 'gold'
    WHEN v_new_balance >= 500  THEN 'silver'
    ELSE 'bronze'
  END;

  -- Atomic update of points and tier
  UPDATE public.users
  SET
    points = v_new_balance,
    tier   = v_new_tier
  WHERE id = p_user_id;

  -- Record the points transaction
  INSERT INTO public.points_transactions (
    user_id,
    amount,
    balance_after,
    type,
    reference_id,
    label,
    created_at
  ) VALUES (
    p_user_id,
    p_amount,
    v_new_balance,
    p_type,
    p_reference_id,
    p_label,
    now()
  );

  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 3. redeem_voucher(p_token, p_scanner_id)
--    Validates a voucher by QR token, checks scanner authorization,
--    updates voucher status, inserts redemption record, awards points,
--    updates merchant analytics.
--    Returns jsonb result object.
-- ============================================================
CREATE OR REPLACE FUNCTION redeem_voucher(
  p_token      uuid,
  p_scanner_id uuid
)
RETURNS jsonb AS $$
DECLARE
  v_voucher   public.vouchers%ROWTYPE;
  v_deal      public.deals%ROWTYPE;
  v_merchant  public.merchants%ROWTYPE;
  v_staff     public.merchant_staff%ROWTYPE;
  v_user      public.users%ROWTYPE;
  v_is_owner  boolean := false;
  v_is_staff  boolean := false;
  v_new_balance integer;
  v_staff_id  uuid    := NULL;
BEGIN
  -- Fetch voucher by token with row lock (skip if already locked)
  SELECT * INTO v_voucher
  FROM public.vouchers
  WHERE token     = p_token
    AND status    = 'active'
    AND expires_at > now()
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'error', 'Ungültiger oder bereits eingelöster Gutschein'
    );
  END IF;

  -- Get the deal associated with this voucher
  SELECT * INTO v_deal
  FROM public.deals
  WHERE id = v_voucher.deal_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'error', 'Deal nicht gefunden'
    );
  END IF;

  -- Get the merchant for this deal
  SELECT * INTO v_merchant
  FROM public.merchants
  WHERE id = v_deal.merchant_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'error', 'Merchant nicht gefunden'
    );
  END IF;

  -- Check if scanner is the merchant owner
  IF v_merchant.user_id = p_scanner_id THEN
    v_is_owner := true;
  END IF;

  -- Check if scanner is an active staff member of this merchant
  IF NOT v_is_owner THEN
    SELECT * INTO v_staff
    FROM public.merchant_staff
    WHERE user_id    = p_scanner_id
      AND merchant_id = v_merchant.id
      AND status      = 'active';

    IF FOUND THEN
      v_is_staff := true;
      v_staff_id := v_staff.id;
    END IF;
  END IF;

  -- If neither owner nor authorized staff, reject
  IF NOT v_is_owner AND NOT v_is_staff THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'error', 'Falscher Merchant oder keine Berechtigung zum Scannen'
    );
  END IF;

  -- Get the voucher owner (customer) for display name
  SELECT * INTO v_user
  FROM public.users
  WHERE id = v_voucher.user_id;

  -- Mark voucher as redeemed
  UPDATE public.vouchers
  SET
    status      = 'redeemed',
    redeemed_at = now(),
    redeemed_by = p_scanner_id,
    staff_id    = v_staff_id
  WHERE id = v_voucher.id;

  -- Insert redemption record
  INSERT INTO public.redemptions (
    voucher_id,
    deal_id,
    merchant_id,
    user_id,
    scanned_by,
    staff_id,
    points_awarded,
    status,
    redeemed_at
  ) VALUES (
    v_voucher.id,
    v_deal.id,
    v_merchant.id,
    v_voucher.user_id,
    p_scanner_id,
    v_staff_id,
    v_deal.points_reward,
    'ok',
    now()
  );

  -- Increment deal redemption counter
  UPDATE public.deals
  SET redemption_count = redemption_count + 1
  WHERE id = v_deal.id;

  -- Update staff scan stats if applicable
  IF v_staff_id IS NOT NULL THEN
    UPDATE public.merchant_staff
    SET
      last_scan_at = now(),
      total_scans  = total_scans + 1
    WHERE id = v_staff_id;
  END IF;

  -- Award points to the customer (voucher owner)
  v_new_balance := add_points(
    v_voucher.user_id,
    v_deal.points_reward,
    'deal_redemption',
    'Deal eingelöst: ' || v_deal.title,
    v_deal.id
  );

  -- Update merchant analytics via UPSERT
  INSERT INTO public.merchant_analytics (
    merchant_id,
    date,
    deal_redemptions,
    points_generated
  ) VALUES (
    v_merchant.id,
    current_date,
    1,
    v_deal.points_reward
  )
  ON CONFLICT (merchant_id, date) DO UPDATE
  SET
    deal_redemptions = merchant_analytics.deal_redemptions + 1,
    points_generated = merchant_analytics.points_generated + v_deal.points_reward;

  -- Return success response
  RETURN jsonb_build_object(
    'ok',                true,
    'points_awarded',    v_deal.points_reward,
    'deal_title',        v_deal.title,
    'user_display_name', v_user.display_name
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. generate_voucher(p_deal_id, p_user_id)
--    Validates eligibility, generates a unique voucher code,
--    and inserts it with a 30-day expiry.
--    Returns voucher record as jsonb.
-- ============================================================
CREATE OR REPLACE FUNCTION generate_voucher(
  p_deal_id uuid,
  p_user_id uuid
)
RETURNS jsonb AS $$
DECLARE
  v_deal       public.deals%ROWTYPE;
  v_code       text;
  v_voucher_id uuid;
  v_token      uuid;
  v_expires_at timestamptz;
BEGIN
  -- Fetch and validate deal
  SELECT * INTO v_deal
  FROM public.deals
  WHERE id = p_deal_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'error', 'Deal nicht gefunden'
    );
  END IF;

  -- Check deal is active
  IF v_deal.is_active = false THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'error', 'Dieser Deal ist nicht mehr verfügbar'
    );
  END IF;

  -- Check deal has not expired
  IF v_deal.valid_until IS NOT NULL AND v_deal.valid_until < now() THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'error', 'Dieser Deal ist abgelaufen'
    );
  END IF;

  -- Check max_redemptions not exceeded
  IF v_deal.max_redemptions IS NOT NULL
     AND v_deal.redemption_count >= v_deal.max_redemptions THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'error', 'Maximale Einlösungen für diesen Deal erreicht'
    );
  END IF;

  -- Check user does not already have an active or redeemed voucher for this deal
  IF EXISTS (
    SELECT 1 FROM public.vouchers
    WHERE deal_id = p_deal_id
      AND user_id = p_user_id
      AND status IN ('active', 'redeemed')
  ) THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'error', 'Du hast diesen Deal bereits gesichert oder eingelöst'
    );
  END IF;

  -- Generate unique voucher code: 'ZAM-XXXX-XXXX'
  v_code := 'ZAM-'
    || upper(substring(md5(random()::text), 1, 4))
    || '-'
    || upper(substring(md5(random()::text), 1, 4));

  -- Ensure code uniqueness (retry once on collision)
  IF EXISTS (SELECT 1 FROM public.vouchers WHERE code = v_code) THEN
    v_code := 'ZAM-'
      || upper(substring(md5(random()::text), 1, 4))
      || '-'
      || upper(substring(md5(random()::text), 1, 4));
  END IF;

  v_expires_at := now() + interval '30 days';
  v_voucher_id := uuid_generate_v4();
  v_token      := uuid_generate_v4();

  -- Insert the voucher
  INSERT INTO public.vouchers (
    id,
    deal_id,
    user_id,
    code,
    token,
    status,
    secured_at,
    expires_at
  ) VALUES (
    v_voucher_id,
    p_deal_id,
    p_user_id,
    v_code,
    v_token,
    'active',
    now(),
    v_expires_at
  );

  -- Return voucher as jsonb
  RETURN jsonb_build_object(
    'ok',         true,
    'voucher_id', v_voucher_id,
    'deal_id',    p_deal_id,
    'user_id',    p_user_id,
    'code',       v_code,
    'token',      v_token,
    'status',     'active',
    'secured_at', now(),
    'expires_at', v_expires_at
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 5. fn_update_tier()
--    Trigger function: fires BEFORE UPDATE OF points ON users.
--    Recalculates and sets tier based on the incoming new points value.
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

-- Attach tier update trigger to users table
DROP TRIGGER IF EXISTS trg_update_tier ON public.users;
CREATE TRIGGER trg_update_tier
  BEFORE UPDATE OF points ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_tier();

-- ============================================================
-- 6. get_leaderboard(p_period)
--    Returns top 10 merchants by points_generated in the given
--    period: 'today', 'weekly', or 'monthly'.
--    Joins merchant_analytics with merchants for shop_name.
-- ============================================================
CREATE OR REPLACE FUNCTION get_leaderboard(p_period text DEFAULT 'weekly')
RETURNS TABLE (
  rank             bigint,
  merchant_id      uuid,
  shop_name        text,
  logo_url         text,
  category         text,
  points_generated bigint,
  deal_redemptions bigint
) AS $$
DECLARE
  v_from_date date;
BEGIN
  -- Determine date range based on period
  CASE p_period
    WHEN 'today' THEN
      v_from_date := current_date;
    WHEN 'weekly' THEN
      v_from_date := date_trunc('week', current_date)::date;
    WHEN 'monthly' THEN
      v_from_date := date_trunc('month', current_date)::date;
    ELSE
      v_from_date := date_trunc('week', current_date)::date;
  END CASE;

  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY SUM(ma.points_generated) DESC) AS rank,
    m.id                                                        AS merchant_id,
    m.shop_name,
    m.logo_url,
    m.category,
    SUM(ma.points_generated)::bigint                            AS points_generated,
    SUM(ma.deal_redemptions)::bigint                            AS deal_redemptions
  FROM public.merchant_analytics ma
  JOIN public.merchants m ON m.id = ma.merchant_id
  WHERE ma.date   >= v_from_date
    AND m.status   = 'approved'
  GROUP BY m.id, m.shop_name, m.logo_url, m.category
  ORDER BY points_generated DESC
  LIMIT 10;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

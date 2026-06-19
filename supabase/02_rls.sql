-- ============================================================
-- ZAM CLUB — Row Level Security Policies
-- File: 02_rls.sql
-- ============================================================

-- ============================================================
-- HELPER FUNCTION: get_user_role()
-- ============================================================
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS text AS $$
  SELECT role FROM users WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchants           ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_staff      ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals               ENABLE ROW LEVEL SECURITY;
ALTER TABLE vouchers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE redemptions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE points_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals           ENABLE ROW LEVEL SECURITY;
ALTER TABLE events              ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_participants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenges          ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_progress  ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications       ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens         ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_rooms          ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE spin_history        ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkins            ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_analytics  ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_deals         ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE nudges              ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections         ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log           ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_flags         ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- POLICIES: users
-- ============================================================

-- SELECT: own row OR admin/centerManagement
CREATE POLICY users_select_own
  ON users FOR SELECT
  USING (
    id = auth.uid()
    OR get_user_role() IN ('admin', 'centerManagement')
  );

-- UPDATE: own row (restricted columns enforced at app/function level);
--         admin can update any row
CREATE POLICY users_update_own
  ON users FOR UPDATE
  USING (
    id = auth.uid()
    OR get_user_role() = 'admin'
  )
  WITH CHECK (
    id = auth.uid()
    OR get_user_role() = 'admin'
  );

-- No INSERT policy: handled by fn_handle_new_user trigger
-- No DELETE policy: regular users cannot delete; admin deletes via service role

-- ============================================================
-- POLICIES: merchants
-- ============================================================

-- SELECT: authenticated users see approved merchants; admin/centerManagement see all
CREATE POLICY merchants_select_approved
  ON merchants FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      status = 'approved'
      OR user_id = auth.uid()
      OR get_user_role() IN ('admin', 'centerManagement')
    )
  );

-- INSERT: only role='merchant' creating their own record
CREATE POLICY merchants_insert_own
  ON merchants FOR INSERT
  WITH CHECK (
    get_user_role() = 'merchant'
    AND user_id = auth.uid()
  );

-- UPDATE: merchant owner or admin
CREATE POLICY merchants_update_own
  ON merchants FOR UPDATE
  USING (
    user_id = auth.uid()
    OR get_user_role() = 'admin'
  )
  WITH CHECK (
    user_id = auth.uid()
    OR get_user_role() = 'admin'
  );

-- No DELETE policy

-- ============================================================
-- POLICIES: merchant_staff
-- ============================================================

-- SELECT: merchant owner, the staff member themselves, or admin
CREATE POLICY merchant_staff_select
  ON merchant_staff FOR SELECT
  USING (
    user_id = auth.uid()
    OR get_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM merchants m
      WHERE m.id = merchant_staff.merchant_id
        AND m.user_id = auth.uid()
    )
  );

-- INSERT: merchant owner only
CREATE POLICY merchant_staff_insert
  ON merchant_staff FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM merchants m
      WHERE m.id = merchant_staff.merchant_id
        AND m.user_id = auth.uid()
    )
  );

-- UPDATE: merchant owner or admin
CREATE POLICY merchant_staff_update
  ON merchant_staff FOR UPDATE
  USING (
    get_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM merchants m
      WHERE m.id = merchant_staff.merchant_id
        AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    get_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM merchants m
      WHERE m.id = merchant_staff.merchant_id
        AND m.user_id = auth.uid()
    )
  );

-- DELETE: merchant owner or admin
CREATE POLICY merchant_staff_delete
  ON merchant_staff FOR DELETE
  USING (
    get_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM merchants m
      WHERE m.id = merchant_staff.merchant_id
        AND m.user_id = auth.uid()
    )
  );

-- ============================================================
-- POLICIES: deals
-- ============================================================

-- SELECT: active deals visible to all authenticated; merchant sees own; admin sees all
CREATE POLICY deals_select
  ON deals FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      is_active = true
      OR get_user_role() = 'admin'
      OR EXISTS (
        SELECT 1 FROM merchants m
        WHERE m.id = deals.merchant_id
          AND m.user_id = auth.uid()
      )
    )
  );

-- INSERT: merchant owner of the referenced merchant_id
CREATE POLICY deals_insert
  ON deals FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM merchants m
      WHERE m.id = deals.merchant_id
        AND m.user_id = auth.uid()
    )
  );

-- UPDATE: merchant owner or admin
CREATE POLICY deals_update
  ON deals FOR UPDATE
  USING (
    get_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM merchants m
      WHERE m.id = deals.merchant_id
        AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    get_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM merchants m
      WHERE m.id = deals.merchant_id
        AND m.user_id = auth.uid()
    )
  );

-- No DELETE policy

-- ============================================================
-- POLICIES: vouchers
-- ============================================================

-- SELECT: user sees own; merchant sees vouchers for their deals; admin sees all
CREATE POLICY vouchers_select
  ON vouchers FOR SELECT
  USING (
    user_id = auth.uid()
    OR get_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM deals d
      JOIN merchants m ON m.id = d.merchant_id
      WHERE d.id = vouchers.deal_id
        AND m.user_id = auth.uid()
    )
  );

-- INSERT: any authenticated user can secure a deal
CREATE POLICY vouchers_insert
  ON vouchers FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  );

-- UPDATE: only via RPC function redeem_voucher (SECURITY DEFINER bypasses RLS)
-- Direct updates are not allowed for regular users
CREATE POLICY vouchers_update_admin_only
  ON vouchers FOR UPDATE
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- No DELETE policy

-- ============================================================
-- POLICIES: redemptions
-- ============================================================

-- SELECT: user sees own; merchant sees their merchant's; admin sees all
CREATE POLICY redemptions_select
  ON redemptions FOR SELECT
  USING (
    user_id = auth.uid()
    OR get_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM merchants m
      WHERE m.id = redemptions.merchant_id
        AND m.user_id = auth.uid()
    )
  );

-- INSERT: only via RPC (SECURITY DEFINER function handles this)
-- No direct INSERT allowed for non-admin
CREATE POLICY redemptions_insert_admin_only
  ON redemptions FOR INSERT
  WITH CHECK (get_user_role() = 'admin');

-- No UPDATE, No DELETE

-- ============================================================
-- POLICIES: points_transactions
-- ============================================================

-- SELECT: user sees own; admin sees all
CREATE POLICY points_tx_select
  ON points_transactions FOR SELECT
  USING (
    user_id = auth.uid()
    OR get_user_role() = 'admin'
  );

-- INSERT: only via RPC add_points (SECURITY DEFINER)
-- No direct INSERT allowed for non-admin
CREATE POLICY points_tx_insert_admin_only
  ON points_transactions FOR INSERT
  WITH CHECK (get_user_role() = 'admin');

-- No UPDATE, No DELETE

-- ============================================================
-- POLICIES: referrals
-- ============================================================

-- SELECT: referrer or referred user, or admin
CREATE POLICY referrals_select
  ON referrals FOR SELECT
  USING (
    referrer_id = auth.uid()
    OR referred_id = auth.uid()
    OR get_user_role() = 'admin'
  );

-- INSERT: authenticated users
CREATE POLICY referrals_insert
  ON referrals FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- No UPDATE, No DELETE for regular users

-- ============================================================
-- POLICIES: events
-- ============================================================

-- SELECT: approved/active events visible to all authenticated; merchant sees own; admin sees all
CREATE POLICY events_select
  ON events FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      (status = 'approved' AND is_active = true)
      OR get_user_role() IN ('admin', 'centerManagement')
      OR (
        merchant_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM merchants m
          WHERE m.id = events.merchant_id
            AND m.user_id = auth.uid()
        )
      )
    )
  );

-- INSERT: merchant owner or centerManagement/admin
CREATE POLICY events_insert
  ON events FOR INSERT
  WITH CHECK (
    get_user_role() IN ('admin', 'centerManagement')
    OR (
      merchant_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM merchants m
        WHERE m.id = events.merchant_id
          AND m.user_id = auth.uid()
      )
    )
  );

-- UPDATE: merchant owner, centerManagement, or admin
CREATE POLICY events_update
  ON events FOR UPDATE
  USING (
    get_user_role() IN ('admin', 'centerManagement')
    OR (
      merchant_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM merchants m
        WHERE m.id = events.merchant_id
          AND m.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    get_user_role() IN ('admin', 'centerManagement')
    OR (
      merchant_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM merchants m
        WHERE m.id = events.merchant_id
          AND m.user_id = auth.uid()
      )
    )
  );

-- ============================================================
-- POLICIES: event_participants
-- ============================================================

-- SELECT: own rows; admin/centerManagement see all; merchant sees for their events
CREATE POLICY event_participants_select
  ON event_participants FOR SELECT
  USING (
    user_id = auth.uid()
    OR get_user_role() IN ('admin', 'centerManagement')
    OR EXISTS (
      SELECT 1 FROM events e
      JOIN merchants m ON m.id = e.merchant_id
      WHERE e.id = event_participants.event_id
        AND m.user_id = auth.uid()
    )
  );

-- INSERT: authenticated users registering themselves
CREATE POLICY event_participants_insert
  ON event_participants FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  );

-- UPDATE: own record (status change) or admin
CREATE POLICY event_participants_update
  ON event_participants FOR UPDATE
  USING (
    user_id = auth.uid()
    OR get_user_role() = 'admin'
  )
  WITH CHECK (
    user_id = auth.uid()
    OR get_user_role() = 'admin'
  );

-- ============================================================
-- POLICIES: challenges
-- ============================================================

-- SELECT: all authenticated users see active challenges; admin sees all
CREATE POLICY challenges_select
  ON challenges FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (is_active = true OR get_user_role() = 'admin')
  );

-- INSERT/UPDATE: admin only
CREATE POLICY challenges_insert_admin
  ON challenges FOR INSERT
  WITH CHECK (get_user_role() = 'admin');

CREATE POLICY challenges_update_admin
  ON challenges FOR UPDATE
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- ============================================================
-- POLICIES: challenge_progress
-- ============================================================

-- SELECT: own progress; admin sees all
CREATE POLICY challenge_progress_select
  ON challenge_progress FOR SELECT
  USING (
    user_id = auth.uid()
    OR get_user_role() = 'admin'
  );

-- INSERT: authenticated users (their own progress)
CREATE POLICY challenge_progress_insert
  ON challenge_progress FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  );

-- UPDATE: own progress or admin
CREATE POLICY challenge_progress_update
  ON challenge_progress FOR UPDATE
  USING (
    user_id = auth.uid()
    OR get_user_role() = 'admin'
  )
  WITH CHECK (
    user_id = auth.uid()
    OR get_user_role() = 'admin'
  );

-- ============================================================
-- POLICIES: notifications
-- ============================================================

-- SELECT: user sees own
CREATE POLICY notifications_select_own
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

-- UPDATE: user can mark own as read (is_read = true)
CREATE POLICY notifications_update_own
  ON notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- No direct INSERT (via backend/service role)
-- No DELETE

-- ============================================================
-- POLICIES: push_tokens
-- ============================================================

-- SELECT: own tokens; admin sees all
CREATE POLICY push_tokens_select
  ON push_tokens FOR SELECT
  USING (
    user_id = auth.uid()
    OR get_user_role() = 'admin'
  );

-- INSERT: own tokens
CREATE POLICY push_tokens_insert
  ON push_tokens FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  );

-- UPDATE: own tokens (e.g., refresh)
CREATE POLICY push_tokens_update
  ON push_tokens FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE: own tokens (logout/deregister)
CREATE POLICY push_tokens_delete
  ON push_tokens FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================
-- POLICIES: posts
-- ============================================================

-- SELECT: approved posts for all; own posts for author; admin sees all
CREATE POLICY posts_select
  ON posts FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      status = 'approved'
      OR user_id = auth.uid()
      OR get_user_role() = 'admin'
    )
  );

-- INSERT: authenticated users
CREATE POLICY posts_insert
  ON posts FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  );

-- UPDATE: own posts (content); admin can update status
CREATE POLICY posts_update
  ON posts FOR UPDATE
  USING (
    user_id = auth.uid()
    OR get_user_role() = 'admin'
  )
  WITH CHECK (
    user_id = auth.uid()
    OR get_user_role() = 'admin'
  );

-- DELETE: own posts or admin
CREATE POLICY posts_delete
  ON posts FOR DELETE
  USING (
    user_id = auth.uid()
    OR get_user_role() = 'admin'
  );

-- ============================================================
-- POLICIES: post_likes
-- ============================================================

-- SELECT: all authenticated
CREATE POLICY post_likes_select
  ON post_likes FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- INSERT: own likes only
CREATE POLICY post_likes_insert
  ON post_likes FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  );

-- DELETE: own likes only
CREATE POLICY post_likes_delete
  ON post_likes FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================
-- POLICIES: comments
-- ============================================================

-- SELECT: all authenticated users see non-deleted comments
CREATE POLICY comments_select
  ON comments FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (is_deleted = false OR user_id = auth.uid() OR get_user_role() = 'admin')
  );

-- INSERT: authenticated users
CREATE POLICY comments_insert
  ON comments FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  );

-- UPDATE: own comments or admin (soft-delete / edit)
CREATE POLICY comments_update
  ON comments FOR UPDATE
  USING (
    user_id = auth.uid()
    OR get_user_role() = 'admin'
  )
  WITH CHECK (
    user_id = auth.uid()
    OR get_user_role() = 'admin'
  );

-- ============================================================
-- POLICIES: chat_rooms
-- ============================================================

-- SELECT: all authenticated users can read chat rooms
CREATE POLICY chat_rooms_select
  ON chat_rooms FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- INSERT: admin/centerManagement only
CREATE POLICY chat_rooms_insert
  ON chat_rooms FOR INSERT
  WITH CHECK (get_user_role() IN ('admin', 'centerManagement'));

-- ============================================================
-- POLICIES: chat_messages
-- ============================================================

-- SELECT: authenticated users in room (all global rooms readable)
CREATE POLICY chat_messages_select
  ON chat_messages FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- INSERT: authenticated users
CREATE POLICY chat_messages_insert
  ON chat_messages FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  );

-- UPDATE: soft-delete (is_deleted=true) by message owner or admin
CREATE POLICY chat_messages_update
  ON chat_messages FOR UPDATE
  USING (
    user_id = auth.uid()
    OR get_user_role() = 'admin'
  )
  WITH CHECK (
    user_id = auth.uid()
    OR get_user_role() = 'admin'
  );

-- ============================================================
-- POLICIES: spin_history
-- ============================================================

-- SELECT: own rows
CREATE POLICY spin_history_select
  ON spin_history FOR SELECT
  USING (
    user_id = auth.uid()
    OR get_user_role() = 'admin'
  );

-- INSERT: authenticated users
CREATE POLICY spin_history_insert
  ON spin_history FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  );

-- ============================================================
-- POLICIES: checkins
-- ============================================================

-- SELECT: own; admin sees all; merchant sees checkins to their merchant
CREATE POLICY checkins_select
  ON checkins FOR SELECT
  USING (
    user_id = auth.uid()
    OR get_user_role() = 'admin'
    OR (
      merchant_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM merchants m
        WHERE m.id = checkins.merchant_id
          AND m.user_id = auth.uid()
      )
    )
  );

-- INSERT: authenticated users
CREATE POLICY checkins_insert
  ON checkins FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  );

-- ============================================================
-- POLICIES: merchant_analytics
-- ============================================================

-- SELECT: merchant sees own; admin/centerManagement see all
CREATE POLICY merchant_analytics_select
  ON merchant_analytics FOR SELECT
  USING (
    get_user_role() IN ('admin', 'centerManagement')
    OR EXISTS (
      SELECT 1 FROM merchants m
      WHERE m.id = merchant_analytics.merchant_id
        AND m.user_id = auth.uid()
    )
  );

-- INSERT/UPDATE: via service role / SECURITY DEFINER functions only
CREATE POLICY merchant_analytics_insert_admin
  ON merchant_analytics FOR INSERT
  WITH CHECK (get_user_role() = 'admin');

CREATE POLICY merchant_analytics_update_admin
  ON merchant_analytics FOR UPDATE
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- ============================================================
-- POLICIES: saved_deals
-- ============================================================

-- SELECT: own rows
CREATE POLICY saved_deals_select
  ON saved_deals FOR SELECT
  USING (user_id = auth.uid());

-- INSERT: own rows
CREATE POLICY saved_deals_insert
  ON saved_deals FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  );

-- DELETE: own rows
CREATE POLICY saved_deals_delete
  ON saved_deals FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================
-- POLICIES: saved_events
-- ============================================================

-- SELECT: own rows
CREATE POLICY saved_events_select
  ON saved_events FOR SELECT
  USING (user_id = auth.uid());

-- INSERT: own rows
CREATE POLICY saved_events_insert
  ON saved_events FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  );

-- DELETE: own rows
CREATE POLICY saved_events_delete
  ON saved_events FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================
-- POLICIES: nudges
-- ============================================================

-- SELECT: sender or recipient; admin sees all
CREATE POLICY nudges_select
  ON nudges FOR SELECT
  USING (
    from_id = auth.uid()
    OR to_id = auth.uid()
    OR get_user_role() = 'admin'
  );

-- INSERT: authenticated users sending to others
CREATE POLICY nudges_insert
  ON nudges FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND from_id = auth.uid()
    AND from_id <> to_id
  );

-- UPDATE: recipient can accept/reject; admin can update any
CREATE POLICY nudges_update
  ON nudges FOR UPDATE
  USING (
    to_id = auth.uid()
    OR get_user_role() = 'admin'
  )
  WITH CHECK (
    to_id = auth.uid()
    OR get_user_role() = 'admin'
  );

-- ============================================================
-- POLICIES: connections
-- ============================================================

-- SELECT: either user in the connection; admin sees all
CREATE POLICY connections_select
  ON connections FOR SELECT
  USING (
    user_a = auth.uid()
    OR user_b = auth.uid()
    OR get_user_role() = 'admin'
  );

-- INSERT: authenticated users (creating connection between themselves and another)
CREATE POLICY connections_insert
  ON connections FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (user_a = auth.uid() OR user_b = auth.uid())
  );

-- DELETE: either user in the connection; admin
CREATE POLICY connections_delete
  ON connections FOR DELETE
  USING (
    user_a = auth.uid()
    OR user_b = auth.uid()
    OR get_user_role() = 'admin'
  );

-- ============================================================
-- POLICIES: audit_log
-- ============================================================

-- SELECT: admin only
CREATE POLICY audit_log_select
  ON audit_log FOR SELECT
  USING (get_user_role() = 'admin');

-- INSERT: via service role only (no authenticated user INSERT policy)
-- Service role bypasses RLS by default

-- ============================================================
-- POLICIES: fraud_flags
-- ============================================================

-- SELECT: admin only
CREATE POLICY fraud_flags_select
  ON fraud_flags FOR SELECT
  USING (get_user_role() = 'admin');

-- UPDATE: admin only (to resolve flags)
CREATE POLICY fraud_flags_update
  ON fraud_flags FOR UPDATE
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- INSERT: via service role only

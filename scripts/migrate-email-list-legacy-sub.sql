-- Security audit 2026-09-28, items 1 + 5. Idempotent; safe on every deploy.

-- ── Item 5: schema drift ────────────────────────────────────────────────────
-- email_list.subscription_type / subscription_expires_at are read and written
-- by admin/free-account, auth/session, auth/signup, upload-count and the
-- player dashboard, but no migration ever created them (prod has them from a
-- hand-run ALTER). A fresh database 500'd on signup. No-op where they exist.
ALTER TABLE email_list ADD COLUMN IF NOT EXISTS subscription_type VARCHAR(50);
ALTER TABLE email_list ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;

-- ── Item 1: one-time ownership backfill ─────────────────────────────────────
-- Player read paths (dashboard, /api/submissions, /api/my/submissions, notes)
-- and delete-account used to treat `submissions.email = the player's email` as
-- ownership. They now use user_id only. A legacy anonymous upload that was
-- matched ONLY by email would drop off its owner's dashboard, so give those
-- rows their user_id now — with exactly the predicate signup/OAuth use when
-- adopting shots (lib/roster-players.ts adoptLegacySubmissions):
--   * not a team upload, not a coach's / org admin's self-upload,
--   * the address is not a coach's or org admin's at all,
--   * the account proved the address: it has a password (it signed up) or a
--     provider identity (Google/Apple verified the email) — never a
--     password-less roster stub,
--   * exactly one account has that address (case-insensitively).
-- Only rows with user_id IS NULL are touched, so re-running is a no-op.
UPDATE submissions s
SET user_id = u.id
FROM users u
WHERE s.user_id IS NULL
  AND s.email IS NOT NULL
  AND LOWER(u.email) = LOWER(s.email)
  AND s.team_id IS NULL
  AND s.team_player_id IS NULL
  AND COALESCE(s.entitlement_source, '') NOT IN ('coach_credit', 'org_balance')
  AND (
    u.password_hash IS NOT NULL
    OR EXISTS (SELECT 1 FROM user_oauth_identities oi WHERE oi.user_id = u.id)
  )
  AND COALESCE(u.roster_pending, false) = false
  AND (SELECT COUNT(*) FROM users u2 WHERE LOWER(u2.email) = LOWER(s.email)) = 1
  AND NOT EXISTS (SELECT 1 FROM teams t WHERE LOWER(t.admin_email) = LOWER(s.email))
  AND NOT EXISTS (SELECT 1 FROM team_coaches c WHERE LOWER(c.email) = LOWER(s.email))
  AND NOT EXISTS (SELECT 1 FROM organizations o WHERE LOWER(o.admin_email) = LOWER(s.email));

-- Team buy-in counter + retirement of the free grants.
--
-- The discounted team rate now unlocks only once a team has BOTH a full roster
-- (>= 8 joined players) AND has bought at least 8 tokens for the team. This
-- adds the cumulative counter the webhook increments on every team-scoped
-- token purchase (it never decrements, unlike teams.credits / token_pool).
ALTER TABLE teams ADD COLUMN IF NOT EXISTS tokens_purchased INTEGER NOT NULL DEFAULT 0;

-- Grandfather clause: teams that were ALREADY on the discounted rate under the
-- previous "8 players (or class package or paid initiation)" rule keep it, so
-- nobody's per-analysis price jumps from the team rate back up to regular
-- overnight. New teams must complete the 8-token buy-in the normal way.
-- (Remove this UPDATE if you'd rather force every existing team to re-buy in.)
UPDATE teams t
SET tokens_purchased = 8
WHERE t.tokens_purchased = 0
  AND (
    t.class_package_id IS NOT NULL
    OR t.initiated_at IS NOT NULL
    OR (SELECT COUNT(*) FROM team_memberships tm WHERE tm.team_id = t.id) >= 8
  );

-- Retire the one-time free signup analysis. The column defaults to true (=
-- already used / not eligible); signup no longer sets it to false, and this
-- clears any account that still had a pending free analysis so that, going
-- forward, no one gets a free shot analysis.
UPDATE users SET free_analysis_used = true WHERE free_analysis_used = false;

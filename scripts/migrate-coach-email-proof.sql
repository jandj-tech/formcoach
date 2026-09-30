-- Inbox proof per coach/org credential row (lib/team-auth.ts credentialInboxProven).
--
-- A coach row counts as inbox-proven when its CURRENT password was set by
-- something only the address's owner could do: accepting an invite that went
-- only to that inbox (head-coach setup link, or an added-coach signup link
-- that was never shown to the inviter), or a password reset by emailed link /
-- 6-digit code. The proof is bound to the hash it was recorded for
-- (*_proven_hash = password_hash), so any later password change that did not
-- go through the inbox — or a head-coach swap that moves another coach's
-- email + hash onto the row — voids it without every writer having to
-- remember to clear it.
--
-- Additive and idempotent. Existing rows stay NULL: legacy single-password
-- emails keep the old "one credential per email" rule.
ALTER TABLE teams ADD COLUMN IF NOT EXISTS coach_email_proven_at TIMESTAMPTZ;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS coach_email_proven_hash VARCHAR(255);

ALTER TABLE team_coaches ADD COLUMN IF NOT EXISTS email_proven_at TIMESTAMPTZ;
ALTER TABLE team_coaches ADD COLUMN IF NOT EXISTS email_proven_hash VARCHAR(255);
-- True only when the signup link was delivered solely by email (the inviter
-- was never shown it — lib/roster-players.ts addCoachToTeam emailOnly).
-- Legacy/pending rows default to false: their link may have been shown.
ALTER TABLE team_coaches ADD COLUMN IF NOT EXISTS invite_emailed_only BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS admin_email_proven_at TIMESTAMPTZ;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS admin_email_proven_hash VARCHAR(255);

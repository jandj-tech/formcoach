-- A name-only player (added without their own email) can carry a CONTACT
-- email: the family address they share with a sibling who already owns that
-- address as their account. It is only ever used to email that player's own
-- results/messages; it never creates an account or grants a login.
-- Additive and idempotent.
ALTER TABLE pending_team_members ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255);
ALTER TABLE team_players ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255);

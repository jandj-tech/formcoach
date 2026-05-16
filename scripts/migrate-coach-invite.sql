-- Allow teams created by an org (coach not yet set up) to have no password
ALTER TABLE teams ALTER COLUMN password_hash DROP NOT NULL;

-- Invite token sent to coach's email so they can set up their account
ALTER TABLE teams ADD COLUMN IF NOT EXISTS coach_invite_token VARCHAR(100);
ALTER TABLE teams ADD COLUMN IF NOT EXISTS invite_sent_at TIMESTAMPTZ;

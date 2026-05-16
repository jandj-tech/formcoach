-- "Add myself as a coach": lets an org owner be a team_coaches coach on more
-- than one team, so drop the global unique constraint on the email column.
ALTER TABLE team_coaches DROP CONSTRAINT IF EXISTS team_coaches_email_key;

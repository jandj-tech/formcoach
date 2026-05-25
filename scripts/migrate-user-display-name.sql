-- One canonical "display name" per user account, replacing the per-team
-- first_name / last_name_initial values that used to be collected at every
-- team join. With this in place, the same email can no longer appear as
-- different names on different teams.

ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_initial CHAR(1);

-- Backfill canonical name from each user's most recent team_memberships row
-- (the most recent intent). Users with no memberships stay NULL and will be
-- prompted to set a name the first time they hit the dashboard or join a team.
WITH most_recent AS (
  SELECT DISTINCT ON (user_id) user_id, first_name, last_name_initial
  FROM team_memberships
  WHERE first_name IS NOT NULL AND first_name <> ''
  ORDER BY user_id, joined_at DESC
)
UPDATE users u
SET first_name = COALESCE(u.first_name, mr.first_name),
    last_initial = COALESCE(u.last_initial, mr.last_name_initial)
FROM most_recent mr
WHERE u.id = mr.user_id;

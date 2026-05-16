-- Remove unique constraint so a coach email can own multiple teams
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_admin_email_key;

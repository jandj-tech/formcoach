-- Family email: several PLAYER accounts may share one address (siblings under
-- a parent's inbox); the password decides which account a sign-in opens.
-- Idempotent — safe to run on every deploy.
--
-- Code that reads users by email goes through lib/player-accounts.ts (every
-- row for lower(email), deterministic order) and credits address-keyed money
-- (guest purchases, ball claims, comps) to EXACTLY ONE account. That code
-- works with or without the old unique constraint, and nothing in the app or
-- scripts uses ON CONFLICT (email) on users any more (that would error once
-- the constraint is gone). Organization / team / coach emails are untouched.

-- Opt-in shared login between accounts on one address (P5 builds it).
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_group_id uuid;

-- Which account a complimentary membership granted to an address went to.
ALTER TABLE email_list ADD COLUMN IF NOT EXISTS comp_user_id uuid;

-- Lookups are by lower(email) now; this replaces the unique index the
-- constraint below provided.
CREATE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));

-- Drop the one-account-per-email rule: the named constraint, and any other
-- UNIQUE index on users over email or lower(email) alone (created by hand or
-- by an older schema under another name). Primary key and other indexes are
-- left alone.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT i.relname AS index_name, c.conname AS constraint_name
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_class t ON t.oid = x.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    LEFT JOIN pg_constraint c ON c.conindid = x.indexrelid AND c.conrelid = t.oid
    WHERE t.relname = 'users'
      AND n.nspname = current_schema()
      AND x.indisunique
      AND NOT x.indisprimary
      AND x.indnatts = 1
      AND (
        (x.indkey[0] <> 0 AND (
          SELECT a.attname FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attnum = x.indkey[0]
        ) = 'email')
        OR (x.indkey[0] = 0 AND pg_get_indexdef(x.indexrelid) ~* 'lower\(\(?email')
      )
  LOOP
    IF r.constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE users DROP CONSTRAINT IF EXISTS %I', r.constraint_name);
    ELSE
      EXECUTE format('DROP INDEX IF EXISTS %I', r.index_name);
    END IF;
  END LOOP;
END $$;

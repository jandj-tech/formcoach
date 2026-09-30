-- Family email, part 2: drop the one-account-per-email rule.
-- PRODUCTION BUILDS ONLY (see PRODUCTION_ONLY in scripts/migrate.ts). Preview
-- builds share the production database, and the currently live code uses
-- ON CONFLICT (email) on users until this branch ships, so the drop must only
-- happen in the same build that ships the code that no longer needs it.
-- Idempotent — safe to run on every production build.
--
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

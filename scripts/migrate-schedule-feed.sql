-- Calendar subscription feeds for team schedules.
--
-- A calendar client (Google, Apple, Outlook) polls a URL with no cookies and
-- no way to log in, so the URL itself has to be the credential. This column
-- holds that secret: 32 random bytes, base64url, minted lazily the first time
-- someone on the team asks for their feed link.
--
-- Nullable on purpose. A team that never opens the calendar panel never gets a
-- token, so there is no secret to leak for a feature nobody used. Rotating is
-- an UPDATE to a fresh value, which instantly breaks every old subscription —
-- that is the point of having it be a column rather than something derived
-- from the team id.
--
-- scripts/migrate.ts replays every file on every deploy, so this stays a pure
-- ADD COLUMN IF NOT EXISTS with no backfill.
ALTER TABLE teams ADD COLUMN IF NOT EXISTS calendar_feed_token VARCHAR(64);

-- Unique so a token collision is a database error rather than one team quietly
-- serving another team's schedule. Partial, because NULL is the common case.
CREATE UNIQUE INDEX IF NOT EXISTS teams_calendar_feed_token_key
  ON teams (calendar_feed_token)
  WHERE calendar_feed_token IS NOT NULL;

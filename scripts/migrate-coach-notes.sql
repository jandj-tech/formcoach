-- Coach's Notes: a coach's (or the owner's) own read of one criterion, shown
-- to the player BESIDE the AI score. The AI score is never replaced.
--
-- Deliberately NOT criterion_scores.admin_score. That column is read with no
-- author/scope/date filter by lib/analyze.ts and spliced into the system
-- prompt of every analysis, and admin_notes is quoted into it verbatim — so a
-- single coach edit there would retrain the grader for every customer and open
-- an untrusted-text-into-prompt path. Nothing in this table may ever reach the
-- model; the only bridge is the owner explicitly accepting a note in Learn
-- Mode, which writes admin_score through the existing correction endpoint.
CREATE TABLE IF NOT EXISTS coach_notes (
  id                 SERIAL PRIMARY KEY,
  criterion_score_id INTEGER NOT NULL REFERENCES criterion_scores(id) ON DELETE CASCADE,
  author_type        VARCHAR(16) NOT NULL,                        -- 'coach' | 'admin'
  team_id            UUID REFERENCES teams(id) ON DELETE CASCADE, -- NULL for admin notes
  author_email       VARCHAR(255) NOT NULL,                       -- attribution; NEVER rendered publicly
  suggested_score    DECIMAL(4,1),                                -- NULL = note-only
  note               TEXT,
  status             VARCHAR(20) NOT NULL DEFAULT 'pending',      -- pending | accepted | rejected
  reviewed_at        TIMESTAMPTZ,
  review_reason      TEXT,
  deleted_at         TIMESTAMPTZ,                                 -- soft delete: retraction + version history
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT coach_notes_author_chk CHECK (author_type IN ('coach','admin')),
  -- A coach note is always team-scoped; an admin note never is.
  CONSTRAINT coach_notes_team_chk   CHECK ((author_type = 'coach') = (team_id IS NOT NULL)),
  CONSTRAINT coach_notes_status_chk CHECK (status IN ('pending','accepted','rejected')),
  CONSTRAINT coach_notes_score_chk  CHECK (suggested_score IS NULL OR (suggested_score >= 0 AND suggested_score <= 10)),
  -- A note with neither a score nor text is meaningless.
  CONSTRAINT coach_notes_not_empty  CHECK (suggested_score IS NOT NULL OR btrim(coalesce(note,'')) <> '')
);

-- One LIVE note per criterion per team, plus one live admin note per criterion.
-- Two partial indexes rather than one, because Postgres treats NULL team_id as
-- distinct and would otherwise allow unlimited admin notes on the same row.
-- Superseded versions survive as deleted_at IS NOT NULL rows.
CREATE UNIQUE INDEX IF NOT EXISTS coach_notes_one_live_team
  ON coach_notes (criterion_score_id, team_id)
  WHERE deleted_at IS NULL AND team_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS coach_notes_one_live_admin
  ON coach_notes (criterion_score_id)
  WHERE deleted_at IS NULL AND team_id IS NULL;

-- Results page: every live note for an analysis.
CREATE INDEX IF NOT EXISTS coach_notes_live_by_score
  ON coach_notes (criterion_score_id) WHERE deleted_at IS NULL;

-- Learn Mode queue.
CREATE INDEX IF NOT EXISTS coach_notes_pending
  ON coach_notes (created_at DESC) WHERE deleted_at IS NULL AND status = 'pending';

CREATE INDEX IF NOT EXISTS coach_notes_team ON coach_notes (team_id);

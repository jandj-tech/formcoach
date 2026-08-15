-- Personal notes on a whole analysis, for anyone who can write to it: the
-- player themselves, or the trainer/coach who uploaded the shot for them.
--
-- Distinct from coach_notes, which are per-criterion, need coaching rights and
-- feed the owner's review queue. These are free-form, one per author per
-- analysis, and carry their own visibility: private by default, or published
-- onto the report so a trainer can write up a shot and just send the link.
--
-- Like coach_notes, nothing here ever reaches the grading model.
CREATE TABLE IF NOT EXISTS analysis_notes (
  id           SERIAL PRIMARY KEY,
  analysis_id  INTEGER NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  -- Opaque per-author identity so one column covers every author kind:
  -- 'user:<uuid>' | 'team:<uuid>' | 'org:<uuid>' | 'admin'.
  author_key   VARCHAR(255) NOT NULL,
  -- Display name shown on the report. NEVER an email — reports are public to
  -- anyone holding the token.
  author_label VARCHAR(120) NOT NULL,
  body         TEXT NOT NULL,
  -- false = only the author sees it; true = shown to anyone with the link.
  is_public    BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT analysis_notes_body_chk CHECK (btrim(body) <> ''),
  CONSTRAINT analysis_notes_one_per_author UNIQUE (analysis_id, author_key)
);

CREATE INDEX IF NOT EXISTS analysis_notes_by_analysis ON analysis_notes (analysis_id);

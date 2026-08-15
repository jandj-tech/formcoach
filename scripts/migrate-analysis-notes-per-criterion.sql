-- Personal notes move from the whole analysis to the individual criterion, so
-- a player or trainer can write against each thing the report grades rather
-- than one lump at the top.
--
-- The whole-analysis version shipped only briefly and holds no real rows; any
-- that exist have no criterion to attach to, so they are dropped rather than
-- guessed at.
ALTER TABLE analysis_notes
  ADD COLUMN IF NOT EXISTS criterion_score_id INTEGER REFERENCES criterion_scores(id) ON DELETE CASCADE;

DELETE FROM analysis_notes WHERE criterion_score_id IS NULL;

ALTER TABLE analysis_notes ALTER COLUMN criterion_score_id SET NOT NULL;

-- analysis_id stays as a denormalized lookup key so the report can fetch every
-- note for a shot in one query.
ALTER TABLE analysis_notes DROP CONSTRAINT IF EXISTS analysis_notes_one_per_author;

CREATE UNIQUE INDEX IF NOT EXISTS analysis_notes_one_per_author_criterion
  ON analysis_notes (criterion_score_id, author_key);

CREATE INDEX IF NOT EXISTS analysis_notes_by_criterion ON analysis_notes (criterion_score_id);

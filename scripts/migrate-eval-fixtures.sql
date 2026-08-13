-- Golden-fixture eval data (idempotent).
--
-- Fixtures and baselines live in the database (not repo files) so the
-- LearnHoops admin UI and the CLI eval scripts share one source of truth.
--
-- eval_fixtures: one row per pinned reference shot. frame_urls/frames_hash
-- pin the exact frames (Blob URLs + integrity hash); expected holds the
-- expert-approved ranges: { overall: [lo,hi], criteria: { "<name>": [lo,hi] |
-- "null" }, flags: {...}, player_type, shot_detected }.
CREATE TABLE IF NOT EXISTS eval_fixtures (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(80) NOT NULL UNIQUE,
  analysis_id INTEGER,
  description TEXT,
  frames_hash VARCHAR(64) NOT NULL,
  frame_urls TEXT[] NOT NULL,
  expected JSONB NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- eval_baselines: append-only history of accepted eval results. The newest
-- row is the current baseline; keeping history means any past grader state
-- can be compared against.
CREATE TABLE IF NOT EXISTS eval_baselines (
  id SERIAL PRIMARY KEY,
  grader JSONB,
  results JSONB NOT NULL,
  accepted_at TIMESTAMP DEFAULT NOW()
);

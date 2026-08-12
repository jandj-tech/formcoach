-- Frozen calibration versions (idempotent).
--
-- The "EXPERT GRADING CALIBRATION" block used to be recomputed live from
-- admin corrections on every grading pass, so every correction silently
-- changed the grader. Now the block is a versioned artifact: corrections
-- accumulate without effect until scripts/eval/refresh-calibration.mjs mints
-- a new version and it is explicitly activated. lib/analyze.ts reads the
-- single active row; if none exists it falls back to live computation.
CREATE TABLE IF NOT EXISTS grader_calibration (
  id SERIAL PRIMARY KEY,
  version INTEGER NOT NULL UNIQUE,
  content TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Identical-video fingerprint: the same frames re-uploaded must reproduce
-- the exact same analysis instead of re-rolling the grader.
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS frames_hash VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_analyses_frames_hash ON analyses (frames_hash);

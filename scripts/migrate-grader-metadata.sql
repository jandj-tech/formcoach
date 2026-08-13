-- Grader metadata on analyses (idempotent).
--
-- critical_flags / player_type / player_name: what the grade actually
-- produced, so the framesHash reuse path in app/api/analyze/route.ts can
-- return the true prior result instead of fabricated defaults.
--
-- grader_version: identity of the grader that produced this analysis
-- ({ prompt_sha, rubric_tags, model, passes, calibration_version }), so any
-- grade is attributable to the exact rubric/calibration/model that made it.
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS critical_flags JSONB;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS player_type VARCHAR(20);
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS player_name TEXT;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS grader_version JSONB;

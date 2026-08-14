-- Repair double-encoded jsonb in the eval (Test Bench) tables.
--
-- The original writes used `${JSON.stringify(value)}::jsonb`. postgres.js
-- infers the parameter type from the jsonb context and serializes the value
-- AGAIN, so those rows hold a jsonb *string* containing JSON rather than a
-- jsonb object. Consequences while broken: the expectations editor reopened
-- blank (every `expected.criteria` lookup returned undefined), and worse,
-- checkAccuracy() iterated an empty object and reported ZERO errors for every
-- fixture — so a run looked all-green no matter what the grader did.
--
-- `expected #>> '{}'` extracts the jsonb as text, which unwraps the outer JSON
-- string; casting that back to jsonb parses it into the object it should have
-- been. Idempotent: after the fix jsonb_typeof is 'object', so the WHERE stops
-- matching. Guarded by to_regclass so it is a no-op on databases that have not
-- created the eval tables yet.
DO $$
BEGIN
  IF to_regclass('public.eval_fixtures') IS NOT NULL THEN
    UPDATE eval_fixtures
    SET expected = (expected #>> '{}')::jsonb
    WHERE expected IS NOT NULL AND jsonb_typeof(expected) = 'string';
  END IF;

  IF to_regclass('public.eval_baselines') IS NOT NULL THEN
    UPDATE eval_baselines
    SET results = (results #>> '{}')::jsonb
    WHERE results IS NOT NULL AND jsonb_typeof(results) = 'string';

    UPDATE eval_baselines
    SET grader = (grader #>> '{}')::jsonb
    WHERE grader IS NOT NULL AND jsonb_typeof(grader) = 'string';
  END IF;
END $$;

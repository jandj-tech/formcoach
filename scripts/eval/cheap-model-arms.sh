#!/usr/bin/env bash
# Runs the cheap-model arms against the full 28-fixture suite.
#
# WHY THIS EXISTS: the earlier bake-off said qwen3.7-flash at 5 passes beat
# claude-sonnet-4-6 at 3 passes (9 misses vs 13) — but that was on 5 fixtures,
# where re-running the IDENTICAL prompt moves the count by +-6-7. The comparison
# was inside the noise. The suite is now 28 fixtures / 129 expert cells, which
# is the first time this question can actually be answered.
#
# Cost: roughly $0.35 (3-pass) and $0.55 (5-pass). The equivalent Sonnet arm is
# about $4.
#
# Needs OPENROUTER_API_KEY in .env.local. Rotate the old one first — it was
# pasted into a chat transcript on 2026-09-13 and must be treated as public.
set -uo pipefail
cd "$(dirname "$0")/../.."

if ! grep -q '^OPENROUTER_API_KEY=' .env.local 2>/dev/null; then
  echo "OPENROUTER_API_KEY is not in .env.local — add it there, not on the command line." >&2
  echo "  (.env.local is gitignored; a key on the command line lands in shell history.)" >&2
  exit 1
fi

MODEL="${MODEL:-qwen/qwen3.7-flash}"
OUT="${OUT:-/tmp/cheap-arms}"
mkdir -p "$OUT"

for passes in 3 5; do
  echo "=== $MODEL @ ${passes} passes — 28 fixtures ==="
  ANALYSIS_MODEL="$MODEL" ANALYSIS_PASSES="$passes" \
    npx tsx --env-file=.env.local scripts/eval/run-eval.mjs \
    > "$OUT/passes-${passes}.txt" 2>&1
  tail -3 "$OUT/passes-${passes}.txt"
  echo
done

echo "=== arms complete — outputs in $OUT ==="
echo "Check DID NOT RUN first: a model that dies on every fixture otherwise"
echo "reports the same count as one that merely graded them slightly wrong."
grep -h '^Done:' "$OUT"/passes-*.txt

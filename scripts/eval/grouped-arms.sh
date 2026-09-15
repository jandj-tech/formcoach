#!/usr/bin/env bash
# The halo experiment: does splitting criteria into independent calls help?
# Waits for every other eval to finish, then runs serially.
set -uo pipefail
cd "$(dirname "$0")/../.."
OUT=${OUT:-/tmp/grouped}; mkdir -p "$OUT"
BEST=${BEST:-qwen/qwen3.7-flash}

while pgrep -f 'scripts/eval/(campaign|model-sweep|run-eval)' >/dev/null 2>&1; do
  echo "· waiting for the queue to clear…"; sleep 60
done

run() {
  local label=$1; shift
  local f="$OUT/$label.txt"
  if [ -f "$f" ] && grep -q '^Done:' "$f"; then echo "  · $label — done already"; return; fi
  echo "=== $label ==="
  env "$@" ANALYSIS_MODEL="$BEST" \
    npx tsx --env-file=.env.local scripts/eval/run-eval.mjs --quick > "$f" 2>&1
  grep '^Done:' "$f" | sed 's/^/  /' || tail -2 "$f" | sed 's/^/  /'
  sleep 20
}

# Grouping alone — the clean test of the halo hypothesis.
run grouped                CRITERION_GROUPS=1
# Grouping plus the two rubrics whose failures are all one-directional. If halo
# is what made them lenient, these two should stack rather than overlap.
run grouped-elbow-square   CRITERION_GROUPS=1 RUBRIC_OVERRIDE=elbow,square
# Everything.
run grouped-all-rubrics    CRITERION_GROUPS=1 RUBRIC_OVERRIDE=elbow,square,stance,power,guidehand

echo
echo "=== GROUPED ARMS COMPLETE ==="
for f in "$OUT"/*.txt; do printf '%-24s %s\n' "$(basename "$f" .txt)" "$(grep '^Done:' "$f" | sed 's/^Done: //')"; done
echo
echo "Baseline, same model/passes/fixtures: qwen3.7-flash + reasoning, ungrouped = 57 expert failures."

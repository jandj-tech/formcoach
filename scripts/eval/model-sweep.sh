#!/usr/bin/env bash
# Serial model sweep against the 28-fixture suite.
#
# SERIAL ON PURPOSE. Running arms concurrently is what wrecked the first
# 3-pass/5-pass attempt: image-heavy calls in parallel drew 429s and
# "failed to download multimodal content" from the provider, which the harness
# correctly reported as DID NOT RUN but which left the arms covering different
# fixture sets and therefore uncomparable. A sweep that takes an hour and is
# trustworthy beats one that takes 20 minutes and is not.
#
# The model list is deliberately NOT just the cheapest available. The floor
# ($0.0017/analysis, qwen3.7-flash) misses 72% of the owner's own corrections
# against Sonnet's 38%. The target is 80%+ cheaper than Sonnet's $0.43, which
# leaves plenty of room for a model that can actually do the job.
set -uo pipefail
cd "$(dirname "$0")/../.."

OUT=${OUT:-/tmp/sweep}
mkdir -p "$OUT"

run() {                     # run <label> <model> [extra env assignments...]
  local label=$1 model=$2; shift 2
  local f="$OUT/$label.txt"
  if [ -f "$f" ] && grep -q '^Done:' "$f"; then
    echo "  · $label — already done, skipping"
    return
  fi
  echo "=== $label  ($model) ==="
  env "$@" ANALYSIS_MODEL="$model" \
    npx tsx --env-file=.env.local scripts/eval/run-eval.mjs --quick > "$f" 2>&1
  grep '^Done:' "$f" | sed 's/^/  /' || tail -2 "$f" | sed 's/^/  /'
  sleep 20                  # let the provider breathe between arms
}

# 1. The owner's request: does qwen's hidden reasoning actually buy accuracy?
run qwen-reasoning      qwen/qwen3.7-flash            GATEWAY_REASONING=1
# 2. The owner's request: the previous bake-off's runner-up.
run gemini-25-flash-lite google/gemini-2.5-flash-lite
# 3-5. Stronger models that still clear the 80%-cheaper bar by a wide margin.
run gemini-31-flash-lite google/gemini-3.1-flash-lite
run gpt-5-mini           openai/gpt-5-mini
run qwen3-vl-235b        qwen/qwen3-vl-235b-a22b-instruct

echo
echo "=== SWEEP COMPLETE — read DID NOT RUN before believing any count ==="
printf '%-26s %s\n' "arm" "result"
for f in "$OUT"/*.txt; do
  printf '%-26s %s\n' "$(basename "$f" .txt)" "$(grep '^Done:' "$f" | sed 's/^Done: //')"
done
echo
echo "Reference: claude-sonnet-4-6 @ 1 pass = 49 EXPERT failures of 129 cells (38%)."
echo "           qwen/qwen3.7-flash @ 1 pass = 93 (72%)."

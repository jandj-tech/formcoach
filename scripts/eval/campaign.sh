#!/usr/bin/env bash
# Everything that still needs measuring, run strictly serially and unattended.
#
# Waits for any in-flight run-eval to finish first. Serial throughout: running
# image-heavy arms concurrently draws 429s and "failed to download multimodal
# content" from the provider, which the harness honestly reports as DID NOT RUN
# but which leaves arms covering different fixture sets and uncomparable. That
# has already wasted two arms tonight.
#
# Baselines to compare against, all 1 pass on the same 28 fixtures:
#   claude-sonnet-4-6      45 expert failures per 26 common fixtures  (1.73/fixture)
#   qwen3.7-flash + reason 54                                          (2.08)
#   qwen3.7-flash, no reas 80                                          (3.08)
set -uo pipefail
cd "$(dirname "$0")/../.."

OUT=${OUT:-/tmp/campaign}
mkdir -p "$OUT"
BEST=${BEST:-qwen/qwen3.7-flash}     # override once the sweep names a winner

# Wait for the SWEEP DRIVER, not just an in-flight arm. The sweep sleeps 20s
# between arms, and a loop watching only run-eval would slip through that gap
# and start running concurrently with the next arm — the exact contention this
# script exists to avoid.
while pgrep -f 'scripts/eval/model-sweep' >/dev/null 2>&1 \
   || pgrep -f 'scripts/eval/run-eval' >/dev/null 2>&1; do
  echo "· waiting for the sweep to finish…"; sleep 60
done

run() {                              # run <label> [extra env…]
  local label=$1; shift
  local f="$OUT/$label.txt"
  if [ -f "$f" ] && grep -q '^Done:' "$f"; then echo "  · $label — done already"; return; fi
  echo "=== $label ==="
  env "$@" ANALYSIS_MODEL="$BEST" \
    npx tsx --env-file=.env.local scripts/eval/run-eval.mjs --quick > "$f" 2>&1
  grep '^Done:' "$f" | sed 's/^/  /' || tail -2 "$f" | sed 's/^/  /'
  sleep 20
}

# ── 1. The noise floor ───────────────────────────────────────────────────────
# Same model, same prompt, same frames, twice. Every cell that flips pass<->fail
# between these two runs is irreducible: no rubric wording can fix it, and it
# sets the floor that "how low can the miss rate go" has to be measured against.
run noise-a
run noise-b

# ── 2. Each rubric draft alone ───────────────────────────────────────────────
# One at a time, because two at once and the eval cannot attribute the movement.
run rubric-elbow     RUBRIC_OVERRIDE=elbow      # v7, + anti-leniency block
run rubric-square    RUBRIC_OVERRIDE=square     # v5, + anti-leniency + temporal test
run rubric-stance    RUBRIC_OVERRIDE=stance     # v22, shoe-counting method
run rubric-power     RUBRIC_OVERRIDE=power      # v5, head-heights method
run rubric-guidehand RUBRIC_OVERRIDE=guidehand  # v4, hand-gap method

# ── 3. Everything that helped, together ──────────────────────────────────────
# Interactions are real: five rubrics that each help alone can still fight.
run rubric-all       RUBRIC_OVERRIDE=elbow,square,stance,power,guidehand

echo
echo "=== CAMPAIGN COMPLETE ==="
printf '%-22s %s\n' arm result
for f in "$OUT"/*.txt; do
  printf '%-22s %s\n' "$(basename "$f" .txt)" "$(grep '^Done:' "$f" | sed 's/^Done: //')"
done
echo
echo "Read DID NOT RUN on every line before trusting a count."
echo "noise-a vs noise-b is the floor. Nothing below it is achievable by wording."

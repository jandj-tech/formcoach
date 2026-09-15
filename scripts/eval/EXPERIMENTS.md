# Grading accuracy — experiment log

Measured on the 28-fixture Test Bench. **129 expert cells** (the owner's own
labels) and 341 ai-seeded cells (prefilled from the grader's past output —
circular, reported separately, never counted as accuracy).

A "miss" is a criterion score outside `[expert − 1.0, expert + 1.0]` on a
subjective 1–10 scale. Band widths average 1.8–2.1 points; 11 of 359 are ≤1.0.

All figures are expert cells only, 1 pass, and restricted to fixtures that
actually ran. `scripts/eval/analyze-runs.mjs` produces them from raw run output
so no number here comes from a run total.

---

## THE CENTRAL MEASUREMENT — repeatability, 2026-09-15

Three runs of the same model on the same 129 cells:

| | cells | share |
|---|---|---|
| ALWAYS missed | 38 | **29.5%** |
| NEVER missed | 22 | 17.1% |
| **SOMETIMES missed (coin-flips)** | **69** | **53.5%** |

Two runs of an **identical** config disagree on **28% of cells**
(noise-a vs qwen-reasoning, both qwen3.7-flash + reasoning, 1 pass).

**Consequences, and they govern everything below:**

1. A single run's miss rate carries an enormous error bar. Comparing two arms by
   their totals is not valid; only paired per-cell comparison is.
2. The floor for this model is **29.5%** even if every coin-flip resolved
   favourably. Sub-5% is not reachable by prompt wording on qwen.
3. Any experiment whose effect is smaller than ~28% of cells is unmeasurable at
   n=1 run. Effects must be large, or replicated.

---

## Baselines

| config | cells | miss | rate | 95% CI (Wilson) |
|---|---|---|---|---|
| `claude-sonnet-4-6`, old grader (pre-PR#72) | 129 | 63 | 48.8% | — |
| **`claude-sonnet-4-6`, current — PRODUCTION** | **129** | **49** | **38.0%** | — |
| `qwen3.7-flash` + reasoning (run 1) | 125 | 55 | 44.0% | [35.6%, 52.8%] |
| `qwen3.7-flash` + reasoning (run 2) | 129 | 70 | 54.3% | [45.7%, 62.6%] |
| `qwen3.7-flash`, reasoning OFF | 129 | 91 | 70.5% | [62.2%, 77.7%] |

Production has been measured **once**. Its repeatability is unknown because the
Anthropic account has no credits — see LIMITATIONS.

## Per-criterion miss rate — pooled over 2 qwen runs

| criterion | n | miss | rate | 95% CI |
|---|---|---|---|---|
| Two Finger Release | 8 | 8 | **100%** | [67.6%, 100%] |
| Knees Bent | 8 | 7 | **87.5%** | [52.9%, 97.8%] |
| Connected Shot | 14 | 10 | 71.4% | [45.4%, 88.3%] |
| Source of Shot Power | 29 | 20 | 69.0% | [50.8%, 82.7%] |
| Elbow L-Shape | 29 | 20 | 69.0% | [50.8%, 82.7%] |
| Square to the Basket | 16 | 10 | 62.5% | [38.6%, 81.5%] |
| Feet Shoulder Width | 34 | 17 | 50.0% | [34.1%, 65.9%] |
| Dominant Foot Forward | 12 | 6 | 50.0% | [25.4%, 74.6%] |
| Shooting Hand Follow Through | 17 | 7 | 41.2% | [21.6%, 64.0%] |
| One Hand Release | 24 | 9 | 37.5% | [21.2%, 57.3%] |
| Guide Hand Follow Through | 25 | 7 | 28.0% | [14.3%, 47.6%] |
| Shot Pocket — Elbow | 10 | 2 | 20.0% | [5.7%, 51.0%] |
| Guide Hand Placement | 14 | 2 | 14.3% | [4.0%, 39.9%] |
| Forward Motion / Arc / Rotation / Thumb / Palm | 14 | 0 | 0% | [0%, 39%] |

Criterion identity is the strongest known predictor of a miss (prior work:
AUC 0.673, against 0.504 for ensemble spread and 0.477 for hedged wording —
both of those are noise and were rejected).

---

## Experiments

### E1 — Remove `overall_score` from the model's output schema · KEEP
**Hypothesis.** Halo. All ~18 criteria are graded in one call and the model
emitted the shot-level score inside the same JSON, so it picked a band and
filled criteria in to match: corr(mean signed error, overall_score) = +0.858,
and 9 of 12 corrected analyses erred 100% one direction.
**Before / after.** Sonnet 63 → 49 expert failures.
**Paired.** 23 fixed, 10 broken, McNemar exact **p = 0.035**.
**Effect.** Gains on Shooting Hand FT (−6), Power (−4), Guide Hand FT (−3),
Elbow (−3). Regressions on Guide Hand Placement (+2), Dominant Foot (+1).
**Conclusion.** KEEP. Shipped in PR #72, live.
*(Bundled with E2 and E3 in the same measurement — see caveat there.)*

### E2 — Calibration gate `COUNT(*) >= 1` → `>= 5` · KEEP, BUT CAUSED A REGRESSION
**Hypothesis.** A criterion with one correction was emitting a systematic
directive: "Knees Bent" had exactly one (3.0→6.0) and was injecting "you score
3.0 pts too LOW — be more generous" into every prompt. Unanimity across n has
p = 2·0.5ⁿ, so n<5 is reporting coin flips as bias.
**Effect.** Emptied the block (all four active directives had n = 4, 3, 2, 1).
**REGRESSION FOUND 2026-09-15.** Knees Bent now misses **87.5% (7/8), every one
too LOW** — scoring 4–6 against expected 7–10. The single correction was
directionally CORRECT: the model really is ~2.5 points low on this criterion.
Removing the directive removed a real fix.
**Conclusion.** The gate is still right (n=1 cannot establish bias), but the
underlying bias is real and needs a properly-powered source. See E7.

### E3 — Resolve critical-criterion caps by name, not hardcoded ids · KEEP
Latent, not an accuracy change: ids `[5,11,15,16]` were correct at the time, but
"Feet Shoulder Width Apart" is id 19 and the seed's id 1 is deactivated, so rows
demonstrably get recreated and a hardcoded list would silently cap the wrong
criteria.

### E4 — Reasoning enabled on the gateway · KEEP
**Hypothesis.** Reasoning tokens were being spent and truncating output, so
disabling them looked like a pure win.
**Result.** The opposite. Paired per cell over 26 fixtures, OFF → ON: **36 fixed,
10 broken, McNemar exact p = 0.0002**; 3.08 → 2.08 expert failures per fixture.
**Conclusion.** KEEP, on by default. A small model that reasons beat every
larger model tested, including `qwen3-vl-235b` (105 failures) at ~30× its size.
The truncation was real; the fix is a bigger token ceiling, not less thinking.

### E5 — Criterion grouping: 4 independent calls, one per moment · INCONCLUSIVE
**Hypothesis.** Removing `overall_score` took away the explicit anchor but the
criteria still share one JSON and can anchor on each other.
**Result.** 19 → 25 on the 7 fixtures shared with a valid baseline; 12 cells
moved against a noise churn of 8; **p = 0.146**. Not demonstrated either way.
The arm lost 21 fixtures to a network outage.
**Conclusion.** Kept behind `CRITERION_GROUPS=1`, off. Needs a clean re-run.

### E6 — Two-stage blind scoring · REVERTED
**Hypothesis.** The model observes deviations accurately then discounts them, so
separate LOOK from SCORE: stage 1 describes and may not emit a number, stage 2
scores from the words with no images.
**Result.** WORSE. On shot-201 (expert: Elbow [0–3], Power [2–4]) it returned
overall **10**. The observation stage still writes charitably — "your base was
set at a solid shoulder-width stance" — so the blind scorer, given only
flattering prose, scored 10s. Leniency moved rather than vanished.
Also 181s vs 34s: reasoning runs twice. Not shippable on latency alone.
**Conclusion.** REVERTED to off. `TWO_STAGE=1` retained for the record.

### E7 — Elbow rubric: anti-leniency (v7), then bimodality (v8) · IN PROGRESS
**v7 hypothesis.** Every Elbow correction is downward and the reasoning always
discounts an observed fault, so forbid the discount.
**v7 result.** Count barely moved (11 → 10 Elbow misses) but the **direction
flipped entirely**: baseline scored 9 where the expert wanted 6–8; v7 scored 4
where the expert wanted 6–8. Overcorrection.
**Diagnosis.** The model is **bimodal (4 or 9)**; the expert is unimodal
(scores run 3–8, median 6.5). The anchor table had only four rungs — 10, 7, 4, 1
— three points apart, with nothing at 8, 6 or 5, which is exactly where the
expert scores. The model lands ON a rung instead of interpolating.
**v8 change.** Rungs at every point 3–10, 6 labelled "the single most common
real shot", a pre-commit check ("about to write 9? it must be within half a ball
width"), and the expert's real distribution stated in the prompt.
**Status.** v8 arm running.

### E8 — Two Finger Release: stop ordering the model to abstain · QUEUED
**Observation.** 100% miss (8/8), every one an ABSTAIN against an expert range
of 6.5–10. `lib/analyze.ts:475` instructs: "SHOT ARC / BALL ROTATION / TWO
FINGER RELEASE — NEVER GUESS, NULL INSTEAD". At 28 frames of a shooter who is
~18–20% of frame height the fingers are a few pixels, so the condition is never
met and the criterion always nulls. The expert nonetheless scores it.
**Hypothesis.** The instruction is the entire cause. 8 cells, 6.2% of the suite,
all guaranteed misses from one sentence.
**Test.** Remove Two Finger from that list (leave Arc and Rotation, which the
expert also leaves null). Compare paired against noise-a.
**Risk.** Abstain-misses could become score-misses. The expert's range is high
(6.5–10) and models score high, so the expected direction is favourable, but it
must be measured.

### E9 — Per-criterion bias offsets from the eval, not from single corrections · PLANNED
**Observation.** Knees Bent is 87.5% miss, all too low (E2). Elbow is bimodal
(E7). These are *systematic*, per-criterion, and measurable over 129 cells ×
multiple runs — two to three orders of magnitude more evidence than the n=1
corrections that E2 correctly rejected.
**Plan.** Fit a per-criterion offset on a TRAIN split of fixtures, evaluate on a
held-out split. Report both. Overfitting is the obvious hazard and a split is
the only defence at this sample size.

---

### E10 — ROOT CAUSE of the Elbow failure: the measurement is not in the pixels
**This is the most important finding in the log and it is physical, not linguistic.**

The Elbow rubric asked the model to measure the elbow's sideways offset from the
ball's centreline **in ball widths**, and to tell half a width from one from two.
Measured against the actual stored frames:

| | |
|---|---|
| stored frame size | 464×832 to 720×1280 (phone video, under the 1280 cap) |
| shooter height | ~166 px |
| ball width | **21 px** |
| half a ball width — the 9-vs-7 call | **11 px** |
| quarter ball width — the 10-vs-9 call | **5 px** |

JPEG blocking artefacts are 8 px. **7 of 8 fixtures sampled are in this state.**
The distinction the rubric demanded does not exist in the image.

**That explains the symptom exactly.** On the 11 expert-corrected Elbow cells the
model emitted only `3, 4, 6, 7.5, 8, 8.5` — clustered at 4 and 8 — while the
expert scored `3, 4, 5.5, 6.5, 7, 7.5`. It gave *4* to shots the expert scored
4, 5.5, 6.5 AND 7. And it was **symmetric**: 3 cells too high by >1 point, 3 too
low. **No systematic bias, so no offset can fix it.** It is an inability to
resolve gradations, and it is why three successive rubric rewrites moved nothing:
no wording creates pixels.

**Fix (ELBOW v9).** Change the ruler, not the words. Shoulder width is ~45 px on
the same frame — **2.2× the pixels per unit** — so every distinction the model
must make roughly doubles in size. Anchors are now fractions of shoulder width:
a tenth (≈ one wrist) = 9, a quarter (≈ one head) = 7, a third = 6, a half
(elbow level with the shoulder edge) = 4. Falls back to the ball ruler only when
both shoulders are not visible, and says so in the reasoning when it does.
**Status: awaiting its arm.**

**Generalises.** Any criterion whose rubric asks for a sub-20-pixel judgement on
this footage is unfixable by wording. The ruler has to be a body landmark large
enough to survive a 166-pixel shooter.

---

## THE TARGET METRIC — must-score criteria

Product rule (owner, 2026-09-15): **only** Two Finger Release, Shot Arc and Ball
Rotation may be hidden from a player's report. Every other criterion must come
back with a score, so abstaining on one of those is a MISS, not a safe default.

The target is therefore miss rate over **123 must-score expert cells**:

| run | miss | rate | 95% CI | vs 5% |
|---|---|---|---|---|
| baseline (noise-a) | 66 | 53.7% | [44.9%, 62.2%] | NOT MET |
| baseline (qwen-reasoning) | 51 | 42.9% | [34.3%, 51.8%] | NOT MET |
| ELBOW v8 | **48** | **39.0%** | [30.9%, 47.9%] | NOT MET |

Reaching <5% means going from 48 misses to fewer than 6 — an **87% error
reduction** — while 28% of cells flip between two identical runs.

A label conflict was found and deliberately NOT resolved by editing labels: 4
expert cells expect a Two Finger *score* where the product wants it hidden. They
are hand-authored fixtures where the fingers may genuinely have been visible, so
changing them would be flattering the algorithm rather than fixing it. They sit
in the abstain-ok bucket and are reported separately.

## LIMITATIONS — read before trusting any target

1. **Sub-5% is not reachable on this model.** The consistent-error floor is
   29.5% and 53.5% of cells are coin-flips. No wording change addresses that.
2. **Production repeatability is unmeasured.** `claude-sonnet-4-6` has exactly
   one clean run (38%). The Anthropic account has no credits, so a second run —
   the one that would establish its error bar — cannot be made. Its true rate
   could plausibly be anywhere in the high 20s to high 40s.
3. **n = 129 expert cells is small.** At an observed 5% the Wilson interval is
   roughly [2%, 10%]. The suite cannot *prove* a sub-5% rate even if one were
   achieved; it can only fail to reject it.
4. **Abstention cannot rescue the target either.** Accepting only criteria whose
   pooled miss rate is ≤30% gives ~17.5% accepted miss at ~39% coverage.
   Reaching ~0% requires accepting the 14 cells from Forward Motion / Arc /
   Rotation / Thumb / Palm — 8.6% coverage, and n=14 gives a CI of [0%, 22%].

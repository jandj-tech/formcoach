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

---

## E12 — Catapult flag: dead subsystem, partially revived · KEEP (partial)
**Found.** All four critical flags had fired **zero times in 109 production
analyses**. The caps they exist to apply — a catapult forces Elbow, Shot Pocket
and Power to 4 or below — had therefore never once applied.
**Not the threshold.** Probed on the owner's own catapult (shot-196, "the ball
was in a V at the top and out", elbow 3.0) the model returned confidence
**1 of 10**. It did not recognise the shot as a catapult at all.
**Cause.** The definition required the ball over the crown or behind the
hairline. His catapult keeps the ball in FRONT of the forehead and slings it out
of a two-arm V. The flag could not fire on his own examples. This also resolved
a question previously logged as needing his adjudication: the notes are not
contradictory, there are two forms of one fault and only one was encoded.
**Result, shot-196:** confidence 1 → 8, Elbow 7.5 → **3** (expert 3.0),
Power 6 → 4 (expert 3.0, band [2,4]), Shot Pocket 9 → 4.
**But only 1 of 2.** shot-200, labelled "player catapults shot", still returns
confidence **0**. Correctly silent on both shots he said were NOT catapults
(shot-198, shot-202), so the boundary is right and the recall is not.
**Conclusion.** KEEP — it moves the right cells and never fires wrongly on the
negative cases. Recall needs more work; one more form is likely missing.

## E13 — ELBOW v9, shoulder-width ruler · KEEP (insufficient)
**Measured on the three cells it was built for**, against the live v5 rubric:

| shot | expected | v5 | v9 |
|---|---|---|---|
| shot-202 | [3, 5] | 9 | **6** |
| shot-198 | [3, 5] | 9 | 8 |
| shot-200 | [2, 4] | 8 | 8 |

Power on shot-202 went 9 → 6, converting a MISS to a PASS.
**Conclusion.** KEEP: it moves scores toward the labels and never away. But it
converts almost no Elbow misses, because the model still will not go below 6
where the expert says 3–5. Doubling the pixels per unit (ball 21px → shoulder
45px) still leaves the 'third vs half a shoulder width' call at about 7 pixels.
**Self-criticism.** v8/v9 tell the model most shots land 4–8 with a median of
6.5. That is true of the expert's distribution and it did stop the runaway 9s,
but it also discourages the legitimate 3s — one bias traded for a milder form
of the same one.

## E14 — KNEES v2 · NO EFFECT
2 misses before, 2 after, on the shared fixtures. The arithmetic diagnosis (a
points-sum whose top bands demanded "elite athletic load", so an ordinary
competent bend scored 5.6/10 against expected bands of [7,9] and [8,10]) is
sound and 14 of 14 misses were too LOW. The rewrite did not move the number.
**Conclusion.** Keep the file, claim nothing for it.

## E15 — Combined config (catapult + elbow v9 + square v6 + knees v2) · UNPROVEN
Paired on 24 shared fixtures vs baseline: 39 → 48 misses, **net +9 WORSE**,
11 fixed / 20 broken, **McNemar p = 0.1496**.
Targeted criteria improved (Square −2, Feet −2, Elbow −1, Connected −1);
untargeted ones moved the other way (Guide Hand FT +4, One Hand Release +3,
Shooting Hand FT +3). Direction of the new guide-hand misses was mixed — 7 low,
6 high — which is noise, not a systematic bleed.
**Conclusion.** Not demonstrated either way. At a 28% cell flip rate an effect
of 5–10 cells is unresolvable from one arm per config, which applies to every
arm-level comparison in this log.

### Two measurement errors I made, recorded so they are not repeated
1. **Claimed the catapult fix as a major win from ONE fixture.** It holds on
   shot-196 and fails on shot-200, which carries the same label. Probe every
   labelled instance before reporting.
2. **Chased "prompt bloat" off a bad measurement.** `wc -c` on a pipe truncated
   at exactly 65,536 bytes, making an override look 32,000 chars shorter than
   it was. The real difference is 515 chars. Measure through a file.

### Method change adopted
Verify a fix on **the cells it targets**, not on the suite total. A fix aimed at
catapult shots must be judged on catapult shots, where the effect is large and
the sample is the right one, then checked for collateral damage. A 3-cell fix
measured against a ±8-cell noise band cannot produce a usable answer.

## E16 — The pass ladder · **THE AVERAGING THESIS IS DEAD**
The decisive experiment of the whole accuracy effort, and it came back negative.

**The thesis it tested.** Byte-identical clips (shot-186/shot-191 and
shot-196/shot-200 are the same frames uploaded twice) scored differently on 10
of 18 criteria within a single run, mean delta 1.70. Working back gives
sigma ~= 1.2 and P(|err| > 1.0) = 41%, which matched the observed 40–54% miss
rate almost exactly. That made the miss rate look like pure nondeterminism, and
nondeterminism is the one error type that averaging removes, at sigma/sqrt(N).

**What ran.** 3 / 6 / 9 passes, `RUBRIC_OVERRIDE=elbow,square,knees`, on
qwen3.7-flash with per-cell `--dump`. An overnight network outage on the host
(15x ENOTFOUND on the Neon endpoint, plus EHOSTUNREACH/ECONNRESET on the
gateway) destroyed two of the three arms: the 6-pass arm lost **all 28**
fixtures and still printed `0 EXPERT accuracy failure(s)`, and the 9-pass arm
died on DNS before grading anything. Only the 3-pass arm produced data, on
17 of 28 fixtures. Both duplicate pairs survived, so the decisive diagnostic
was still computable.

**The correction that matters.** `aggregateRuns` takes the median across RUNS
(default 2), and each run is itself a median of ANALYSIS_PASSES. So a "3-pass"
dumped score is backed by **6 samples, not 3** — and every earlier baseline in
this log was also a 2-run median, while the 1.70 duplicate delta was measured
*within a single pass*. Comparing those two numbers directly was my error and it
is what made the noise thesis look arithmetically airtight.

**Result, against the pure-noise prediction at N=6:**

| quantity | predicted | observed |
|---|---|---|
| duplicate-pair delta | 0.69 | **0.73** (shot-186/191) |
| must-score miss rate | ~4% | **40.2%** (35/87, CI [30.6, 50.7]) |

The variance reduction landed on the prediction. The accuracy did not move a
single point. Those two facts together are only possible if the error is **not
centred on the expert's band**: averaging is converging, reliably, on the wrong
number.

**Signed-error decomposition (3-pass arm, 87 must-score cells).** Globally
21 low vs 12 high, sign test p = 0.16 — there is no single leniency bias. It is
a mixture, and per criterion the directions are sharp:

```
Dominant Foot Forward         4 low, 0 high   -1.50   directional
Feet Shoulder Width Apart     0 low, 4 high   +0.88   directional (opposite)
Connected Shot                2 low, 0 high   -1.25   directional
Knees Bent                    2 low, 0 high   -1.00   directional (v2 still harsh)
Shooting Through Guide Hand   4 low, 1 high   -1.00   directional
Elbow L-Shape                 2 low, 2 high   +-1.13  SYMMETRIC = genuine noise
Guide Hand Placement          6/6 inside       0.00   already solved
```

Elbow being symmetric is consistent with E11, where per-criterion offsets for
Elbow did nothing. It is the one criterion whose error really is noise.

**Conclusions.**
1. **Do not buy accuracy with passes.** 6 samples per cell cost 6x compute for
   zero accuracy. Production should run 1 pass; iteration runs at 1 pass too,
   turning a ~2h cycle into ~25min.
2. **The target is bias, and bias lives in the rubric.** Which is where the
   next finding points.
3. An arm that loses fixtures is not a weaker measurement, it is a different
   one. `run-eval.mjs` now retries transport failures (`EVAL_FIXTURE_ATTEMPTS`,
   default 3, 30s then 2m backoff) and prints an `ARM NON-COMPARABLE` banner,
   because "0 failures out of 0 fixtures" reads as a clean sweep.

## E17 — Why the bias is there: 12 of 15 criteria have no rubric · DIAGNOSIS
Ranking each criterion by `weight x miss rate` against the size of the
instruction it is graded from:

```
criterion                        wt   miss   rubric chars   draft
Shooting Through Guide Hand    2.50   5/10        93        -- NONE --
Dominant Foot Forward          1.00    4/5        99        -- NONE --
Guide Hand Follow Through      1.75    3/7        96        guidehand (off)
Elbow L-Shape                  1.75   4/10        81        elbow.txt
Feet Shoulder Width Apart      1.50   4/11       121        stance (off)
Shooting Hand Follow Through   2.50    1/5       103        -- NONE --
Connected Shot                 1.00    2/5        95        -- NONE --
Guide Hand Placement           1.00    0/6        89        -- NONE --
```

The three criteria with a rewritten rubric carry 4,000–11,000 characters of
gradeable instruction. **Every other criterion is still its original one-line
description of 67–121 characters.** The heaviest criterion in the entire rubric,
`Shooting Through Guide Hand / One Hand Release` at weight 2.50, is missing 50%
of the time and is graded from a single 93-character sentence.

The top five by weighted miss load are **54% of the total**, and four of those
five have no rubric at all. This is the most plausible mechanism for a
*directional* error: asked to score a fault it has not been told how to
recognise, the model falls back on its own prior, and a prior is an offset.

**Caveats held open.** n per criterion is small (Dominant Foot Forward is n=5),
this arm is 17 fixtures not 28, and E15 already showed that targeted rubric
gains can be cancelled by collateral movement elsewhere. So the *shape* of the
diagnosis is well-supported; the per-criterion offset sizes are not.

**Method for what follows.** Rubric content is being sourced from the documented
teaching of **Herb Magee** (Hall of Fame shooting coach, "The Shot Doctor"),
which is the form model this product grades against, with every claim
attributed. Writing rubrics from the eval's own residuals would be fitting to
the test set; sourcing them from the authority the expert labels came from is
not. Offsets fitted numerically per criterion remain OFF for the same reason.

### E17 self-check — the "no rubric ⇒ bias" mechanism is NOT demonstrated
Tested my own diagnosis before acting on it, and it does not survive as stated.

Correlating rubric length against miss rate across the 12 undrafted criteria
gives r = -0.413, which looks supportive — but it is an artifact. It is carried
entirely by `Thumb is Spread Wide` and `Palm Non-Contact with Ball`, which are
**n=1 cells each**, both missed, both short. Excluding criteria with n<3:

```
r = +0.137   (10 criteria)   i.e. nothing
```

Worse, the predictor has no variance to correlate against: every undrafted
criterion sits between **87 and 121 characters**. They are all one sentence. You
cannot measure the effect of rubric length inside a set that has only one
rubric length.

**Two direct counterexamples in the data:**
- `Guide Hand Placement` — 89 characters, **0/6 misses**. A one-liner is
  sometimes entirely sufficient.
- `Knees Bent` — given a full 4,200-character rewrite in E14 and the miss count
  did **not** move (2 before, 2 after).

**Supporting case:** Elbow v9 (E13) did improve on its own cells.

**Revised position.** Writing a specific, sourced rubric is the only lever left
that has *ever* produced a gain on this suite, and the heaviest-miss criteria
happen to be the ones without one — but "short rubric causes the bias" is an
unproven mechanism, not a finding, and the honest expectation is that some
rewrites will do nothing (Knees) and some will help (Elbow). Each one gets
tested on its own cells per the E15 method change, one at a time, and a rewrite
that does not move its own cells gets reported as a null and kept only if it is
defensible on content grounds.

What the data DOES support without qualification: the error is directional per
criterion (E16), so there is a systematic standard mismatch to find. Where that
mismatch lives is still open.

## E18 — **FOUND IT: the legacy points-sum rubric arithmetic is the bias**
This supersedes E17. The predictor of a *directional* miss is not rubric length,
it is rubric **structure**.

Six criteria are still graded by the original generator's template: score N
sub-criteria worth 4/3/2 points, sum, divide, scale to 10 — with the top band of
each sub-score reserved for "elite", "perfect" or "flawless". Classified by the
text **actually used** in the p3 arm (elbow/square/knees were overridden with
prose drafts, so they count as prose regardless of what the DB still holds):

```
LEGACY POINTS-SUM                     33 cells, 39% miss  ==> 12 LOW vs  1 HIGH   p = 0.0034
  Dominant Foot Forward                5 cells   4 low  0 high   -1.50
  Shooting Through Guide Hand / One…  10 cells   4 low  1 high   -1.00
  Connected Shot                       5 cells   2 low  0 high   -1.25
  Forward Motion and Toes              3 cells   1 low  0 high   -2.50
  Shot Pocket — Elbow                  4 cells   1 low  0 high   -0.50
  Guide Hand Placement                 6 cells   0 low  0 high      —

PROSE (rewritten, or already prose)   52 cells, 38% miss  ==>  9 LOW vs 11 HIGH   p = 0.82
  Feet Shoulder Width / Elbow / Square / Knees / Power / Hand FT / Guide Hand FT
```

**The two groups have the same miss RATE and opposite error STRUCTURE.** The
legacy group is 12:1 downward, which is a bias. The prose group is 9:11, which
is symmetric noise. This is the same mechanism diagnosed for Knees v1 in E14
(14 of 14 misses too low, every one of them), now shown to generalise across
six independent criteria at p = 0.0034.

It also explains E14's apparent null. Rewriting Knees moved it out of a biased
group into a noisy one; the miss *count* stayed at 2 because the arithmetic fix
removes direction, not variance. Judging that rewrite by its miss count was the
wrong test — the right test is whether the error stops being one-directional.

**What this predicts, and the honest ceiling.** Rewriting the six legacy rubrics
should recover most of the 12 directional misses. It should do **nothing** for
the prose group's 20 symmetric misses. Projected: ~85 must-score cells,
~20 residual misses, **~24%** — better than 40%, and still nowhere near 5%.

So the target needs BOTH:
1. **Bias (legacy arithmetic)** → prose rewrites with reachable top bands. Known
   mechanism, ~12 cells.
2. **Noise (prose group)** → NOT fixable by averaging (E16) and not by rubric
   direction. The model cannot resolve the feature it is being asked to measure,
   so the fix is to stop asking for a fine measurement and ask for a
   **categorical visible cue** instead. See E19.

## E19 — Sourcing the rewrites: Herb Magee, and what the research actually found
Three research passes on the documented teaching of Herb Magee (the form model
this product grades against), every claim required to carry a URL and a label of
verified-Magee / general-consensus / unverifiable. Findings that change the work:

**A camera-robust replacement for the Elbow measurement.** Magee diagnoses a
flared elbow through the **grip, not the elbow**: "If you see your pinky, your
elbow is sticking out." That is a categorical, visible check, and it is exactly
the kind of cue E18's noise group needs — Elbow has been unfixable precisely
because it asks for an ~11px offset judgement on 8px JPEG blocks (E9). Pinky
visibility does not require sub-pixel measurement.
Source: 2015 NABC clinic notes (Kosel transcription),
https://hoopschalktalk.wordpress.com/2015/08/22/herb-magee-how-to-shoot-the-perfect-shot/

**Two premises in our rubric are misattributed and must not be sourced to him:**
- **"Dominant foot slightly forward"** is NOT Magee. It traces to Knudson (1993)
  and is general coaching consensus. Magee is on record *de-prioritising*
  footwork relative to the hands (the Rick Carlisle exchange, Philadelphia
  Inquirer 2011-08-07). Notably our expert scores this criterion HIGH while the
  grader scores it LOW by 1.50 — the expert's leniency is consistent with
  Magee's de-emphasis, and the grader's harshness is not.
- **"Power comes from the legs"** has NO Magee source. His "Legs" element is
  about footwork and landing, not power generation, and the claim is actively
  contested in coaching literature. `Source of Shot Power` cannot be written as
  Magee doctrine.

**Explicit gaps — do not fabricate these:** Magee has no documented shot-pocket
position, no "same place every time" set-point, no kinetic-chain / "connected
shot" concept (his nearest named faults are a *hitch* and *pushing* the ball),
no stance width, and no knee-bend depth or timing. He gives **no numeric
thresholds anywhere** — every number in our rubrics is ours and must be labelled
as ours. The three points he does teach about ball position exist only inside a
paid DVD and are not retrievable.

**Positively verified and usable:** the elbow is a hard fault for him, "straight
and under the basketball", forearm/upper arm forming an "L" not a "V"; the ball
must not hit the palm; shoot *through* the guide hand, which he calls his most
important element; the stroke is not complete at release (wrist snapped, off the
proper fingers, through the guide hand) and dropping the hands is a named fault;
he prefers landing **slightly ahead** of the launch point and explicitly rejects
"straight up and straight down", while separately rejecting *following* the
shot — a rubric must not conflate the drift (correct) with the extra step
(fault). His error model is four ways to miss: short, long, right, left.

**Method consequence.** Where Magee is documented, rubrics quote him with a
source. Where he is not, the rubric says so in the file and is written to the
**expert's demonstrated standard** from the fixture labels, with provenance
labelled honestly rather than dressed as doctrine. Writing rubrics from the
eval's own residuals would be fitting to the test set and is not done.

## E20 — **The grader is only weakly measuring what the expert measures**
Correlating the grader's score against the expert's band midpoint, per criterion.
This is the measurement that should have been taken first, and it reframes the
whole effort.

```
criterion                        n   expert sd  grader sd   r
Forward Motion and Toes          3      0.51       2.01    +0.01
Square to the Basket             6      1.57       2.61    +0.07
Shooting Hand Follow Through     5      0.29       0.80    +0.34
Shooting Through Guide Hand     10      1.69       1.28    +0.38
Elbow L-Shape — Under the Ball  10      1.85       1.37    +0.40
Guide Hand Follow Through        7      1.59       1.47    +0.41
Source of Shot Power            10      1.80       1.63    +0.44
Guide Hand Placement             6      0.38       0.37    +0.45
Shot Pocket — Elbow              4      0.32       0.94    +0.62
Dominant Foot Forward            5      0.46       1.56    +0.73
Connected Shot                   5      0.60       1.17    +0.77
Feet Shoulder Width Apart       11      2.10       1.96    +0.91
Knees Bent                       3      0.47       1.08    +0.98   (n=3, ignore)

POOLED  n=85   r = 0.498      expert sd 1.88   grader sd 1.67
```

**Pooled r = 0.50: the grader accounts for about a quarter of the variance in
the expert's judgement.** Two distinct failure modes, which need different fixes
and have been conflated all session:

1. **No discrimination (r ~ 0).** `Forward Motion and Toes` (r = +0.01) and
   `Square to the Basket` (r = +0.07) produce scores essentially unrelated to
   the expert's, while varying MORE than the expert does (sd 2.01 vs 0.51 and
   2.61 vs 1.57). The grader is not measuring the feature; it is generating
   plausible numbers. No amount of recentering fixes this.
   Note `Square` is one of MY rewrites (v6) — the rewrite did not make it
   measure the right thing.
2. **Tracks but over-reacts.** `Dominant Foot Forward` (r = 0.73, grader sd 1.56
   vs expert 0.46) and `Connected Shot` (r = 0.77, 1.17 vs 0.60) follow the
   expert's ranking but amplify it. The expert treats these as narrow-range
   criteria; the grader swings across the scale.

**A caution that undercuts an earlier claim.** I called `Guide Hand Placement`
"already solved" at 0/6 misses. It is not. Its expert sd is 0.38 and its grader
sd is 0.37 — the expert always says ~7.7 and the grader always says ~7.7, so
every cell lands inside the band by construction. r = 0.45 on essentially no
variance. It passes by not discriminating, and would fail the moment a genuinely
bad guide hand appeared in the suite. Do not count it as evidence of anything.

**What this means for the <5% target, stated plainly.** With expert spread
sd ~1.9 and tolerance bands of about +-1.3, keeping 95% of cells inside the band
requires a grader error sd around 0.65, which at these spreads means r ~ 0.95.
The pooled r is 0.50. The gap is not calibration and it is not noise averaging;
on several criteria the model is not detecting the feature at all.

**Consequence for the method.** A rubric rewrite can only help where it changes
WHAT THE MODEL LOOKS AT. Recentering a criterion whose r is 0.07 will move the
miss rate by luck alone. So each rewrite is now judged on **two** numbers, not
one:
  - r against the expert (did it start measuring the right thing?)
  - miss rate and error direction (is it centred?)
and r is the primary one, because a centred non-measurement is still a
non-measurement. This also means the E18 projection of ~24% is optimistic: it
assumed removing bias converts those cells to hits, which only holds where the
grader actually discriminates.

This is also why Magee's own diagnostics matter more than better prose. His
pinky test ("if you see your pinky, your elbow is sticking out") replaces a
sub-pixel geometric measurement with a categorical, visible presence/absence
check. That is an intervention on what the model looks at, which is the only
class of change E20 says can work.

## E21 — Klay Thompson research: several of our criteria penalise elite form
Requested as a second reference shooter. The findings converge with the Magee
research (E19) from an independent direction, which makes them harder to dismiss.

**Our worst criterion grades a contested thing.** `Forward Motion and Toes` has
r = +0.01 — it measures nothing — and what it claims to measure is not agreed
among analysts. Dylan Murphy's frame breakdown (Bleacher Report) documents Klay's
backpedal as "exaggerated", his feet landing IN FRONT of the takeoff point, and
states he is not balanced by the conventional definition. Brian McCormick's study
of the 37-point quarter found him jumping backward, straight up, slightly forward
and forward on different shots in the same quarter. Gary Maitland (Sky Sports)
says the opposite — no drift. **There is no expert consensus that a good shooter
lands where he took off**, and Magee independently rejects "straight up and
straight down" while preferring a landing slightly ahead (E19). A criterion that
rewards a vertical landing penalises both reference shooters.

**Footwork is secondary, from both authorities.** Klay, crediting Dave Hopla,
names squared shoulders as his one invariant and says foot and hip position does
not matter if the shoulders are square. Magee answered footwork-first coaching by
pointing at the grip. This is exactly why our expert scores `Dominant Foot
Forward` in [7,10] on every shot while the grader scored it 4.5-7.5 — **the
expert is right and the grader is applying a standard neither authority holds.**
Acted on: `scripts/rubrics/domfoot.txt` v1, scale starting at 8 for any
reasonable base, square feet explicitly a 9 and not a fault.

**Three more places a strict rubric marks down the model shooter:**
- Murphy: Klay uses a MINIMAL follow-through under pressure and does not hold it;
  the extended hold shows up mainly on open shots. A "must hold the finish"
  criterion fails him.
- No source claims Klay's elbow is directly under the ball. The strongest claim
  anyone makes is "in line with the shoulder" (Faizal, Splash Lab), a weaker
  standard than our criterion's name asserts.
- The dip is irreconcilable in the sources: two detailed breakdowns and a
  peer-reviewed study (Penner, Frontiers in Psychology 2021) list Klay as a
  dipper, while Klay's own phrase is "Catch high keep it high". **Do not score
  absence of a dip as a fault** — relevant to `Knees Bent`, whose misses are all
  too low.

**A caution about the whole approach**, worth recording because it came from a
named coach and a PhD rather than from us: Faizal's own closing warning is not to
copy a pro's form wholesale, since body type, height, age, strength and hand size
all differ. McCormick goes further — shot-to-shot variation is not error, and
expert shooters show stability WITH the capacity to change. Both cut against
grading a child's shot by geometric similarity to an NBA template. This does not
invalidate the criteria, but it argues for lenient scales and wide bands on
anything postural, which is the direction the expert's own labels already point.

Also noted: Klay's form CHANGED after his Achilles injury (wider base; leftward
movement threes fell 43% -> 31%, Swish Theory). Pre-2020 clips are the correct
reference.

## E22 — Candidate arm (elbow v11 + onehand v2 + global prompt fixes) · CONFOUNDED
First clean full-suite arm in days: **28 fixtures, 0 lost**. Also a confounded
one, because I changed four things at once — my own stated method says not to.

```
MISS RATE  52/116 = 44.8%   CI95 [36.1, 53.9]
POOLED r   0.264            (expert sd 1.77, grader sd 1.99)
DIRECTION  22 low vs 30 high, sign test p = 0.33 (no systematic bias)
```

**Why the comparison against E16's 38.8% / r = 0.498 is invalid.** That arm was
17 fixtures at 3 passes x 2 runs (6 samples per cell); this one is 28 fixtures at
1 pass. Four differences at once: pass count, fixture set, two rubrics, and the
global prompt.

The pass count matters for r in a way it does not for the miss rate, which I had
not accounted for. r is attenuated by measurement noise:
`r_obs = r_true * sqrt(sigma_true^2 / (sigma_true^2 + sigma_noise^2))`.
With sigma_noise ~ 1.2 at one pass and ~0.49 at six samples, the attenuation
factors are 0.80 and 0.96, predicting an r ratio of **0.84**. Observed ratio is
**0.53**. So noise explains part of the fall and not all of it — but with a
different fixture set underneath, this cannot be pushed further. **E16's
conclusion that passes buy no accuracy stands for the MISS RATE and is wrong for
r: averaging does improve r, mechanically.** Iterating at 1 pass is still right
for speed, but r must only ever be compared between arms at the same pass count.

**The one signal worth acting on: elbow v11 looks like a regression.**
```
            n  miss  low high      r    e.sd  g.sd
v9  (E16)  10     4    2    2   +0.40  1.85  1.37
v11 (E22)  14    12    3    9   +0.10  1.90  2.29
```
Symmetric error became 9-too-high, r fell, and the grader's spread went ABOVE the
expert's. A plausible mechanism: v11's readings put their midpoints at 9 / 6 / 3
and START the best reading at 8, so a "stacked" reading cannot score below 8.

**And an uncomfortable methodological finding.** v11 deleted this text, which the
review correctly identified as test-set leakage — it states the expert's own label
distribution to the model:

    "MOST SHOTS LAND IN BAND 2. Across every correction the expert has made on
     this criterion the scores run from 3 to 8, with a median of 6.5."

Removing it was right: telling the model the label distribution raises pass rate
without improving perception and collapses variance, which drives r down. But it
was also **load-bearing** — it was holding scores off the top of the scale, and
without it they drifted up. So leakage and usefulness were the same sentence.
The honest resolution is not to put it back but to get the same restraint from a
PERCEPTUAL claim ("most shots have the arm leaning, not standing vertical") that
does not encode the labels.

**Control arm launched**: identical config with elbow v9 restored, so the paired
per-cell comparison isolates v11 against v9 under the same pass count, fixture
set, prompt and companion rubrics. That is the experiment E22 should have been.

## E23 — The global SCALE block is a 9-attractor and suppresses half points
Found by looking at what scores the grader actually EMITS, which I had not done.

```
cand arm, 1 pass, 345 scores:
  distinct values used   2 3 4 5 6 6.5 7 8 9 10     (ten values)
  half points used       1 of 345  (0%)
  scores at exactly 9    119 of 345 (34%)
  scores at 10           3
```

p3's 36% half-point rate was an ARTEFACT: those scores are medians across
passes, and a median of {7,8} is 7.5. The model itself, asked once, emits
integers. The global prompt mandates whole-or-half points, so this is a defect,
and the mechanism is in the scale block itself:

```
- 10 = no visible flaws
- 9 = one small specific thing clearly visible and slightly off
- 8–8.5 = one minor clearly visible issue
- 7–7.5 = decent, clear room to improve
- 5–6 = obvious problems
- 3–4 = poor
- 1–2 = fundamentally wrong
```

Three faults, all mechanical:
1. **Half points are only OFFERED between 7 and 8.5.** Below 7 the bands are
   integer pairs, so there is no 4.5 or 5.5 on the menu. That is exactly where
   the emitted scores are integers.
2. **"9 = one small specific thing slightly off" is trivially satisfiable**, and
   it sits next to a 10 that requires nothing wrong at all. Every shot with one
   nameable blemish lands on 9 — a third of all cells. The MANDATORY 10 RULE
   forbids 9 as a hedge and 9 is functioning as precisely that.
3. **The bands score FLAW COUNTS, not the criterion's own anchors**, so they
   contradict every rewritten rubric. A rubric saying "8 is the ordinary
   competent shot" is overridden by a global band saying 8 means "one minor
   clearly visible issue". This is the likely reason careful anchor work
   (knees v2, E14) produced no movement.

Staged as a reversible patch at `/tmp/bias/patches/scale-fix.js`: criterion
anchors take precedence, half points are stated as expected at every level with
the measurement quoted, the 9 band is narrowed, and 8 is named as where ordinary
competent technique belongs. NOT applied yet — it is queued as its own arm so it
does not confound the crop test.

**Test queue, one variable per arm:**
1. control (elbow v9, everything else as E22) — running, decides elbow v11
2. crop to shooter (EVAL_CROP=1) — decides the resolution intervention
3. scale-fix — decides the global scale block

Each is kept only if it wins its paired comparison, and reverted otherwise.

## E24 — elbow v11 vs v9, controlled · **v11 REVERTED**
The experiment E22 should have been: identical config, identical fixture set,
identical pass count, one rubric file different.

```
                 all cells        Elbow cells    Elbow r
elbow v11      52/116 = 44.8%        12/14        +0.10
elbow v9       53/116 = 45.7%         8/14        +0.30

PAIRED, 116 shared cells: fixed 19, broke 20, net -1, McNemar p = 1.0000
pooled r 0.264 -> 0.236
```

Whole-suite: indistinguishable. On the cells it targets (E15's method change),
v9 is better — 8 misses against 12, and roughly triple the correlation. v11 also
shows the 9-too-high pattern its scale design predicts (its best reading starts
at 8, so a "stacked" call cannot score below 8). **Reverted to v9.** The
landmark-band idea was wrong: the review's arithmetic was right that a projected
ball-edge threshold is v9's finest step promoted to the highest-stakes decision.

### The measurement-power problem this exposed — read before designing any arm
These two arms differed in ONE rubric file, and **39 of 116 cells flipped**.
Elbow cells are 14 of 116, so at most 14 of those flips could be the change; the
rest is 1-pass nondeterminism, running at roughly a third of all cells.

Consequences, which invalidate how most of this log's comparisons were designed:
- **One arm per config cannot resolve an effect below about +-10 cells.** With
  ~34% of cells flipping, the SD of the miss count on 116 cells is ~5.1, so a
  10-cell move is barely 2 SD.
- On a single criterion it is worse: 14 cells at a 34% flip rate gives SD ~1.8,
  so the 4-cell elbow signal is ~2.2 SD. Suggestive, not established.
- E16 concluded that passes buy no ACCURACY, and that stands. But passes do buy
  **attribution**: averaging cuts this flip rate, and without it a targeted fix
  of 3-5 cells is unmeasurable. Iterating at 1 pass is right only for changes
  expected to be LARGE.

So from here: only large effects get tested at 1 pass, and a change that cannot
produce a large effect is not worth shipping at this noise level anyway. A
genuinely promising small effect needs either more passes or more fixtures
asserting that criterion.

### Process error repeated
`crop-boxes.mjs` first ran with no model env var, so `detectModel()` fell back to
claude-sonnet-4-6 and returned "credit balance is too low" 28 times. This is the
SAME mistake logged earlier in this file for a timing test. Any script that makes
a model call needs ANALYSIS_MODEL/DETECT_MODEL set explicitly — the fallback is
a paid provider with an empty balance.

## E25 — **CROP TO SHOOTER: r nearly doubles, miss rate worsens** · KEPT, bias to fix
The one intervention that changed what the model can SEE rather than how it is
described. Identical config to E24's control (elbow v9, square, knees, onehand,
1 pass, 28 fixtures), one variable: EVAL_CROP=1.

```
                     miss rate          pooled r   direction
uncropped (e9)    53/116 = 45.7%          0.236    31 low / 22 high  p=0.27
cropped           65/112 = 58.0%          0.469    57 low /  8 high  p=0.0000

PAIRED, 112 shared cells: fixed 14, broke 29, net -15, McNemar p = 0.0315
```

**Read the two numbers separately, because they say opposite things.** The miss
rate got significantly worse. The correlation with the expert nearly DOUBLED —
the quantity that had refused to move all session, and the one that cannot be
fixed by calibration.

Per criterion, r before -> after:
```
Elbow L-Shape              +0.30 -> +0.73   grader sd 1.98 -> 0.80, 8 low 0 high
Dominant Foot Forward      +0.03 -> +0.62
Feet Shoulder Width        +0.29 -> +0.64
Source of Shot Power       +0.05 -> +0.38
Knees Bent                 +0.94 -> +0.82   (n=4, noise)
Shooting Through Guide Hd  +0.35 -> +0.11   WORSE
Guide Hand Follow Through  +0.09 -> +0.06   flat
```

**The mechanism is confirmed and my pre-registered prediction was half wrong.**
I predicted gains on Elbow, One Hand Release and Guide Hand — hand/ball-scale
features — and no gain on finger-scale detail. Elbow delivered hugely. But the
guide-hand criteria did NOT improve, while whole-body criteria I did not predict
improved most. The patch-count mechanism holds; I mis-assigned which criteria
depend on which spatial scale. Feet, stance, knees and power are WHOLE-BODY
features and gain most from a 2.1x crop; the hand at ~15px is still only ~2.3
patches after the crop, which is evidently not enough.

**What the crop did to the error structure.** It converted a symmetric,
uncorrelated error into a strongly one-directional one: 57 low against 8 high at
p = 0.0000, with Elbow's grader spread collapsing from 1.98 to 0.80 against the
expert's 1.90. The model can now see flaws it previously missed, the global
prompt says deductions require a visible flaw, and so it deducts — harder than
the expert does, and over a narrower range.

**Why this is kept despite the worse headline number.** Low r and directional
bias are not equally tractable. Low r means the model is not measuring the
feature, which no amount of scale calibration repairs and which is the diagnosed
cause of this whole effort's failure (E20). A one-directional bias IS repairable
by rubric content — that is exactly what E18's points-sum finding, the lenient
domfoot scale and the staged scale-fix were written for. The crop traded an
unfixable problem for a fixable one.

Caveats held open: 24 of 28 fixtures got a box, so 4 graded uncropped and dilute
the effect by ~14%; 112 shared cells rather than 116; one cell returned null on a
criterion that must always score. Boxes come from the detect model via
scripts/eval/crop-boxes.mjs and were checked BY EYE on the tightest three before
use — box size was validated in code but box SHAPE was not, and shot-206 passed
at aspect 6.6 (5% of frame width), rescued only by the margin. Add an aspect
check before trusting this unattended.

Margins 0.08 x / 0.12 y, chosen from the measured trade-off: 0/0 gives 3.9x mean
linear gain, 0.08/0.12 gives 2.1x, 0.12/0.22 gives 1.7x — and below about 2x the
hand falls back under two patches and the point is lost.

**EVAL-ONLY so far.** Shipping requires a box on every real upload, and the
recorded production failure in lib/frame-extraction.ts was precisely a bad box
cutting the player out of shot. That is separate work, not a flag flip.

## E26 — Bias fix on top of the crop · scale fix KEPT-PENDING, **domfoot REVERTED for gaming the metric**
Two changes bundled (stated as a bundle): the global scale-fix patch, and
domfoot v1. Both target the one-directional bias the crop exposed in E25.

```
                      miss rate        pooled r   direction
crop alone         65/112 = 58.0%        0.469    57 low /  8 high
crop+scale+domfoot 61/116 = 52.6%        0.416    48 low / 13 high
PAIRED, 112 cells: fixed 18, broke 12, net +6, McNemar p = 0.3616
```
Net improvement is **not significant**, and pooled r fell slightly.

### domfoot v1 REVERTED — it won cells by stopping measuring
```
Dominant Foot Forward:  crop  6/6 misses, r = +0.62
                        +rubric  0/6 misses, r = n/a, grader sd = 0.00
```
The rubric took the criterion from "ranks the stance correctly but scores it far
below the expert" to "emits a constant number". Six cells recovered on the
headline metric, and the measurement destroyed: with zero variance every cell
lands inside the expert's band by construction, which is exactly the
`Guide Hand Placement` pathology called out in E20 — passing by not
discriminating, and guaranteed to break the moment a genuinely bad stance
appears.

The cause is my own rubric design. It said the scale starts at 8, square feet
score 9, and scores below 5 should be rare — sourced defensibly (Magee
de-prioritises footwork; Klay says feet do not matter if the shoulders are
square) and calibrated to an expert who puts every shot in [7,10]. But leniency
plus a narrow expert range is an instruction to output a constant. **A rubric
that improves the miss rate by collapsing its own variance is gaming the test,
and the improvement is not real.** Reverted.

Lesson for every remaining rubric: a lenient scale must still be REQUIRED to
discriminate. Check grader sd against expert sd on every rewrite — E20's verdict
column already flags `undiscriminating`, and I should have read my own tool's
output before accepting the gain.

### The scale fix looks genuinely useful, and is being isolated
```
Elbow L-Shape:  crop        8/14 misses, r 0.73, grader sd 0.80
                +scale+dom  5/14 misses, r 0.62, grader sd 1.90  (expert sd 1.90)
```
The crop had collapsed Elbow's spread to 0.80 against the expert's 1.90; the
scale fix restored it to 1.90 exactly and recovered 3 cells. That is the
half-point availability and anchor-precedence change doing what it was designed
to do. Re-running crop+scale WITHOUT domfoot to attribute it cleanly.

### Standing best miss rate is still the UNCROPPED arm
```
e9   uncropped, no scale fix   45.7%   r 0.236
crop                           58.0%   r 0.469
crop + scale + domfoot         52.6%   r 0.416
```
The crop has not yet paid for itself on the target metric. It bought a large,
real gain in the quantity that matters mechanically (r) and has so far cost more
than it returned on the quantity being asked for (miss rate). If crop+scale
alone does not close that gap, the crop gets reverted per the standing rule, and
the honest conclusion is that resolution — not rubric wording — is the ceiling,
making upload quality the next lever rather than anything writable.

## E27 — **CROP REVERTED.** It doubles r and never wins the miss rate
Isolated crop+scale (no domfoot) against the uncropped baseline:
```
PAIRED, 116 shared cells: fixed 21, broke 29, net -8, McNemar p = 0.3222
pooled r 0.236 -> 0.346
```
Three arms, one consistent verdict:
```
vs uncropped baseline (e9, 45.7%, r 0.236):
  crop alone            net -15 cells   p = 0.031   r -> 0.469
  crop + scale + dom    net  +6 on crop; still behind baseline   r -> 0.416
  crop + scale          net  -8 cells   p = 0.322   r -> 0.346
```
The crop buys a large, repeatable gain in correlation and costs cells on the
target metric every single time. **Reverted** under the standing rule. EVAL_CROP
defaults to off, so the code path stays for the record; it does not ship and it
is not counted as a win.

### What it established anyway, and why it matters more than the revert
Three generations of Elbow rubric — ball widths, then shoulder-width fractions,
then landmark bands — all landed at r = 0.10-0.40. The ONLY change that has ever
moved that number was giving the model more patches on the body: r = 0.73 under
the crop, with the grader's spread matching the expert's exactly once the scale
fix was added. Whole-body criteria moved the same way (Dominant Foot Forward
0.03 -> 0.62 and, with the scale fix, 0.94; Power 0.05 -> 0.44).

So the ceiling on this grader is **spatial, not textual**. That is the single
most useful conclusion of the session and it re-orders the remaining work:
- Rubric rewriting is near its ceiling. It can fix DIRECTION (E18's points-sum
  finding is real and reproducible) but not DISCRIMINATION.
- The lever with headroom is how much of the frame the shooter occupies. The
  extraction ladder currently degrades to `scale 0.5, quality 0.35` to fit a
  3.8MB upload budget, and clips under 500px on the short edge miss 61% against
  41% for the rest (p = 0.07-0.09, suggestive, n = 24 clips).
- A shipped crop needs a reliable box on every real upload. The failure recorded
  in lib/frame-extraction.ts — a box that cut the player out of shot entirely —
  is the thing to engineer against, and the eval run here needed a BY-EYE check
  to catch a box at aspect 6.6 that passed every coded validation.

### Why the crop loses cells while seeing better
It converts a symmetric, uncorrelated error into a sharp one-directional one:
47-57 low against 8-14 high, p = 0.0000 in every cropped arm. The model sees
flaws it previously missed, the prompt requires a visible flaw to deduct, and it
deducts harder than the expert. With the tolerance band at +-0.3 a correct
RANKING that sits 1.5 points low misses every cell, while an uncorrelated score
parked near the expert's mean hits many by luck. **The miss rate rewards being
centred over being right**, which is why it moved opposite to r here, and is a
limitation of the metric the target is written against.

## E28 — **SCALE FIX KEPT.** Best arm of the session on both metrics
Isolated against the uncropped baseline, no crop, no domfoot:
```
                   miss rate                      pooled r  direction          grader sd
baseline (e9)   53/116 = 45.7%                      0.236   31 low / 22 high     1.98
scale fix       48/116 = 41.4%  CI95 [32.8, 50.5]   0.377   26 low / 22 high     1.77
                                                            p = 0.67             (expert sd 1.77)
PAIRED: fixed 18, broke 13, net +5, McNemar p = 0.4731   0 fixtures lost
```
**KEPT.** Three statistics moved coherently in the direction the mechanism
predicts: miss rate down 4.3 points, r up 60%, and the grader's spread landed on
the expert's exactly while the directional bias disappeared. That last pair is
the signature of a real gain — a change that games the metric NARROWS the spread
and passes by not discriminating (see domfoot, E26). This did the opposite.

Per-criterion gains: Shooting Through Guide Hand r 0.35 -> 0.65 (the heaviest
criterion in the rubric), Feet Shoulder Width 0.29 -> 0.65 with misses 9 -> 6,
Guide Hand Follow Through 0.09 -> 0.49 with misses 5 -> 2, Shot Pocket 1 -> 0.
One regression: Elbow r 0.30 -> 0.24, misses 8 -> 9 — and under the crop Elbow
hit 0.73, so Elbow specifically wants pixels, not wording.

**Not proven: McNemar p = 0.4731.** The +5 cells sit inside the ~1/3 cell-flip
noise and the confidence intervals overlap. The coherence of three statistics is
what lifts it above "probably noise", not the p-value.

## E29 — **The miss-rate metric rewards not measuring.** Read before targeting it
```
best single constant for every cell (8)         36.2% miss
best constant PER criterion (a lookup table)    28.4% miss
the actual vision grader                        45.7% miss
```
**A 13-row lookup table with no model at all beats the grader by 17 points**, and
7 of 13 criteria score PERFECTLY off a constant (Guide Hand Placement 0/7 at a
flat 7.5, Dominant Foot Forward 0/6 at 8, Shooting Hand Follow Through 0/8 at 6).

Three consequences:
1. domfoot (E26) was not an anomaly, it was converging on the metric's optimum.
   Where a criterion's expert bands are narrow and clustered, the miss-rate
   optimum IS to stop discriminating. Any change that raises genuine
   discrimination without perfect calibration will look WORSE — which is exactly
   what happened to the crop (E25: r doubled, cells lost).
2. The <5% target is NOT gameable end to end: constants floor at 28.4%. So real
   measurement is required. But the road from 45.7% to ~28% needs no accuracy
   work at all, and taking it would be fraud.
3. There is a principled version, and it is what brief section 7 asked for:
   criteria with r near 0 are exactly the ones where we KNOW the grader may be
   wrong. Reporting a range, or the population-typical value labelled as an
   estimate, is more honest to the player than a confident wrong number. The
   difference between that and gaming is whether the player is told.
   **This is a product decision, not an implementation detail.**

## E30 — Misses concentrate, and the worst cases are diagnosable by eye
```
top 4 fixtures = 40% of all misses on 24% of cells
shot-200  3/3   shot-196  3/4   (SAME footage — 6 of 7 cells wrong)
shot-208  3/4   shot-156  8/13  shot-189  6/11
```
Biggest single misses, all 3+ points (11 of 116 cells = 9%):
```
shot-125  Square to the Basket   expert [8.5,10] got 4   -4.5
shot-208  Square to the Basket   expert [3,5]    got 9   +4.0
shot-198  Square to the Basket   expert [3.5,5.5] got 9  +3.5
shot-189  Source of Shot Power   expert [8,10]   got 4   -4.0
shot-200  Source of Shot Power   expert [2,4]    got 7   +3.0
shot-200  Elbow L-Shape          expert [2,4]    got 8   +4.0
shot-211  Feet Shoulder Width    expert [8,10]   got 4   -4.0
```
**`Square to the Basket` is INVERTED, not biased** — 4 on a shot the expert put
at [8.5,10], and 9 on shots the expert put at [3,5] and [3.5,5.5]. That is what
r = -0.35 means, and square.txt v6 is MY rewrite, currently active. Source of
Shot Power shows the same inversion. An anti-correlated criterion is worse than a
constant; both need rebuilding from scratch, not tuning.

### Frame allocation: looked at, and the obvious story is WRONG
Rendering shot-156 frame by frame: the release IS captured (ball rising to
forehead, above the head, gone — frames 1-3). Only ~3 of 28 frames show the shot
mechanics; the other 25 are wind-up and held follow-through. That looks like a
motion-weighting bug and is not one: the window is release-1.7s to +0.8s (2.5s)
and the mechanics take ~0.4s, so even PERFECTLY EVEN spacing yields ~4-5 frames
on them. 3 is what the current design gives.

So the lever is a TIGHTER WINDOW, not better weighting inside it. Release-0.6s to
+0.3s would put all 28 frames on the shot itself — roughly 3x the evidence for
Elbow, Shot Pocket, Guide Hand and Release at identical token cost. The risk is
losing the gather (Knees Bent needs the dip) and the held follow-through, which
is testable rather than guessable.

**All 28 fixtures still have their source video_url, and ffmpeg 8.1.1 is
installed**, so re-extraction is possible — which would allow a tighter window
AND a crop AND full source resolution in one change, bypassing the 3.8MB upload
budget that currently degrades frames to `scale 0.5, quality 0.35`. That is the
largest untested lever remaining.

## E31 — **square.txt v6 REVERTED — it was ANTI-CORRELATED**, and the reason generalises
```
                        miss rate     pooled r
scale fix + square.txt  48/116 41.4%    0.377
square.txt REMOVED      46/116 39.7%    0.482   <- best arm of the session
paired: fixed 21, broke 19, net +2, McNemar p = 0.875
```
Not significant on cells; the r gain is partly mechanical, since anti-correlated
cells drag pooled r down and removing them lifts it by construction. But a
rubric that scores 4 on a shot the expert put at [8.5,10] and 9 on shots at
[3,5] and [3.5,5.5] is worse than no rubric at all. **Reverted.**

Square is not fixed, only disarmed: without the draft its grader sd is 0.00 —
the live one-liner makes the model emit a constant, the same non-measuring
pathology as domfoot (E26). An inverted measurement was traded for no
measurement.

### The root cause, found by reading the model's own reasoning for the first time
`runFixtureOnce` discarded the `reasoning` field, so every arm in this project
reported scores while throwing away the model's account of them. Added
`runFixtureOnceVerbose` + `scripts/eval/why.mjs` and read the worst cells:

```
shot-208  Square to the Basket   expert [3,5]     grader 9
  "Your feet and shoulders are square to the target and stay aligned
   throughout the shot."
shot-208  Feet Shoulder Width    expert [4,6]     grader 9
  "Your base is a good shoulder-width stance with your feet under your hips as
   you rise, and you held that width through the landing."
shot-198  Elbow L-Shape          expert [3,5]     grader 8
  "Your shooting elbow is stacked under the ball forming a good L-shape at the
   set point."
```
shot-208 is an outdoor clip, shooter about a quarter of the frame tall, **no
basket anywhere in shot**. The model did not hedge and did not abstain — it
produced confident, specific, invented descriptions of correct form. Then the
global CONSISTENCY CHECK ("if your reasoning describes good mechanics the score
MUST be 10") converted the confabulation into a 9. **The prompt launders a
hallucination into a high score**, and that is the mechanism behind every +3/+4
miss.

### The unifying finding: off-frame references
```
criterion                  defined relative to      r
Square to the Basket       THE BASKET            -0.35 .. +0.07
Forward Motion and Toes    THE RIM               +0.01 .. -0.11
every other must-score     the player's own body +0.2 .. +0.9
```
The only two must-score criteria defined against an off-frame reference are the
only two with no discrimination. Their DB descriptions are "aligned toward the
basket" and "toes point toward the rim at release", and the owner confirms most
uploads show only the shooter with no net in frame. So both ask for a comparison
against something absent, and square.txt v6's "YOU DO NOT NEED TO SEE THE RIM"
was contradicted by the description in the same prompt — the description won,
which is why the model wrote "square to the target".

Staged as reversible patches, to be tested one at a time:
- `/tmp/bias/patches/evidence.js` (APPLIED) — per-criterion clear/partial/none,
  worst-across-passes, threaded to the dump; and "none" must NOT default to full
  credit, since full credit is a positive claim about unseen mechanics.
- `/tmp/bias/patches/grounding.js` — a positive claim requires a named
  observable; quotes the confabulations above as the thing not to do.
- `/tmp/bias/patches/offframe-ref.js` — establish target direction from (1) the
  rim if genuinely in shot, else (2) THE DIRECTION THE BALL TRAVELS after
  release, which points at the basket by definition, else (3) internal agreement
  of toes/hips/shoulders. Never from where the player happens to be facing.

Best config after E31: `RUBRIC_OVERRIDE=elbow,knees,onehand` + scale fix,
**46/116 = 39.7%, pooled r 0.482**.

## E32 — **THE ROOT CAUSE: the grader cannot detect bad shots.** And what is NOT a cause
Tested every measurable property of a cell against whether it missed, all on the
same dump so the factors are comparable (`scripts/eval/predictors.mjs`):

```
factor            n      r vs miss     p
bandMid         116        -0.231    0.011  **   higher expert score -> FEWER misses
bandTouchesTop  116        -0.226    0.013  **   (the same signal)
playerArea      107        -0.115    0.239
rubricChars     116        +0.050    0.602
portrait        116        -0.028    0.774
weight          116        +0.027    0.782
shortEdge       116        -0.017    0.869
bandWidth       116        +0.008    0.934
```

### RETRACTION: frame resolution does NOT predict misses
E25/E27 reported clips under 500px missing 61% against 41% (p = 0.07-0.09, n=24
clips). At the cell level, resolution is **r = -0.017, p = 0.87** — nothing. The
earlier result was a fixture-level binning that does not survive a proper test,
and I had already flagged it as "suggestive, not established". It should not be
carried forward, and the claim that upload quality is the next lever rests on
it, so that claim is withdrawn too. Rubric length (r = +0.05) and criterion
weight (r = +0.03) are likewise null, confirming E17's self-correction, and
expert band WIDTH is null (r = +0.008) — the misses are not concentrated in
tight bands.

### The one real predictor, and it is decisive
```
                      expert  grader   gap    miss     direction
expert says BAD        3.5     5.9    +2.5     50%    9 too high, 0 too low
expert says MIDDLING   6.6     7.1    +0.5     61%   18 high,  9 low
expert says GOOD       8.3     8.0    -0.3     19%    2 high,  8 low
```
Monotone, and on bad shots **every single miss is too high, by 2.5 points on
average**. The grader regresses everything toward 7-8: accurate where the shot
really is an 8, and blind where there is a fault to find. This also explains the
34% pile-up on exactly 9 (E23) and why the aggregate bias looked mild — the two
directions cancel.

**For the product this is the worst available failure: it tells players with real
flaws that their form is fine.**

### Why, mechanically — four instructions push one way and nothing pushes back
1. `BURDEN OF PROOF` — "Default to full credit; only deduct when you can
   describe the specific flaw you observed."
2. `MANDATORY 10 RULE` — "If you cannot name a specific visible flaw, the score
   is 10 — not 9 'to be safe'."
3. `CONSISTENCY CHECK` — positive reasoning "MUST be 10".
4. Confabulation (E31) — the model invents specific correct form it cannot see,
   and rule 3 then converts that into a high score.

Every one of these is a safeguard against inventing FAULTS, and there is nothing
anywhere guarding against inventing CORRECTNESS. On a good shot the asymmetry
costs nothing, because there is no fault to overlook. On a bad shot it costs
everything. That asymmetry is the root cause, it is in the prompt rather than in
any rubric, and it explains why two weeks of rubric rewriting moved nothing.

`/tmp/bias/patches/grounding.js` is the counterweight — a positive claim requires
a named observable, and an ungrounded positive is a fault in the REASONING to be
rewritten, not a score to be raised. Queued for test alongside the off-frame
reference fix.

## E33 — Session resumed after a break; state reconciled, power.txt rejected
`/tmp` was cleared over the break, losing every arm dump and three staged
patches. The repo state survived and was reconciled: elbow v9 (E24 winner),
onehand v2, square.txt and domfoot.txt correctly absent (E26/E31 reverts), and
the evidence + scale-fix + grounding + off-frame patches applied. Grounding and
off-frame had been applied by the round-2 driver but their arms' results died
with /tmp, so both remain **applied but unmeasured**.

Durability fixed: arm dumps now copy to `.eval-arms/` and patch scripts live in
`scripts/eval/patches/`, both inside the repo.

### Fresh baseline (evidence + scale + grounding + off-frame, elbow/knees/onehand)
```
OVERALL 45/116 = 38.8%   CI95 [30.4, 47.9]   pooled r 0.369   0 fixtures lost

criterion                       miss  rate  avg miss  worst  worst case
Square to the Basket             5/8   63%    2.50     4.0   shot-208 [3,5] -> 9   TOO HIGH
Elbow L-Shape                   8/14   57%    1.38     3.5   shot-206 [6.5,8.5] -> 3  TOO LOW
Dominant Foot Forward            3/6   50%    2.00     3.0   shot-201 [8,10] -> 5  TOO LOW
Source of Shot Power            6/14   43%    2.08     3.0   shot-189 [8,10] -> 5  TOO LOW
Connected Shot                   3/7   43%    1.00     2.0   shot-189 [8,10] -> 6  TOO LOW
Feet Shoulder Width             7/17   41%    2.07     4.0   shot-156 [1,5] -> 9   TOO HIGH
Shooting Through Guide Hand     4/11   36%    1.88     2.5   shot-194 [7.5,9.5] -> 5  TOO LOW
Guide Hand Follow Through       4/12   33%    1.50     2.0   shot-156 [3,6] -> 8   TOO HIGH
```
Both 4.0-point misses are E32's root cause verbatim: shot-208 and shot-156 are
among the worst shots in the suite and both scored 9. shot-156's expert band on
Feet is **[1,5]** — about as unambiguous a fault as the set contains.

### power.txt v5 REJECTED
```
PAIRED vs baseline, 116 cells: fixed 17, broke 24, net -7, McNemar p = 0.3489
pooled r 0.369 -> 0.314 (worse)
```
Worse on both metrics, not significantly, but with no case for keeping it. It
also could not be written as Magee doctrine (E19: he has no legs-power teaching),
so there was no content argument to override the measurement. Stays out.

### The critical-flag system is the root cause in a second form
Flags cap the affected criteria at 4 and fire at confidence >= 7, with the prompt
stating "8+ means you can point at the exact frame". On shot-196 — a genuine
catapult the owner scored elbow [2,4] — the recorded confidences were
`elbow_severely_out 3`, `ball_behind_head 1`, `chest_pass_hands 1`. All silent.

So the safety net built specifically to catch severe faults never deploys,
because it depends on the model confidently asserting a fault and E32 measured
that this model will not. That is why a catapult scored 8. Flag confidences are
now carried into the eval dump so this is measurable rather than anecdotal.

**Pre-registered prediction for the symmetry patch**: if it genuinely fixes the
reluctance rather than just shifting numbers, flag confidences on genuinely bad
shots should RISE toward the threshold. If the miss rate improves while
confidences stay near 3, the patch is papering over the cause, not fixing it.

## E34 — **Symmetry patch REVERTED.** It made the model stingy, not observant
The fix aimed directly at E32's root cause, and the pre-registered check caught it.
```
PAIRED vs baseline, 116 cells: fixed 19, broke 29, net -10, McNemar p = 0.1934
pooled r 0.369 -> 0.300 (worse)

shot quality        arm   expert grader  gap     miss      direction
BAD (mid < 5.5)     cur     3.5    5.8  +2.3    9/18     0 low,  9 high
                    sym     3.5    5.4  +2.0   10/18     0 low, 10 high
GOOD (>= 7.5)       cur     8.3    7.4  -0.9   17/54    16 low,  1 high
                    sym     8.3    6.8  -1.5   26/54    26 low,  0 high
```
It did **not** fix the bad-shot blindness — the gap moved 2.3 to 2.0 — and it
wrecked good shots, 17 misses becoming 26, every one too low. Telling the model
that full marks require evidence makes it hedge DOWNWARD on shots it can see; it
does not teach it to detect faults on shots it cannot. **Reverted.**

## E35 — **The bad-shot error is BIMODAL and is NONDETERMINISM, not perception**
The +2.3 "average gap" was an artifact of averaging two different behaviours.
Scores the grader actually gave on the 18 cells the owner graded BAD:
```
  2 x1   3 x1   4 x7   6 x2   7 x1   8 x2   9 x4
```
It grades 9 of 18 correctly (2-4) and on the other 9 it scores 6-9, missing the
fault outright. It is not under-rating severity — it either SEES the fault and
grades it about right, or does not see it at all.

**Footage does not explain which.** Mean player height was 0.33 of frame for the
caught cells and 0.38 for the missed ones — the missed clips are BIGGER. And the
decisive case: shot-196 and shot-200 are byte-identical footage, and in the same
run
```
shot-200  Elbow [2,4] -> 4  CAUGHT     shot-196  Elbow [2,4] -> 6  MISSED
shot-200  Power [2,4] -> 4  CAUGHT     shot-196  Power [2,4] -> 7  MISSED
```
Any property of the clip explains both copies equally, so the cause is
nondeterminism. The model CAN see these faults; it does so about half the time.

### The asymmetry this exposes, and the fix it implies
```
on BAD shots:   0 too low,  9 too high   <- it never invents a fault
on GOOD shots: 16 too low,  1 too high
specificity of a <=4 reading: 9/18 BAD cells vs 1/54 GOOD cells (1.9%)
```
A low reading is strong evidence; a high reading is weak evidence. **Median
across passes is therefore the wrong aggregator** — it lets a pass that saw
nothing outvote a pass that saw the flaw, which is precisely backwards given
this error structure. That also explains E16's null: averaging with a median
cannot help a 50/50 bimodal catch rate, and E16 concluded from it that passes
buy nothing. Passes buy nothing **with a median**.

**FAULT-DETECTION GATE** implemented in the pass merge (`FAULT_GATE=1`,
threshold `FAULT_GATE_AT`, default OFF): when any pass reports a score at or
below the threshold, take the MINIMUM across passes instead of the median.
Expected at 3 passes: bad-shot catch 50% -> ~88%, good-shot false positives
1.9% -> ~5.6%, i.e. roughly +7 cells fixed against -2 broken.

Running `p3med` (3 passes, median) against `p3gate` (3 passes, gate) — identical
prompt, rubrics, fixtures and pass count, so the comparison isolates the
aggregation rule alone.

**Also settled, for free: the model is not the cause.** Baselines table has
`claude-sonnet-4-6` PRODUCTION at 38.0% against today's qwen at 38.8%. The
expensive model was no better, so this was shipping to real users before the
switch, and a model upgrade does not fix it. A paid capability control on
gemini/opus was queued and cancelled at the owner's instruction before spending.

## E36 — **THE PERCEPTION GATE: the model CAN discriminate. Scoring is what loses it.**
The decisive diagnostic. Pairs of shots whose expert scores differ by >= 3 points
on ONE criterion, shown together, asked only "which is better?" — no scale, no
calibration, no severity judgement. Each pair run in BOTH orders.

```
RESULT  13/15 correct = 86.7%      5 order flips of 20, 0 unusable

Feet Shoulder Width Apart   11 right,  0 wrong,  3 flips
Source of Shot Power         2 right,  2 wrong,  2 flips
```

**Feet Shoulder Width scored 11 of 11 pairwise, on gaps up to 7 points, while its
ABSOLUTE miss rate is 41%.** The perception is there. The number-picking is what
destroys it.

This overturns the reading I took from FitAQA an hour earlier. That paper's oracle
experiment shows perception is the bottleneck for ERROR DETECTION; it does not
follow that perception is absent here, and on this suite it demonstrably is not.
What is broken is the conversion from perception to a calibrated number — exactly
what the scalar-constructs literature reports: pointwise prompting "suffers from
bunching around arbitrary numbers" (arXiv 2509.03116), which is the same
phenomenon as our 34%-of-scores-on-exactly-9 (E23).

**It also explains every failure in the ledger.** Symmetry, verification, the
fault gate, calibration, rubric rewrites — all of them operated on the number.
None of them touched the step that actually loses the information.

**And it is criterion-specific, tracking r exactly:** Feet has the highest
pointwise r (0.65) and discriminates perfectly; Power has the lowest (0.05-0.50)
and is at chance. So pairwise does not manufacture signal — it extracts signal
that exists, much more efficiently than scoring does. Criteria that fail the gate
are genuinely unperceived and should not be scored as though they were.

**Caveats held open.** 15 decided pairs is small. 25% order-instability is high
and mandates both-orders averaging in any build (position bias is documented at
0.002-0.192 across 21 judges). Only two criteria appeared among the widest gaps,
so this is evidence about those two, and a per-criterion gate is needed rather
than a blanket assumption.

**Next build, and it is the first one with direct evidence behind it:** score by
RANKING against anchor shots of known expert score, rather than by asking for a
number. For a criterion that passes the gate, compare the new shot against 3-4
anchors spanning the range and interpolate its score from where it lands. That
uses the model's strongest measured ability and never asks it to pick a value.

## E37 — Observation-based scoring (idea 1) · **REJECTED, significantly worse**
```
baseline        45/116 = 38.8%   r 0.369
OBSERVE=1       61/116 = 52.6%   r 0.284
PAIRED: fixed 13, broke 29, net -16, McNemar p = 0.0195   <- significant, and negative
```
Replacing "pick a number" with "choose the option that matches what you saw", then
mapping the option to a score in code, made things significantly worse.

**Why.** Each observation maps to ONE fixed score (`under_ball` -> 9,
`correct` -> 9, `narrow` -> 5.5). The expert's bands move from shot to shot —
Feet Shoulder Width alone spans [0,4] to [8,10] — so a coarse category cannot
land inside a band that varies. I traded a noisy estimate for a precise constant,
which is the domfoot failure (E26) in a new form: reducing variance is not the
same as being right.

The categories also proved too coarse in the other direction: Elbow's worst miss
went to 5.0 points (shot-196, expert [2,4], observed `under_ball` -> 9).

## E38 — Ranking against anchors · **REJECTED, and it explains E36's limit**
Score a shot by where it RANKS against anchors of known expert score, never
naming a number. Directly motivated by E36's 11/11 pairwise result.
```
Feet Shoulder Width Apart:  9/17 missed = 52.9%   (baseline for this criterion: 41%)
```
The failure pattern is the finding:
```
MISS shot-188  expert [5.5, 7.5]  ranked -> 9
MISS shot-191  expert [5.5, 7.5]  ranked -> 9
MISS shot-201  expert [6, 7.5]    ranked -> 9
MISS shot-208  expert [4, 6]      ranked -> 9
MISS shot-210  expert [5, 7]      ranked -> 9
```
Every one says "better than every anchor" about a mid-range shot.

**E36 and E38 are not in conflict — together they measure RESOLUTION.** The gate
tested gaps of 3 to 7 points and got 86.7%. Ranking asks the model to separate a
6.5 from a 9 — a gap of 2.5 — and it cannot. The discrimination is real and
COARSE: it resolves large differences, not the +-1 precision the expert's bands
demand.

If that is right it sets the achievable floor for the whole product, because it
is a property of the model's perception rather than of any prompt. Measuring
discrimination as a function of gap size is therefore the most important
remaining number, and it is running.

## E39 — **THE RESOLUTION CEILING.** The model resolves ~6 points; the bands demand ~1
E36 measured 86.7% on wide-gap pairwise comparisons and I read it as a
breakthrough. Measuring accuracy as a FUNCTION OF GAP SIZE shows that result was
carried entirely by the widest pairs:
```
gap 1-1.5    4/10 = 40%    order flips 4
gap 2-2.5    3/9  = 33%    order flips 5      chance = 50%
gap 3-4      3/5  = 60%    order flips 4
gap 3-7     13/15 = 87%    order flips 5      (the original gate)
```
At or below chance for anything under a 3-point difference. It cannot tell a 5
from a 7. The expert's bands are ~2 points wide and the tolerance is +-0.3, so
grading them needs roughly +-1 resolution against a model that has about +-6.

**This single fact is consistent with every result in this log:**
- 12 of 14 interventions failed, and the 2 that helped were prompt plumbing
  (the global scale block, deleting an anti-correlated rubric) rather than
  grading cleverness.
- A constant-per-criterion lookup table scores 28.4% against the grader's 38.8%
  (E29) — most of the apparent accuracy is central tendency, which is what a
  coarse instrument produces.
- claude-sonnet-4-6 scored 38.0% and qwen3.7-flash 38.8% (E33): a 13x more
  expensive model hits the same wall, because the wall is resolution.
- Byte-identical duplicate clips diverge within one run (E35): below its
  resolution the answer is a coin flip.
- Platt calibration found no signal to scale where r ~ 0 (E37 note).

**Assessment: <5% is not reachable by grading 0-10 scores from this footage with
a VLM.** Not with a better prompt, rubric, model, or aggregation. The instrument
is roughly 6x too coarse for the question.

**Caveat, and it matters:** this rests on 10, 9 and 5 decided pairs. The
re-measurement at 30 pairs per band DID NOT RUN (see below), so treat the ceiling
as strongly indicated, not established. Re-running it is the first thing to do.

### PROCESS FAILURE — self-matching pgrep, reintroduced
The overnight runs produced nothing: only $0.38 of credit was spent across the
whole night. Cause: waiters written as
`until ! pgrep -f "disc2.sh\|pairwise-gate"; do sleep; done`
— a pattern that matches the WAITER'S OWN command line, so the loop either exits
instantly or blocks forever depending on timing, and the queued work was skipped.

This is the identical bug logged earlier in this project (a waiter greping
`scripts/eval/(campaign|...)` matched itself and deadlocked). Fixed then, and
reintroduced now. **Wait on PIDs, never on name patterns.** Also: verify a launch
actually consumed credits before reporting it as running — the launch message is
not evidence the work started.

## E40 — Three-band verdict · running
The constructive consequence of E39. If the model reliably resolves ~6-point
differences, ask a question at that resolution: is this criterion clearly poor,
ordinary, or clearly good? Three bands are ~3.3 points apart, inside the range
where it is reliable, where a 0-10 score is not.

Scored honestly: a verdict counts only if the EXPERT's own band falls in the same
third, and "unsure" answers are excluded rather than counted as correct. This is
NOT a way to make the miss rate look better by widening the target — the target
is different, and the question being asked is whether a COARSER product claim can
be made accurately. That is a genuinely different question from whether a 0-10
score can, and it is the one that decides what is shippable.

## E40 — Three-band verdict · **REJECTED, at chance** — and it gives the real diagnosis
Asked for one of "poor / ordinary / good" per criterion instead of a number, at
the ~3.3-point granularity E39 suggested the model could handle.
```
THREE-BAND VERDICT: 26/82 correct = 31.7%     chance with 3 bands = 33%
  Knees Bent            0/3    Dominant Foot Forward  0/4
  Connected Shot        1/5    Source of Shot Power   2/9
  Elbow L-Shape         2/9    Feet Shoulder Width    6/13
```
Below chance. Coarsening the question did not help.

### The diagnosis this forces, and it is sharper than E39's
```
COMPARATIVE  "is A better than B?"            87% at wide gaps  (E36)
ABSOLUTE     "is this poor / ordinary / good?"  31.7%  — chance (E40)
```
**The model can RANK but cannot LOCATE.** The problem is not that its resolution
is coarse — it is that it has no absolute reference frame. Even three bands
require knowing where the boundaries sit, and it does not. E39's "6-point
resolution" was the right observation read through the wrong lens: what degrades
with gap size is the reliability of a COMPARISON, and absolute placement fails at
every granularity tested.

This explains the whole log in one line: **every one of the 14 failed
interventions asked for an absolute judgement.** Rubric anchors, the scale block,
symmetry, verification, observation categories, calibration, the fault gate,
three-band verdicts — all absolute. The single test that succeeded (E36) was the
only comparative one.

**Consequence for the product.** Per-criterion 0-10 scores are not achievable
from this footage with this model, and neither is a coarse absolute band. What IS
achievable is comparison against concrete examples. So the accuracy work should
stop trying to produce a correct number and start constraining a wrong one —
which is what the guard rail (E41) tests.

## E41 — Big-miss guard rail · running
Goal changed by the owner: the product ships to a real organisation next week, so
the target is no longer <5% — it is to eliminate the errors that destroy trust.
```
10 of 116 cells (8.6%) are off by 3+ points
   5 too HIGH  (a bad shot told it is fine)  <- the damaging ones
   5 too low
The guard must separate 6 bad-scored-high cells from 27 genuinely-good ones:
a ~5 point distinction, i.e. the wide-gap comparison the model does at 87%.
```
Design deliberately avoids the verification failure. That pass asked "is this
stated reason true?" and broke 17 cells while fixing 6, because under scrutiny
the model doubts everything. This asks a COMPARISON against a known-bad and a
known-good example of the same criterion — its strongest measured ability — and
is constrained so it can only do bounded damage: fires only on scores >= 8, can
only LOWER a score, anchors are leave-one-out.

Judged on two numbers, not the miss rate: **big misses eliminated** and
**correct scores broken**.

## E42 — A CORRECTION TO E37, AND IT INVALIDATES THE HEADLINE OF THIS LOG

E37 reported comparator accuracy as a function of expert score gap and I read a
shape into it that the data does not carry. The raw counts were never written
next to the percentages; here they are:

```
gap 1-1.5    4/10 = 40%     95% Wilson CI  [16.8, 68.7]
gap 2-2.5     3/9 = 33%     95% Wilson CI  [12.1, 64.6]
gap 3-4       3/5 = 60%     95% Wilson CI  [23.1, 88.2]
gap 3-7     13/15 = 87%     95% Wilson CI  [62.1, 96.3]
```

**Every interval except the last contains 50%.** Not one of the three narrow
bands is distinguishable from a coin flip, and every pair of bands overlaps, so
they are not distinguishable from each other either. The sentence "At or below
chance for anything under a 3-point difference" is not a finding. It is ten coin
flips with a story attached.

What DOES survive:
- Wide-gap comparison is above chance: 13/15, CI [62.1, 96.3], excludes 50.
- Absolute 3-band placement is AT chance: 26/82 = 31.7%, CI [22.5, 42.5] against
  a 33% chance rate. The interval contains 33 and excludes nothing useful — the
  honest reading is "indistinguishable from guessing", not "below chance".

So "the model can RANK but cannot LOCATE" is half-supported. The LOCATE half is
solid on 82 trials. The RANK half rests on 15 trials, and the claim that ranking
DEGRADES smoothly with gap size rests on 24 trials spread across three bands.

Why this matters beyond bookkeeping: every design that has been proposed on the
back of E37 — anchor ladders spaced to the comparator's resolution, contrastive
delta scoring, coarse bands chosen to match what the model can resolve — depends
on the SHAPE of this curve. An external research review used these same numbers
to conclude that anchors spaced 1-2 points apart are "worthless" and only ~3-point
spacing is viable. That conclusion inherits the bad sample and must not be built on.

E43 measures it properly: 526 pairs exist across the fixtures, 60 sampled per
band, both orders asked, flips excluded from the denominator rather than counted
as losses, Wilson intervals printed. scripts/eval/comparator-curve.mjs.

### The process failure, so it does not repeat
Percentages were recorded without denominators, and no interval was computed on
any of them. A 3/9 and a 300/900 both print as "33%". Rule added to the README:
**no proportion is reported in this log without its numerator, denominator, and
a 95% interval.**

## E44 — Flip instability as a reliability signal · REJECTED, and it cost nothing

The comparator curve (E43) produced one clean monotone result: pairwise verdicts
flip less often as the expert gap widens — 25, 21, 18, 13 across four bands, and
it got CLEANER when outage-damaged pairs were recovered. That looked like the
reliability signal this project has been missing for nineteen experiments, and it
needs no ground truth at serving time.

Tested by joining the 480 cached comparisons against a per-cell dump. No new
model calls.

```
cells with >=3 cached comparisons: 66   (missed 29, hit 37)
mean flip rate, MISSED cells : 36.8%
mean flip rate, HIT cells    : 33.5%
difference                   :  3.4 points
point-biserial r             :  0.074
permutation p (two-sided)    :  0.549
```

**REJECTED.** Not a reliability signal.

### Why, and this is the part worth keeping
Flip rate measures HOW FAR APART TWO SHOTS ARE. It does not measure whether
either shot's own score is right. A shot that happens to be compared against
similar shots flips constantly no matter how well it was graded. The monotone
curve is real and it is informative about the comparator — but the quantity it
tracks is the expert gap, which we already know from the expert scores. It tells
us nothing about the cell we cannot see.

The general shape of the error, which has now happened twice in this log: a
statistic that correlates beautifully with something we ALREADY KNOW is not
evidence that it predicts something we DON'T. E42 was reading a curve into ten
coin flips; this is reading prediction into a redundancy.

### The reliability scoreboard is now 0 for 5
```
model's stated confidence   r = 0.000
token entropy               r = 0.000
guard rail                  0 caught, 4 broken
big-miss catcher            not reproducible across 4 near-identical runs
flip instability            r = 0.074, p = 0.549
```
Five independent attempts to know when the grader is wrong, all null. That is
itself the finding, and it should be said plainly to anyone deciding what to ship:
**we currently cannot tell, at serving time, which grades are the bad ones.**

## E45 — The catapult IS visible at full resolution. The grader just never asks.

Per-criterion big-miss map (229 cells, base3 + cur):
```
"bad shot scored 9"   12 of 21 big misses   Elbow x4, Square x3, Power x3, Feet x2
"good shot scored 4-5" 9 of 21              Power x3 (shot-189 twice), Square x2, Elbow, Feet, DomFoot, Connected
```
The generous side clusters on FOUR clips - shot-196, 200, 198, 208 - all distant
shooters. shot-196/200 is one shooter, and the re-extracted set-point frame shows
a textbook catapult: ball behind the head, both elbows flared to shoulder height,
forearm near horizontal. Expert [2,4]. Grader 9. The catapult flag has never
fired in 109 analyses.

The obvious hypothesis was resolution - the shooter is ~80px tall at 464x832 -
and E27's note reads "resolution, not rubric wording, is the ceiling". Tested
directly: the SAME frame, full 464x832, no crop, with a direct three-cue question.
```
FULL FRAME 464x832:  ball_behind_or_above_head TRUE, elbow_flared TRUE,
                     forearm_not_vertical TRUE, catapult TRUE
   "holding the basketball behind their head with elbows flared out to the
    sides at shoulder height and forearms tilted backward"
ZOOMED CROP:         identical, all TRUE
```
**The model sees the catapult at full resolution when asked a concrete question.**
Inside the grading prompt, on the same footage, it scores the elbow 9 and the flag
stays silent. The failure is in what the prompt asks for, not in what the model
can see. That partly reverses E27's "resolution is the ceiling" - at least for the
behind-the-head fault, which is whole-body geometry, not fine detail.

This is what the owner asked for: make the grading SPECIFIC about what the fault
looks like. The research agents (Magee/Klay, per criterion) and the rubric audit
are producing the concrete cues; E46 will be the rubric arm against base6.

Caveat until the multi-clip probe lands: one frame, one clip. The probe runs the
same question on shot-200/198/202 (bad) AND three good-elbow controls (125, 206,
189). If the controls also come back "catapult: true", the model has a yes-bias
and this finding is void.

### E45 addendum — the mechanism, established on shot-196
Three probes, same three-cue catapult question, same model (qwen3.7-flash):
```
1 frame  (tight-window frame 16, the set point)     catapult TRUE, correct description
1 frame  zoomed crop of the same                    catapult TRUE
28 frames (the PINNED set the live grader sees)     catapult FALSE on all 7 clips
```
On the 28-frame probe the model chose frame 10 as the set point. Rendered the
pinned set: frame 10 IS the catapult - ball on top of the head, both elbows
flared to shoulder height, forearms laid back; frames 7-11 all show it. The
model located the right frame and then wrote "forehead level with elbows tucked
and forearms vertical". That sentence is the template of a good set point. It
is not a description of the image.

So, in order of what this rules OUT:
  - NOT frame extraction: the moment is in the pinned frames (7-11 of 28).
  - NOT resolution: the same 464x832 frame, uncropped, detects it in isolation.
  - NOT the rubric wording per se: the rubric describes the catapult concretely.
What is left: given 28 images and a question, the model answers from a prior
about what set points look like. Given ONE image, it answers from the pixels.
This is the "confident invented description" the prompt already warns about
(A POSITIVE CLAIM NEEDS A NAMED OBSERVABLE) - and warning text does not fix it,
because the failure is upstream of the instruction, in what the model attends to.

Design implication, pending the control check below: fault detection for the
whole-body set-point faults (catapult, V-at-top, ball beside head, flared
elbow) should run on ONE targeted frame, not on the sequence. Two cheap calls:
(1) over the 28 frames, "which frame is the set point?" - the model gets this
right; (2) on that single frame, the concrete cue questions. Then the grading
pass receives the answers as facts. This is E46's candidate design.

PENDING: the single-frame probe with three good-elbow controls (125, 206, 189).
If the controls also return catapult TRUE, single-frame detection is yes-biased
and none of the above survives.

### E45 control check — single-frame detection is NOT yes-biased under a 2-cue rule
```
clip      expert       f16: behind flared tilt -> catapult   f19: behind flared tilt
shot-196  BAD [2,4]         T      T     T       YES              T     F     F
shot-200  BAD [2,4]         T      T     T       YES              T     F     F
shot-198  BAD [3,5]         F      F     F       no               T     F     F
shot-202  BAD [3,5]         F      F     F       no               T     F     F
shot-125  GOOD             F      F     F       no               T     F     F
shot-206  GOOD             F      F     F       no               F     F     F
shot-189  GOOD             T      F     F       YES <- 1 cue     T     F     F
```
Three things this fixes in the design:
1. The model's own "catapult" summary field fires on ONE cue (shot-189). Do not
   use it. Decide from the cues: catapult = ball_behind AND (flared OR tilt).
   Under that rule: 2/2 true catapults caught, 0/3 controls flagged, 0 false
   positives on 198/202.
2. Frame choice is load-bearing. At frame 19 (near release) "ball above the
   head" is TRUE for almost everyone because the arms are extending. The check
   must run on the SET-POINT frame, before extension - and the 28-frame probe
   showed the model locates that frame correctly (frame 10 on the pinned set).
3. shot-198 and shot-202 are bad-elbow clips ([3,5]) that are NOT catapults.
   The expert distinguishes a flared elbow (4) from a catapult (1-3), and so
   must the check: a second cue set for "ball beside the head / elbow out
   with the ball still in front" is needed for those. Catapult alone covers
   the two 5-point misses, not the two 4-point ones.
n is tiny (3 controls). This is a design signal, not a result. E46a is the arm.

### E45 — model choice for the check: the instruct model fails the controls
qwen3-vl-235b-a22b-instruct answers the release-locate question in 3s where
flash burns its reasoning budget, so it was the obvious candidate for the
set-point check. Same 14-frame cue probe:
```
forearm_not_vertical   TRUE on 14/14 frames   <- a constant; carries nothing
elbow_flared           TRUE on 1/14 (shot-200 f16 only; misses shot-196)
ball_behind            TRUE on shot-196 x2, shot-200 x2, and shot-125 f16 (GOOD)
```
Under the two-cue rule that gives shot-125 (expert [6.5,8]) a catapult. Flash
on the same frames: forearm false on both good controls at the set point,
flared true on both real catapults, zero controls flagged. The check stays on
flash and eats the latency. Speed is not worth a false positive that caps
three criteria on a good shot.

Note for the rule itself: on flash, forearm_not_vertical is also the noisiest
cue near release (true on 206 f19, 189 f19). Requiring elbow_flared for the
catapult verdict keeps 2/2 recall on this sample and removes the exposure.
Pending the adversarial review before changing it.

## E47 — Tight re-extraction window (release-1.0s to +0.3s) · REJECTED / UNDECIDED

The one intervention that changed the EVIDENCE rather than the question. Frames
re-extracted at the pinned geometry (the first attempt was confounded by
resolution, see E45's preamble), release located by bracketing at 24 samples,
28 videos x 3 runs x 3 passes per arm, same session, same model, zero lost.

```
PAIRED on 116 expert cells across 25 common fixtures
base    miss 48/116 = 41.4%  CI [32.8, 50.5]
tight   miss 51/116 = 44.0%  CI [35.3, 53.0]
tight FIXED 12, BROKE 15      McNemar exact p = 0.70
Elbow   10 -> 10     Power  8 -> 8     (the criteria it was built for: no change)
```
Not adopted. The frames are not the problem: concentrating 28 frames on the
0.4s of mechanics did nothing for Elbow or Power, which is consistent with E45 -
the fault is IN the pinned frames and the model locates it; it just does not
act on it inside a 28-image grading pass. EVAL_REEXTRACT stays as an eval-only
switch.

The three fixtures absent from base6: shot-204 and shot-210 DID NOT RUN on a
malformed-JSON grading response (not transport, so not retried), shot-209 was
called "no shot" by the release gate on the pinned frames but graded fine on
the tight frames. Malformed JSON has now cost a fixture in three separate
arms (194, 204, 210) - about 7% attrition per arm, and it is what makes arms
non-comparable. A single same-call retry on a parse failure is being added;
it cannot change a graded cell, only rescue a fixture that would have died.

## E48 — Square comparator, per criterion · NO USABLE DATA
16 expert cells -> 26 pairs. After a rate-limit window: 19 transport failures,
15 unusable, 6 stable pairs across four bands. Cannot be measured with this
much ground truth. The audit's "measure Square before writing a fourth rubric"
stands as advice that cannot currently be followed; Square v7 (the coach's
shoulders-to-target definition) goes into the drafts arm on the strength of
the definition, flagged as unmeasured at the comparator level.

## E49 — The release gate has been silently dead since the model switch
Found while wiring the set-point check to the gate's release index: on
shot-196, three runs in a row, `findReleaseFrame` returned 'error'. Cause:
it asked a reasoning model for one number with `maxTokens: 300`; the model
spent all 300 on hidden reasoning, the retry at 600 likewise, the throw was
caught, and `analyzeShot` continued as if the gate had passed. The retry
lines "spent 300 tokens on reasoning with no answer - retrying at 600" have
been in every arm log all week; nobody read them as "the gate never answers".

Consequences: (a) no clip has been refused as "no shot" by the gate in
production on qwen; the only no-shot verdicts come from the grading passes'
own shot_detected field; (b) every "gate" call was two wasted requests per
analysis; (c) the set-point check, anchored on the gate's index, could never
run. Fixed: ceiling raised to 4000 (the answer is one number; the budget is
for the thinking before it). This is a production fix, not an eval switch.

## E46 — Set-point check, end-to-end smoke (after the gate fix)
Two fixtures, one run, three passes, SETPOINT_CHECK=1, release-anchored:
```
shot-125 (control)  gate release=20, inspected 19,18,17 -> CLEAN
                    Elbow 9 vs [6.5,8]: the pre-existing generous miss, untouched (by design)
shot-196 (catapult) gate release=12, inspected 11,10,9  -> CATAPULT
                    Elbow  -> inside [2,4]   (was 9, +5.0 - one of the four worst misses)
                    Power  -> inside [2,4]   (was 9, +5.0 - another)
                    Pocket -> 2 (ai-seeded band [7.5,9.5] is the old grader's own output; expected to move)
```
The single-frame detection that E45 showed in a probe now works inside the
pipeline, and the code cap does what the prompt's "MUST score 4 or below"
never did. n=2. The arms (base7 / e46a / e46c / e46b, launched 22:13-22:15)
measure it across all 28 fixtures with the false-positive rate of the two
recorded-only verdicts. Not a result yet; a working mechanism.

## E50 — FRAME_CHECKS: observation-first grading · smoke, then arm
lib/frame-checks.ts. Elbow, Power, Square and Feet get yes/no questions on
named frames (offsets from the gate's release frame R: set point R-1..R-3,
dip R-6, release R, landing R+4, feet R-3) and CODE turns the answers into a
cap or a floor. Caps stop "fault not seen -> 9"; floors stop "good shot
double-charged -> 4". Facts are injected per criterion so nothing haloes.
Smoke, 3 fixtures, 1 run x 3 passes:
```
shot-196 catapult     Elbow 2 [2,4]  Power 3 [2,4]           both were +5.0 misses
shot-125 control      Elbow 8 [6.5,8] Power 8 Square 9 Feet 8 (Elbow was a 9 miss)
shot-189 high set pt  Power 8 [8,10] Feet 9  Elbow 9 [5.5,7.5] MISS +1.5
```
Zero big misses on the nine big-four cells; one 1.5-point miss. The caps
and floors never had to move a score in code - the injected facts steered
the passes - which is the best case: score and reasoning agree.
Cost: 8 small single-image calls, ~+$0.003 per analysis (est. $0.0102 total).
Arm e50 (FRAME_CHECKS=1, live rubrics, E46b prompt) launched 12:2x alongside
e46b; e50 - e46b isolates the checks; base7 is the common baseline.

## E50 — FRAME_CHECKS arm · SIGNIFICANT, the first in the log. KEPT with two fixes.
28 fixtures x 3 runs x 3 passes, both arms on the same prompt (E46b), same
session. base7 lost shot-198 (provider 400), e50 lost nothing; 26 common.
```
PAIRED on 117 expert cells across 26 fixtures
base          miss 54/117 = 46.2%  CI [37.4, 55.2]
frame checks  miss 40/117 = 34.2%  CI [26.2, 43.2]
FIXED 27, BROKE 13        McNemar exact p = 0.0385   SIGNIFICANT

BIG MISSES (>=3 points)   base 11  ->  frame checks 5
mean abs error outside band   0.79  ->  0.46
```
The four catastrophic cells: 196 Elbow 4->3, 196 Power 5->3, 200 Elbow 5->3,
200 Power 6->4 - all in band. shot-189 Power (the "good shot scored 4" case,
missed in three earlier arms) 4->8, in band. shot-195 Square 5->8, in band.
Catapult verdicts: 6 of 78 runs - exactly 196 and 200, three runs each, none
elsewhere. Zero false catapults.

Direction flipped. Every base big miss was TOO HARSH (-3 to -4.5); the
floors fixed them. Every remaining big miss is TOO GENEROUS, and every one is
a FLOOR that fired on a distant shooter where the cue lied:
  156 Feet 9 vs [1,5], 187 Feet 7 vs [2,4]  - "floor between the shins" read true
  208 Square 9 vs [3,5]                     - chest faces camera, ball leaves sideways
  202 Elbow 9 vs [3,5]                      - "clean" set point on a flared elbow
  156 Guide Hand 9 vs [3,6]                 - not a frame-check criterion
Feet got worse (4 -> 7 misses) for that reason. Fixes applied before the next
arm: Square and Feet are cap-only; a cap beats a floor on the same criterion
(run 1 on 196 had the catapult cap at 4 lifted to 7 by the rise floor).

Cost, metered: $2.80 for both arms (168 analyses) - the arms cost the SAME per
analysis; the eight single-image checks are lost in the noise of gate
retries. All-in about $0.017 per analysis on this model, ~$17 per 1,000.

## E51 — Confirmation arm: E50 DID NOT REPRODUCE. Two fragilities, both diagnosed.
Same code as E50 except Square/Feet cap-only and cap-beats-floor.
```
PAIRED 117 cells / 26 fixtures     base 46.2%   e50 34.2%   e51 44.4%
e51 vs base: FIXED 16 / BROKE 14, p = 0.86          big misses: base 11, e50 5, e51 4
```
The miss rate went back to baseline while the big-miss count stayed low. The
cells that were right in e50 and wrong in e51 explain it:
1. shot-196 Elbow 3 -> 7, Power 3 -> 8. The catapult lit on 1 of 3 runs in e51
   (3 of 3 in e50) on IDENTICAL frames, and the 3-run median let two misses
   outvote a hit. Fix: any frame over R-1..R-4 counts (E35: a fault seen is
   ~98% specific; the E45 controls never lit both cues on any frame).
2. shot-156: seven unrelated criteria fell from 8 to 5 together, with NO code
   cap applied - the injected facts header haloed the whole grade (E34's
   shape, exactly what the review's S2 warned). Fix: inject nothing; bounds
   apply in code on the merged result; the bounded criterion's reasoning gets
   a one-line note so score and text agree.
Both fixed in eb44374. e52 (hands) and e46c (drafts) were killed - they were
running on the old design - and relaunched as e53 (checks + hands, no header)
and e53c (e53 + the four research rubrics). ~$1 saved.

Lesson for the log: a p=0.04 on 117 cells needs its confirmation arm before it
is a result. E50's number was real on that run; its mechanism was not stable.

## E53 — Any-frame catapult + hands caps, no header · NULL; the DRAFTS on top · SIGNIFICANT
```
                        miss/109  big  MAE-out       vs previous
base7                     50      11    0.79
e53  (checks+hands)       48       7    0.68    vs base: FIXED 13 / BROKE 12, p = 1.0
e53c (e53 + 4 drafts)     34       2    0.44    vs e53:  FIXED 24 / BROKE 11, p = 0.041
```
e53 per criterion vs base: Elbow 9->6 (the caps work), Square 4->3, Power 7->6;
Feet 4->8 (the feet caps over-fire at distance), Guide Hand 5->6, One-Hand 5->5.
Any-frame catapult fired on 8 fixtures for 2 real catapults: one CONFIRMED
false positive (shot-206, expert [6.5,8.5]), five with no expert elbow cell.
Majority (E50) fired on exactly the two real ones. Recall-over-precision was
the wrong call; reverted to majority over four frames.
Drafts on top: Feet 8->3, Knees 3->1, Guide Hand 6->4, Elbow 7->6; Power 6->7.
All eight known cells in band in e53c. Two big misses left of eleven.
Trimmed for e54: catapult majority; Elbow/Power floors kept; Square cap kept;
Feet and hands caps removed (recorded only). e54 = trimmed checks + drafts;
e54d = drafts only, to attribute.

## E54 — Trimmed frame checks + research rubrics · SIGNIFICANT, REPRODUCED. KEPT.
Attribution pair on the trimmed design (majority catapult; Elbow/Power floors;
Square cap; feet/hands recorded only) plus the four rubric drafts.
```
                           miss/108   big   MAE-out    vs base7 (paired)
base7                       45.4%     11     0.79
e54d  drafts only           38.9%      6     0.65     FIXED 23 / BROKE 16, p = 0.34
e54   checks + drafts       31.5%      4     0.49     FIXED 25 / BROKE 10, p = 0.017
e53c  (noisy checks) + drafts 30.6%    2     0.43     (previous run of the same family)
e54d -> e54 (the checks' own contribution)                 FIXED 16 / BROKE 7, p = 0.09
```
Two independent runs of checks + drafts land at 30.6% and 31.5% against a
45% baseline. The known catastrophic cells in e54: 196 Elbow 3, Power 4;
189 Power 8; 195 Square 9; 208 Square 5 - all in band. Drafts alone leave the
catapults at 9 (196/200 Elbow and Power all +5.0); the checks are what remove
them. Remaining e54 big misses: 200 Power 8 (catapult caught on too few runs
for the median), 202 Elbow 9 (a flared elbow the flared rule does not reach),
193 Power 9, 156 Square 4 (a Square cap that fired on a good shot).

DECISION: ship checks + drafts. FRAME_CHECKS=1 in production, and the four
rubrics promoted into criteria.grading_notes by scripts/migrate-rubrics-e54.sql.
Spend for the whole E45-E54 sequence, metered: ~$24.

What this is not: <5% miss. On 108 cells the honest statement is a third of
cells miss the coach's band by more than 0.3, down from just under half, and
the trust-destroying misses went from eleven to four, on two runs. The number
that would move it further is more graded videos, not another arm.

## E56 — PRODUCTION IS NOT ON THE MEASURED MODEL (found 2026-09-30 09:00)
The production environment carries ANTHROPIC_API_KEY and neither ANALYSIS_MODEL
nor OPENROUTER_API_KEY. analysisModel() therefore falls back to claude-sonnet-4-6
on the account whose credits hit zero on 2026-09-14. Every arm in this log ran
on qwen/qwen3.7-flash via OpenRouter. Whatever production has been returning
since the 14th, it is not what was measured here, and it may be nothing.

Set today: FRAME_CHECKS=1 (inert on the Sonnet path; active once the model
moves). NOT set: ANALYSIS_MODEL - pointing production at the gateway before the
OpenRouter key is in the env would fail every analysis. The key must be added
by the owner (a fresh one; the old one is in a transcript). Then
ANALYSIS_MODEL=qwen/qwen3.7-flash, then the branch goes out.

## E57 — Crop the frame checks to the shooter · PROBE PASSED for the catapult; V-at-top NOT actionable · mini-arm pending

**Trigger.** e55 mini-arm (7 fixtures x 2 runs, FRAME_CHECKS=1 + drafts) FAILED:
shot-196 Elbow 9 / Power 9 vs [2,4], shot-200 6 / 6.5 vs [2,4], shot-202 Elbow 8.5
vs [3,5], shot-198 Elbow 9 vs [3,5]; controls 125/189/206 within 0.5. Two facts:
shot-196 and shot-200 carry the SAME frames_hash (one clip, two fixtures), and the
catapult cap fired on 1 of the 4 runs of those identical frames. At 2x zoom the
clip is a plain catapult (ball over and behind the head, both elbows wide, frames
12-15). The shooter is ~70px tall in a 464x832 frame: a shape the token grid
cannot express is a coin flip, and no majority rule fixes a coin flip.

Also found: 0bde0db added the v_top rule on `both_hands_mirrored_elbows_out` but
never added that QUESTION to the set-point prompt, so it read undefined and could
never fire. And the drafts still say "never write catapult unless a SET-POINT
CHECK block reports it" — that block is no longer shown, which is why the drafts
alone (e54d) score catapult shots 9 where base7 scored 4-5. Not changed here.

**Change.** lib/frame-checks.ts locates the shooter once (the crop-boxes.mjs
four-frame fractional prompt, same validation) and crops the frames the yes/no
checks address, aspect kept, upscaled; the grading passes never see the crop
(E25: it biases grading low). FRAME_CHECK_CROP=0 disables; salted in prompt_sha.
The V question added; per-cue counts logged.

**Free probe** (checks only, no grading passes, reextract frames, R=18, 3 reps
per fixture, run twice = 6 reps; ~$0.10 total):

```
                          catapult   v_top    clean floor   note
shot-196  exp Elbow [2,4]   6/6       0/6        0/6        was 1/4 uncropped (e55)
shot-202  exp Elbow [3,5]   0/3       3/3        0/3        (probe 1: locator timed out 3/3, nothing ran)
shot-198  exp Elbow [3,5]   0/6       2/3        3/6        flared cue 0/8 even cropped; NOT solved
shot-206  exp Elbow [6.5,8.5] 0/6     1/3 -> 0/3 after the one-hand guard   clean 4/6
shot-125  exp Elbow [6.5,8]  0/6      2/3 -> 1/3 after the one-hand guard   clean 2/6
```
Mirrored-hands count at the set point: 202 = 5,6,5 of 8; 198 = 4,4,2; 125 = 2,4,1;
206 = 0,0,0. A one-hand shot whose guide hand is still on the ball reads 4/8;
the V reads 5-6/8. Too thin to cap three criteria on — a false cap on a good
shot is the miss this project exists to remove. DECISION: V-at-top RECORDED, NOT
ACTED ON (FRAME_CHECK_VTOP=1 to act); it needs a release-side cue (both arms
extending together) before it can act. The catapult cap is kept: 6/6 on the
real one, 0/18 on the controls.

The tail of probe 2 was all gateway timeouts ("aborted due to timeout",
"terminated") — the two probes overlapped, i.e. my own load, the same lesson as
ANALYSIS_PASS_CONCURRENCY. Cleared before the arm (models 200 in 1s, chat 1s).

**Mini-arm e57** (same 7 fixtures, 2 runs, 3 fixtures in parallel, fetch timeout
900s; 4th launch - the first three graded 0/14 because the model reasoned ~8x
longer per call than in the morning and the 300s fetch timeout aborted and
re-ran calls). 0 DID NOT RUN, 0 transport failures.

```
                       e55 (uncropped)          e57 (cropped)
shot-196 Elbow [2,4]     9   MISS +5             3   ok   (cap fired 2/2)
shot-196 Power [2,4]     9   MISS +5             4   ok
shot-200 Elbow [2,4]     6   MISS +2             3   ok   (cap fired 2/2)
shot-200 Power [2,4]     6.5 MISS +2.5           4   ok
shot-196 Pocket [7.5,9.5] 9  ok                  4   MISS -3.5  <- the catapult's Pocket cap
shot-200 Pocket [7,9]    9   ok                  4   MISS -3    <- same
shot-202 Elbow [3,5]     8.5 MISS +3.5           9   MISS +4    (V recorded, not acted)
shot-198 Elbow [3,5]     9   MISS +4             9   MISS +4    (unsolved)
controls 125/189/206: all within 0.5 in both arms except 125 Elbow 9 vs [6.5,8]
(+1, no cap involved; e55 gave 8.5).
```
The catapult is fixed on both runs of the only catapult clip, and the fix
exposed a wrong cap: the expert scores the POCKET of that clip 7.5-9.5 - the
ball starts in a proper pocket and only then goes up and back. Pocket cap
under catapult REMOVED (arithmetic only: it can only return those two cells to
the model's in-band 9; no other fixture is a catapult). Not re-run as an arm.

Big misses (>= 3) on these 7: e55 had 4 (196 E, 196 P, 202 E, 198 E) plus 200 at
+2/+2.5; e57 after the Pocket fix has 3 (202 Elbow, 202 Pocket, 198 Elbow), all
on the two fixtures accepted as unsolved this round. KEPT. A full 28-fixture arm
of this config has not been run; the E54 paired numbers stand as the last full
measurement.

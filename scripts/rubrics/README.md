# Rubric drafts — WRITTEN, NOT APPLIED

Eight rewritten criterion rubrics. **None of these is live.** The live text is in
`criteria.grading_notes` in Postgres; these are candidates for it, loaded in
memory only via `RUBRIC_OVERRIDE` (see `applyRubricOverrides` in `lib/analyze.ts`).

Draft files are now **pinned per process**: each is read once, its sha logged,
and a mid-run edit cannot reach a running arm. Editing a draft while an eval was
running previously produced an arm graded partly by the old text and partly by
the new, which silently invalidated a 28-fixture baseline.

## Read this before writing or judging a rubric

Four measurements govern what a rubric should look like. Full detail in
`scripts/eval/EXPERIMENTS.md` (E16–E21).

**1. Judge a rewrite on r FIRST, not on the miss rate.** Correlating grader
scores against the expert's band midpoints gives a pooled **r = 0.50** — the
grader explains about a quarter of the variance in the expert's judgement. Two
criteria are near zero (`Forward Motion and Toes` r = +0.01, `Square to the
Basket` r = +0.07): they produce plausible numbers unrelated to the expert while
varying MORE than the expert does. A centred non-measurement is still a
non-measurement, so a rubric only helps if it changes **what the model looks at**.
Report r and error direction, not just the miss count.

**2. Never reserve the top band for elite performance.** The original generator's
template — sub-scores worth 4/3/2 points, summed, scaled, each top band for
"elite" or "perfect" — is measurably biased: across the criteria still using it,
misses ran **12 too LOW against 1 too high, p = 0.0034**. Prose rubrics with
reachable anchors came out 9 low vs 11 high, i.e. unbiased. Write anchors, not
arithmetic, and say in the file that the top anchor is ordinary correct form.
The global prompt has been fixed to prefer anchors over formulas.

**3. Measure something that clears the 8-pixel floor.** The shooter is ~166px
tall: ball ~21px, shoulders ~45px, hand ~15px, head ~22px, foot ~25px, a finger
~3px. JPEG blocking artefacts are 8px. Two rubric generations failed here — ball
widths first, then shoulder-width fractions, both asking for gaps of a few
pixels. Prefer **angles over long segments** (forearm lean), **displacements**
(a wrist travelling a ball width), and **landmark comparisons** over estimated
fractions of anything small. An "overlap" test between two objects 30px apart
vertically is a projected threshold, not an overlap — that mistake produced
elbow v10, which was rejected before shipping.

**4. Do not put the expert's label distribution in the prompt.** Telling the
model the expert's median or score range maximises pass rate without improving
perception, and collapsing variance drives r toward zero. It reads as a win and
is a regression. Cite the coaching standard, not the labels.

Also: every rubric must state whether it may return null. Only **Two Finger
Release, Shot Arc and Ball Rotation** may abstain — everything else is always
shown to the player and must always carry a score. When evidence is missing, the
correct default is the **no-fault-seen** end of the scale (a fault you cannot see
is not a fault), never the middle, which reports a fault on evidence never had.

## Sourcing

Rubric content is sourced to the form model this product grades against — **Herb
Magee**, with **Klay Thompson** as a second reference — and every claim in a file
is labelled verified / general-consensus / ours. Two corrections found by that
research, now reflected in the files:

- **"Dominant foot slightly forward" is not Magee.** It traces to Knudson (1993).
  Magee argued against footwork primacy; Klay, crediting Dave Hopla, says foot
  and hip position does not matter if the shoulders are square.
- **"Power comes from the legs" has no Magee source.** His "Legs" element is
  footwork and landing, not power generation.

Magee gives **no numeric thresholds anywhere**, so every number in these files is
ours and is labelled as ours. He has no documented shot pocket, no "connected
shot" concept, and nothing on what the guide hand does after release — those gaps
are stated in the files rather than filled.

## The two open questions

**Q1 — does a thumb flick get charged once or twice?** ANSWERED in the files, and
deliberately: `guidehand.txt` v4 mandates that a flick caps BOTH it and the
one-hand release criterion at 4, and `onehand.txt` v2 now implements that cap
explicitly and states that no other guide-hand fault is charged twice. Confirm or
overturn on PR #72; the behaviour is at least no longer accidental.

**Q2 — is a two-arm "V at the top" a catapult when the ball stays in front of the
forehead?** Still open. The owner's notes give a sharp test twice (*"catapult is
behind the head"*, *"this wasnt a catapult, just the shooting hand flared out"*)
and once call a V-at-the-top a catapult. `elbow.txt` v11 takes the narrow reading
(a floor needs a frame with the ball level with or behind the top of the head)
and, unlike v9/v10, says the floor WINS when that frame exists rather than
"take the milder one" — which had been licensing an 8 on a shot the expert scored 3.

## Status per draft

| draft | version | criterion | measures | state |
|---|---|---|---|---|
| `elbow.txt` | ELBOW v12 | Elbow L-Shape | **Three silhouette states** — ball vs head (front / beside / over-behind), elbow vs shoulder line (inside / at-or-beyond), forearm (post / lean / laid back) — plus the pinky tell. No fractions, no ball-edge grid (E24), no label priming. Catapult described as the up-and-back ball path. v11 (forearm-lean angle) was reverted; v10 was a rejected draft number. | draft, untested |
| `onehand.txt` | v2 | Shooting Through Guide Hand | **Guide-hand wrist travel toward the target in ball widths** (20–30px). v1 was rejected in review: one of its signs fired on correct form, and three needed finger-scale detail. | under test |
| `square.txt` | SQUARE v6 | Square to the Basket | Two-check plus full rungs. **r = +0.07 — measures nothing. Needs rebuilding, not tuning.** | FAILING |
| `knees.txt` | KNEES v2 | Knees Bent | Dip depth in HEAD HEIGHTS, no points-sum. Removed the direction of the error; miss count unmoved (E14/E18). Do not grade absence of a dip as a fault — the sources conflict on whether Klay dips at all. | neutral |
| `domfoot.txt` | v1 | Dominant Foot Forward | Stagger in FOOT LENGTHS, scale starting at 8, square feet explicitly a 9. Written against the worst measured bias in the set (4/5 misses, all low, −1.50). | untested |
| `guidehand.txt` | GUIDE HAND FT v4 | Guide Hand Follow Through | Gap between the hands at release in BALL WIDTHS and which way it moved. Owns the flick cap. | untested |
| `power.txt` | POWER v5 | Source of Shot Power | Vertical movement in HEAD-HEIGHTS; refuses to re-derive arm shape. **Cannot be written as Magee doctrine — he has no legs-power teaching.** | untested |
| `stance.txt` | STANCE v22 | Feet Shoulder Width | Shoe-widths in the gap, retargeted to hip width (still says "shoulder width" to the player). **Do last, alone** — feet is the largest single lever and the most likely to move everything else. | untested |

No rubric exists yet for `Connected Shot`, `Shot Pocket — Elbow`, `Forward Motion
and Toes`, `Shooting Hand Follow Through`, `Guide Hand Placement`, `Thumb is
Spread Wide` or `Palm Non-Contact with Ball`; `RUBRIC_DRAFTS` in `lib/analyze.ts`
has slots reserved for them. Note `Guide Hand Placement` scores 0/6 misses only
because expert and grader both always say ~7.7 (sd 0.38 vs 0.37) — it passes by
not discriminating, and is not evidence of anything.

## How to apply one

**Not with `npm run migrate`.** That replays the whole file, and the criteria
UPDATEs are guarded on the version tag they expect to find — when the live rubric
is ahead of the file, the guard misses and the live text is rewritten backwards.
STANCE v21 was live while `main` carried v15.

```
1. bump the version tag in the draft (v11 -> v12) so the guard and the
   rubric_tags readout both move
2. write the UPDATE into scripts/migrate.sql, guarded
   `WHERE grading_notes NOT LIKE '<TAG> v<N>%'`, so the file and the
   database stay reconciled
3. apply THAT STATEMENT ALONE to the database
4. npx tsx --env-file=.env.local scripts/eval/show-prompt.mjs  — confirm the
   prompt diff is only what you intended
5. npm run eval        — read the EXPERT number AND the per-criterion r.
                         ai-seeded cells are expected to move; that is what a
                         real change looks like
6. --accept the baseline, or revert the statement
```

One rubric per run. Two at once and the eval cannot tell you which one moved the
score. Arms run at 1 pass (E16: more passes buy no accuracy) with
`EVAL_FIXTURE_CONCURRENCY=4`, which is ~25 minutes for 28 fixtures.

## Rule 5 — every proportion carries its counts and an interval

No accuracy, miss rate or win rate goes in EXPERIMENTS.md as a bare percentage.
Write `13/15 = 87% CI [62, 96]`, never `87%`. A 3/9 and a 300/900 print
identically and mean completely different things; E42 shows a whole design
conversation built on the former while everyone read it as the latter.

If two numbers' intervals overlap, they have not been shown to differ. Say so.

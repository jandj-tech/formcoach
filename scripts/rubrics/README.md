# Rubric drafts — WRITTEN, NOT APPLIED

Five rewritten criterion rubrics. **None of these is live.** The live text is in
`criteria.grading_notes` in Postgres; these are candidates for it.

They are here rather than in a scratch directory because each one is hours of
work built from the owner's own corrections, and because the order and the
gating below matter more than the text.

## Why they are not applied

Each rubric is a grading change, and the two things that make a grading change
safe only just landed:

1. `prompt_sha` now hashes the real prompt, so a rubric edit can no longer ship
   without the Test Bench noticing (it could before — that is why past rewrites
   regressed unnoticed).
2. The fixture set went 5 → 28, which moves the minimum detectable effect from a
   78% relative cut to something that can actually see a regression.

So the machinery is ready. What is not settled is two judgement calls that
change what some of these rubrics should *say*.

## The two open questions

**Q1 — does a thumb flick get charged once or twice?** It is currently deducted
under both "Guide Hand Follow Through" (4 corrections) and "Shooting Through
Guide Hand / One Hand Release" (2 corrections), so one fault can cost points in
two places.

**Q2 — is a two-arm "V at the top" a catapult when the ball stays in front of
the forehead?** The owner's notes give a sharp test twice (*"catapult is behind
the head"*, *"this wasnt a catapult, just the shooting hand flared out"*) and
once call a V-at-the-top a catapult.

Both are posted for decision on PR #72.

## Status per draft

| draft | version | gated by | notes |
|---|---|---|---|
| `elbow.txt` | ELBOW v6 | — | Measures sideways elbow offset in BALL WIDTHS, so it survives a small, distant shooter where degrees and body lines do not. Q2 changes the `ball_behind_head` **flag**, not this text, so it is shippable first. |
| `square.txt` | SQUARE v4 | — | Removes "return null because the rim is off-camera", which was a large share of this criterion's abstentions. Independent of both questions. |
| `power.txt` | POWER v5 | — | Explicitly refuses to re-derive arm shape (that belongs to Elbow / Shot Pocket) — which is what was double-counting the catapult. Measures vertical movement in HEAD-HEIGHTS. |
| `guidehand.txt` | GUIDE HAND FT v4 | **Q1** | Scores the gap between the hands at release and whether it opened or closed. Whether it also owns the thumb flick is exactly Q1. |
| `stance.txt` | STANCE v22 | **do last, alone** | Feet is 28.5% of total squared error and 56% of its scores get corrected — the single largest lever and the most likely to move everything else. v22 also retargets from "shoulder width" to **hip width** (keeping "shoulder width" as the words written back to the player), and tightens the band from v21's "fewer than one / three or more" to "one to two shoes". Ship it by itself so the eval attributes the movement to it. |

## How to apply one

**Not with `npm run migrate`.** That replays the whole file, and the criteria
UPDATEs are guarded on the version tag they expect to find — when the live
rubric is ahead of the file, the guard misses and the live text is rewritten
backwards. STANCE v21 was live while `main` carried v15.

```
1. bump the version tag in the draft (v6 -> v7) so the guard and the
   rubric_tags readout both move
2. write the UPDATE into scripts/migrate.sql, guarded
   `WHERE grading_notes NOT LIKE '<TAG> v<N>%'`, so the file and the
   database stay reconciled
3. apply THAT STATEMENT ALONE to the database
4. npx tsx --env-file=.env.local scripts/eval/show-prompt.mjs  — confirm the
   prompt diff is only what you intended
5. npm run eval        — read the EXPERT number. ai-seeded cells are expected
                         to move; that is what a real change looks like
6. --accept the baseline, or revert the statement
```

One rubric per run. Two at once and the eval cannot tell you which one moved
the score.

# Grading Test Bench — the safety net for every grading change

The problem this solves: rubric and calibration edits used to ship with only a
spot-check on whichever shot was analyzed last, so a fix for one shot could
silently re-scale grading for everything else. Now every grading change is
measured against the same pinned reference shots before it ships.

## The contract

**No rubric or prompt change merges without a Test Bench run and an approved
baseline update.**

```
edit rubric SQL (scripts/migrate.sql)
  → apply JUST that statement to the database (see the warning below)
  → run the Test Bench (admin UI or `npm run eval`)
  → read the per-shot diffs — the EXPERT number, not the total
  → approve the new baseline  OR  revert the rubric edit
```

> **Do not run `npm run migrate` against the live database to ship a rubric
> edit.** It replays the entire file, and the criteria UPDATEs are guarded on
> the version tag they expect to find. When the live rubric is *ahead* of the
> file — which it has been — those guards do not match and the migration
> silently rewrites the live rubric backwards. STANCE v21 was live while
> `main` still carried v15, and running the file would have downgraded it.
> Apply the single statement you actually changed, then verify it landed.

Admin corrections apply to the grader **live** (owner's choice). Because the
correction text is hashed into the grader's `prompt_sha`, the Test Bench shows
a **GRADER CHANGED** warning whenever corrections (or rubric edits) have moved
the grader since the approved baseline — that warning is the record.

## Two front doors, one system

| | Admin UI | Terminal |
|---|---|---|
| Where | **/admin/eval** (“Test Bench” tab) | project folder, `.env.local` loaded |
| Add reference shots | click “Add” on a recent analysis | `npx tsx --env-file=.env.local scripts/eval/author-fixture.mjs <analysisId> [slug]` |
| Edit expectations | “Edit expectations” panel | (use the admin UI) |
| Run | “Quick check” / “Full eval” buttons | `npm run eval:quick` / `npm run eval` |
| Approve baseline | “Approve as new baseline” button | `npm run eval -- --accept` |

Both read and write the same Postgres tables: `eval_fixtures` (reference
shots + expected ranges) and `eval_baselines` (append-only approved results).
Shared code: `lib/eval.ts` (server: frames + grading) and `lib/eval-report.ts`
(pure math: aggregation, accuracy, drift).

## What a run reports, per reference shot

- **CONSISTENCY** — spread of the overall score across repeat runs on
  identical frames (PASS ≤ 0.1, CLOSE ≤ 0.5, FAIL above), worst per-criterion
  spread, and any flag or ungraded/scored disagreement between runs. Full runs
  only (quick does a single run, so there is no spread to measure).
- **ACCURACY** — median of the runs vs the expected ranges: overall range,
  per-criterion `[min, max]` or “must stay ungraded”, flags, player type, and
  shot detection for the no-shot clip. Reported as **two numbers that are
  never added together** — see below.
- **DID NOT RUN** — fixtures that produced no result at all (a thrown error, a
  gateway refusal, a truncated response). Counted separately on purpose: four
  different bugs once all scored “5 failures” on a 5-fixture suite, and one of
  them — a model answering `shot_detected: false` on every clip — read as the
  best result in a model bake-off. A model that dies on everything must not be
  able to look accurate. If this is non-zero, fix it before comparing anything.
- **DRIFT vs baseline** — anything that moved vs the last approved baseline:
  criterion deltas > 0.5, overall delta, flag changes, ungraded↔scored changes.

CLI exit code is non-zero on any accuracy failure or drift, so it can gate CI.

## Costs (grading model calls only when you run it)

- Quick check: ~15¢ per reference shot (1 run × 1 pass)
- Full eval: ~55¢ per reference shot (2 runs × the normal 3-pass ensemble)

At 28 fixtures that is roughly **$4 a quick check and $15 a full run** on
claude-sonnet-4-6. Set `ANALYSIS_MODEL` to a cheap vision model (with
`OPENROUTER_API_KEY` exported) for exploratory sweeps and keep the production
model for the run that actually gates a merge — but note that ai-seeded ranges
were seeded from production's output, so they will fail for model reasons on
any other model. Compare arms, not absolutes.

## EXPERT vs ai-seeded — the only number that means "accurate"

Every expected range carries its provenance in `expected.criteria_source`:

| source | where the range came from | what a failure means |
|---|---|---|
| `expert` | the owner corrected that criterion by hand | **the grade is wrong.** Real ground truth. |
| `ai` | seeded from what the grader itself said, and the owner did not object | **the grade MOVED.** Circular — it is scored against the old grader's own output, so it can never show the grader was already wrong. |

Roughly 4 in 5 imported cells are `ai`, so summing them into one "miss rate"
buries the cells that matter. The runner prints them separately, marks
ai-seeded lines with `[ai-seeded]`, and **only the EXPERT count sets the exit
status**. A deliberate grading change *should* move ai-seeded cells — that is
what it looks like when it works. What must not move is the expert count.

## How much this suite can actually detect

Measured, not assumed. At 5 fixtures the suite held ~56 criterion assertions
and re-running the **identical** prompt moved the miss count by ±6–7. At that
size a 20%-worse grader was caught 12% of the time and the minimum detectable
effect was a **78% relative** cut — it could not see a regression, which is how
past rubric rewrites shipped broken.

`scripts/eval/import-corrected.mjs` imports every hand-corrected analysis whose
frames are still pinned (52 → 466 cells). Re-run it as corrections accumulate;
it skips anything already a fixture, so it is safe to run repeatedly.

## Seeing what actually changed

`prompt_sha` tells you the grader moved. It does not tell you *what* moved:

```
npx tsx --env-file=.env.local scripts/eval/show-prompt.mjs > after.txt
git stash && npx tsx --env-file=.env.local scripts/eval/show-prompt.mjs > before.txt && git stash pop
diff before.txt after.txt
```

Do this before every grading run. It is how the `overall_score` and
calibration-block removals were confirmed to be *exactly* the intended three
edits and nothing else.

## Building a good fixture set

Aim for ~8–10 hand-authored shots spanning the range: one excellent, one
mid-tier, elbow-out, guide-hand flick, chest-pass, a child player, one
poor-visibility clip where arc/rotation/two-finger **must stay ungraded**, and
one clip with no shot at all. Shots already corrected in Learn Mode are the
best material — their prefilled expected ranges start from your own numbers.

## Known residual: frame selection

The Test Bench grades **pinned frames**, so it isolates rubric/model/prompt
changes. Re-uploading the same *video* can still produce slightly different
frames (browser seek timing, and the release frame is picked by an LLM
detection call). Seek timestamps are quantized in
`components/VideoUploader.tsx` so the same device converges on identical
frames (and hits the frames-hash cache); fully deterministic frames would need
server-side extraction (ffmpeg from the uploaded video) — a possible
follow-up, measurable with this harness when it happens.

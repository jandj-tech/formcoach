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
  → npm run migrate
  → run the Test Bench (admin UI or `npm run eval`)
  → read the per-shot diffs
  → approve the new baseline  OR  revert the rubric edit
```

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
  shot detection for the no-shot clip.
- **DRIFT vs baseline** — anything that moved vs the last approved baseline:
  criterion deltas > 0.5, overall delta, flag changes, ungraded↔scored changes.

CLI exit code is non-zero on any accuracy failure or drift, so it can gate CI.

## Costs (grading model calls only when you run it)

- Quick check: ~15¢ per reference shot (1 run × 1 pass)
- Full eval: ~55¢ per reference shot (2 runs × the normal 3-pass ensemble)

## Building a good fixture set

Aim for ~8–10 shots spanning the range: one excellent, one mid-tier,
elbow-out, guide-hand flick, chest-pass, a child player, one poor-visibility
clip where arc/rotation/two-finger **must stay ungraded**, and one clip with
no shot at all. Shots already corrected in Learn Mode are the best material —
their prefilled expected ranges start from your own numbers.

## Known residual: frame selection

The Test Bench grades **pinned frames**, so it isolates rubric/model/prompt
changes. Re-uploading the same *video* can still produce slightly different
frames (browser seek timing, and the release frame is picked by an LLM
detection call). Seek timestamps are quantized in
`components/VideoUploader.tsx` so the same device converges on identical
frames (and hits the frames-hash cache); fully deterministic frames would need
server-side extraction (ffmpeg from the uploaded video) — a possible
follow-up, measurable with this harness when it happens.

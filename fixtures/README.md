# Golden-fixture eval — the safety net for every grading change

The problem this solves: rubric and calibration edits used to ship with only a
spot-check on whichever shot was analyzed last, so a fix for one shot could
silently re-scale grading for everything else. Now every grading change is
measured against the same pinned reference shots before it ships.

## The contract

**No rubric, prompt, or calibration change merges without an eval run and an
accepted baseline update.**

```
edit rubric SQL (scripts/migrate.sql)
  → npm run migrate
  → npm run eval          # re-grades all fixtures, diffs vs baseline
  → read the per-fixture diffs
  → npm run eval -- --accept    (keep the change)  OR  revert the rubric edit
```

## Files

| Path | Checked in? | What it is |
|---|---|---|
| `fixtures/shots/<slug>.json` | yes | One reference shot: pinned Blob frame URLs + integrity hash + expert-expected grade ranges |
| `fixtures/baseline.json` | yes | The last **accepted** eval result per fixture, stamped with the grader identity (`prompt_sha`, rubric tags, model, passes, calibration version) that produced it. Only `--accept` rewrites it. |
| `fixtures/.cache/` | no (gitignored) | Downloaded frames. Safe to delete; re-downloaded and hash-verified on the next run. |

## Commands

```sh
npm run eval                  # full eval: 2 runs × default ensemble passes per fixture (≈ $3–5 for ~9 fixtures)
npm run eval:quick            # 1 run × 1 pass — cheap smoke while iterating (≈ $0.60)
npm run eval -- --only elbow-out-sidecam,chest-pass
npm run eval -- --runs 3      # better spread estimate
npm run eval -- --accept      # freeze current results as the new baseline
```

The eval reports, per fixture:

- **CONSISTENCY** — spread of the overall score across repeat runs on identical
  frames (PASS ≤ 0.1, CLOSE ≤ 0.5, FAIL above), worst per-criterion spread, and
  any flag or null/scored disagreement between runs.
- **ACCURACY** — median of the runs vs the `expected` ranges in the fixture.
- **BASELINE drift** — anything that moved vs the last accepted baseline:
  criterion deltas > 0.5, overall delta, flag changes, null↔scored changes.

Exit code is non-zero on any accuracy failure or baseline drift, so it can gate
CI later.

## Authoring fixtures

Seed from analyses you've already expert-corrected in the admin panel
(`criterion_scores.admin_score`):

```sh
npx tsx --env-file=.env.local scripts/eval/author-fixture.mjs <analysisId> <slug>
```

Then hand-edit the written `fixtures/shots/<slug>.json`: tighten the prefilled
ranges, set `expected.flags` / `player_type` to the expert truth, write a real
`description`. Range syntax per criterion (keyed by **criterion name**):

- `[min, max]` — the median across runs must land inside, inclusive
- `"null"` — the criterion must stay ungraded (the never-guess rules held)
- omitted — unchecked

Aim for ~8–10 fixtures spanning the range: one excellent shot, one mid-tier,
elbow-out, guide-hand flick, chest-pass, a child player, one poor-visibility
clip where arc/rotation/two-finger **must** stay null, and one no-shot clip
(`"expected": { "shot_detected": false }`).

## Calibration workflow (frozen since the grader-calibration migration)

Admin corrections **no longer change the grader live**. They accumulate until
you bundle and activate them:

```sh
npm run calibration:refresh                    # mint a draft version, see the diff vs active
npm run calibration:refresh -- --activate      # mint + activate in one step
npm run eval                                   # measure what the new calibration did
npm run eval -- --accept                       # keep it — or roll back:
npm run calibration:refresh -- --activate-version <N>
```

## Known residual: frame selection

The eval grades **pinned frames**, so it isolates rubric/model/prompt changes.
Re-uploading the same *video* can still produce slightly different frames
(browser seek timing, and the release frame is picked by an LLM detection
call). Seek timestamps are quantized in `components/VideoUploader.tsx` so the
same device converges on identical frames (and hits the frames-hash cache);
fully deterministic frames would need server-side extraction (ffmpeg from the
uploaded video) — a possible follow-up, measurable with this harness when it
happens.

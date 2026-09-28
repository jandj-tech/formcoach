/**
 * ANCHOR EXAMPLES — graded footage shown to the model so the 0-10 scale means
 * something.
 *
 * The prompt currently contains NO example of a graded shot. The model is asked
 * to land on a private expert scale it has never seen, which is a large part of
 * why a third of all scores clustered on exactly 9 and why rewriting anchor text
 * inside rubrics kept failing — words like "ordinary competent" carry no
 * calibration without a referent.
 *
 * TWO CONSTRAINTS, both learned the hard way and both encoded here:
 *
 * 1. ANCHORS MUST CARRY THEIR FOOTAGE. buildCalibrationFeedbackText already
 *    tried text-only calibration and the comment there records what happened:
 *    an averaged "be more generous" directive made a catapulted shot grade 8
 *    against a rubric capping it at 4, and score examples whose footage the
 *    model could not see biased its read of every clip. A score without its
 *    frames is an instruction to shift the scale, not a calibration.
 *
 * 2. AN ANCHOR MUST NEVER BE A SHOT WE ARE SCORING. Every corrected analysis we
 *    own is already an eval fixture, so any anchor overlaps the test set. The
 *    eval must hold its anchors out of scoring — ANCHOR_SLUGS names them and
 *    run-eval skips them — or the result is training on the test set.
 */
export type Anchor = {
  /** Fixture slug the frames come from. Held out of scoring when used. */
  slug: string
  criterion: string
  /** The expert's own score for this criterion on this shot. */
  score: number
  /** Which pinned frames to show. Few and well-chosen beats many. */
  frameIndexes: number[]
  /** One line on what makes it that score, in the expert's terms. */
  note: string
}

export function anchorSlugs(): string[] {
  return (process.env.ANCHOR_SLUGS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function anchorsEnabled(): boolean {
  return process.env.ANCHORS === '1' && anchorSlugs().length > 0
}

/**
 * Header shown above the anchor images. The images themselves are appended to
 * the message in order, so the model is told exactly what it is looking at and
 * that the anchors are NOT the shot under test.
 */
export function renderAnchorHeader(anchors: Anchor[]): string {
  const lines = anchors
    .map(
      (a, i) =>
        `  Example ${i + 1} (${a.frameIndexes.length} frames): "${a.criterion}" scored ${a.score} by the expert — ${a.note}`
    )
    .join('\n')
  return `CALIBRATION EXAMPLES — READ BEFORE GRADING, AND DO NOT GRADE THESE.
The first images below are from OTHER shots the expert has already graded, shown so you can see what his scale actually means. They are reference material only.

${lines}

The shot you are grading begins after these examples. Use them to judge how severe a fault has to be to earn a given number — not to decide what this shooter did.`
}

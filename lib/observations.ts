/**
 * OBSERVATION-BASED SCORING — the model reports WHAT IT SAW; the score is
 * computed here, deterministically.
 *
 * WHY. Every criterion currently asks the model for a number, so every
 * calibration problem routes through its private sense of what "7" means.
 * Measured consequences: a third of all scores landed on exactly 9; one
 * half-point was used in 345 scores; the grader's own scale collapsed or
 * inverted depending on the rubric; and the same footage scored differently on
 * duplicate copies in a single run. Rewriting rubric anchors could not fix any
 * of that, because the global scale block and the model's own priors overrode
 * the anchors.
 *
 * A categorical observation is a far easier judgement than a calibrated score
 * ("is the elbow inside the ball's outline?" versus "is this a 6 or a 7?"), and
 * once it is made the score is arithmetic. That makes grading deterministic,
 * auditable — you can see exactly why a score was given — and tunable without
 * re-running the model: change the table, re-score the stored observations.
 *
 * Only criteria with a genuinely discrete, visible structure are listed here.
 * A criterion whose distinctions are not in the image does not become
 * measurable by being asked categorically.
 */

export type ObservationOption = {
  /** The value the model returns. */
  key: string
  /** What the model is told this option means. Must be visually checkable. */
  describe: string
  /** The score this observation earns. Tunable without touching the model. */
  score: number
}

export type ObservationSpec = {
  criterion: string
  /** The single question the model answers, in place of picking a number. */
  question: string
  options: ObservationOption[]
  /** Used when the model answers "unclear" — never full credit, never a fault. */
  unclearScore: number
}

export const OBSERVATION_SPECS: ObservationSpec[] = [
  {
    criterion: 'Elbow L-Shape — Under the Ball',
    question:
      'At the set point — the frame where the ball is up around the face, still held, not yet released — where is the point of the shooting elbow compared with the ball and with the shooting shoulder?',
    options: [
      { key: 'under_ball', describe: 'Directly beneath the ball: drop a line down each side of the ball and the elbow is between them. Elbow, wrist and ball read as one column.', score: 9 },
      { key: 'ball_edge', describe: 'Right at the edge of the ball line — you cannot confidently say inside or outside.', score: 7.5 },
      { key: 'outside_ball', describe: 'Clearly outside the ball, but still inboard of the outer edge of the shooting shoulder. The arm is working on the shooting side of the body.', score: 6 },
      { key: 'shoulder_edge', describe: 'Level with the outer edge of the shooting shoulder — right on the line between working underneath and winging out.', score: 4.5 },
      { key: 'winged_out', describe: 'Outside the shoulder entirely, with a visible gap opening between the upper arm and the side of the chest. The ball sits beside the head rather than above the arm.', score: 3 },
      { key: 'no_stack', describe: 'The ball never sits above the elbow in any frame — pushed from beside the shoulder, or the upper arm comes up level with the shoulders.', score: 1.5 },
    ],
    unclearScore: 6.5,
  },
  {
    criterion: 'Feet Shoulder Width Apart',
    question:
      'As the player rises into the shot, how wide is the gap between the insides of the two feet, measured in widths of the player\'s own shoe?',
    options: [
      { key: 'touching', describe: 'Feet almost touching — less than about one shoe width between them.', score: 3 },
      { key: 'narrow', describe: 'About one shoe width apart. Narrower than the hips.', score: 5.5 },
      { key: 'correct', describe: 'Between about one and two shoe widths — the feet sit under the hips or a little wider. This is the normal correct base.', score: 9 },
      { key: 'wide', describe: 'About two and a half to three shoe widths — noticeably wider than the shoulders.', score: 5.5 },
      { key: 'very_wide', describe: 'Three or more shoe widths — a straddle the player has to fight to shoot from.', score: 3 },
    ],
    unclearScore: 7,
  },
  {
    criterion: 'Knees Bent',
    question:
      'Between the gather and the start of the rise, how far does the crown of the player\'s head drop, measured in heights of the player\'s own head?',
    options: [
      { key: 'third_head_plus', describe: 'A clear dip of about a third of a head height or more, flowing straight into the upward drive.', score: 9.5 },
      { key: 'quarter_head', describe: 'A visible dip of about a quarter of a head, used to push upward. The ordinary competent shot.', score: 8 },
      { key: 'eighth_head', describe: 'A shallow but real dip — an eighth of a head or so.', score: 7 },
      { key: 'barely', describe: 'Barely perceptible knee flex: the legs do something but the shot is mostly arms.', score: 6 },
      { key: 'none', describe: 'No usable dip — the player shoots from a standing position with straight or near-straight legs.', score: 4.5 },
    ],
    unclearScore: 7.5,
  },
]

const BY_NAME = new Map(OBSERVATION_SPECS.map((s) => [s.criterion, s]))

export function observationSpecFor(criterionName: string): ObservationSpec | undefined {
  return BY_NAME.get(criterionName)
}

/** Maps a returned observation key to its score. Unknown keys fall to unclear. */
export function scoreFromObservation(spec: ObservationSpec, key: string | null | undefined): number {
  const opt = spec.options.find((o) => o.key === key)
  return opt ? opt.score : spec.unclearScore
}

/** The block appended to a criterion's guide when observation mode is on. */
export function renderObservationPrompt(spec: ObservationSpec): string {
  const opts = spec.options.map((o) => `    "${o.key}" — ${o.describe}`).join('\n')
  return `ANSWER BY OBSERVATION, NOT BY SCORE. Do not choose a number for this criterion. Answer this one question and report the option that matches what you saw:

  ${spec.question}

${opts}
    "unclear" — you cannot see what the question asks about well enough to choose. Say this rather than guessing; it is a useful answer, not a failure.

Return it as "observation": "<key>" alongside your reasoning. The score is computed from your answer, so choosing the option that genuinely matches what you saw is the whole task.`
}

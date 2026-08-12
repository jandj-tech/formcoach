// Motion analysis over the probe frames the uploader already decodes to locate
// the release. Diffing them costs almost nothing on top and answers the two
// questions that decide whether the grader can see anything useful: WHERE in the
// frame the player is, and WHEN the shot is actually moving.
//
// Kept out of the component so it can be exercised directly by a test — the crop
// box in particular fails silently if it goes wrong, producing frames that look
// plausible but have the player half out of shot.

const MOTION_STEP = 4     // sample every 4th pixel: 16x less work, same answer
const MOTION_DELTA = 26   // luma change that counts as movement
const MOTION_FLOOR = 0.25 // frame density a dead-still stretch still earns

// Motion is accumulated per PIXEL COLUMN rather than as a min/max bounding box.
// A bounding box is decided by its most extreme pixel, and in real footage that
// is compression noise, a reflection on the floor or a shake at the frame edge —
// measured on live clips, a min/max box covered 99% of the width and the crop
// silently never happened. A column histogram lets the bulk of the motion decide.
export type MotionColumns = number[]

export function emptyMotionColumns(width: number): MotionColumns {
  return new Array(width).fill(0)
}

function luma(d: Uint8ClampedArray, i: number): number {
  return (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000
}

/**
 * How many sampled pixels moved between two probe frames, adding each moving
 * pixel to its column tally so the whole pass builds a motion histogram.
 */
export function diffFrames(
  prev: { data: Uint8ClampedArray; width: number; height: number },
  cur: { data: Uint8ClampedArray; width: number; height: number },
  columns: MotionColumns,
): number {
  const w = cur.width
  const h = cur.height
  const a = prev.data
  const b = cur.data
  let moved = 0
  for (let y = 0; y < h; y += MOTION_STEP) {
    for (let x = 0; x < w; x += MOTION_STEP) {
      const i = (y * w + x) * 4
      if (Math.abs(luma(b, i) - luma(a, i)) > MOTION_DELTA) {
        moved++
        columns[x] += 1
      }
    }
  }
  return moved
}

/**
 * Frame timestamps weighted by motion instead of spaced evenly. Even spacing put
 * a third of the budget on a player standing still holding the ball, and gave the
 * release — where the two-finger release, the wrist snap and the guide-hand
 * separation all live — no more frames than the wind-up.
 */
export function motionWeightedTimes(
  count: number,
  start: number,
  end: number,
  probeTimes: number[],
  motion: number[],
): number[] {
  const span = end - start
  const uniform = () =>
    Array.from({ length: count }, (_, i) => start + (span / (count + 1)) * (i + 1))
  if (span <= 0 || probeTimes.length < 2 || motion.length < 2) return uniform()
  const peak = Math.max(...motion)
  if (!(peak > 0)) return uniform()

  // Density curve over the window from the probe scores, then timestamps at equal
  // steps of CUMULATIVE motion. MOTION_FLOOR keeps quiet moments represented, so
  // the set point and the landing never vanish entirely.
  const STEPS = 300
  const dt = span / STEPS
  const weights: number[] = []
  for (let s = 0; s < STEPS; s++) {
    const t = start + dt * (s + 0.5)
    let nearest = 0
    let bestGap = Infinity
    for (let i = 0; i < probeTimes.length; i++) {
      const gap = Math.abs(probeTimes[i] - t)
      if (gap < bestGap) {
        bestGap = gap
        nearest = i
      }
    }
    weights.push(MOTION_FLOOR + (1 - MOTION_FLOOR) * (motion[nearest] / peak))
  }

  const total = weights.reduce((sum, v) => sum + v, 0)
  const out: number[] = []
  let acc = 0
  let s = 0
  for (let k = 1; k <= count; k++) {
    const target = (total * k) / (count + 1)
    while (s < STEPS - 1 && acc + weights[s] < target) {
      acc += weights[s]
      s++
    }
    out.push(start + dt * (s + 0.5))
  }
  return out
}

/**
 * The player's column: the moving region widened for margin, kept FULL height so
 * the ball's flight and the rim stay in frame (Shot Arc returns null without
 * them). Null means don't crop — either nothing moved, or the motion already
 * spans the frame and cropping would buy nothing.
 */
export function playerColumn(
  columns: MotionColumns,
  videoW: number,
  videoH: number,
  probeW: number,
): { x: number; width: number } | null {
  const peak = Math.max(...columns)
  if (!(peak > 0)) return null

  // The player is the MODE of this histogram, not its range. Measured on real
  // clips, compression noise and floor reflections put a thin scatter of movement
  // across almost every column, so any percentile of the total mass still spans
  // the frame; the player instead shows up as a tall contiguous run. So: start at
  // the busiest column and grow outward while columns stay above a third of the
  // peak, which walks the run and stops at the noise floor.
  const floor = peak * 0.34
  const peakIdx = columns.indexOf(peak)
  let lo = peakIdx
  let hi = peakIdx
  while (lo > 0 && columns[lo - 1] >= floor) lo--
  while (hi < columns.length - 1 && columns[hi + 1] >= floor) hi++

  const x0 = (lo / probeW) * videoW
  const x1 = (hi / probeW) * videoW
  const mid = (x0 + x1) / 2
  // 1.6x the moving width for margin, never narrower than 30% of the frame height
  // so a shooter who barely moves sideways still keeps some context.
  let width = Math.max((x1 - x0) * 1.6, videoH * 0.3)
  if (width >= videoW * 0.92) return null
  width = Math.min(width, videoW)
  const rounded = Math.round(width)
  const x = Math.max(0, Math.min(videoW - rounded, Math.round(mid - rounded / 2)))
  return { x, width: rounded }
}

/**
 * Canvas size for a cropped frame, holding the OUTPUT AREA to what the old
 * full-frame policy would have emitted — equal area means equal image-token cost,
 * so the player fills more of the frame for the same money. Capped at 2.2x
 * because past roughly double, upscaling is interpolation not recovered detail.
 */
export function cropCanvasSize(
  srcW: number,
  videoW: number,
  videoH: number,
  frameScale: number,
): { width: number; height: number; scale: number } {
  const budgetArea = videoW * frameScale * videoH * frameScale
  const scale = Math.min(
    Math.max(Math.sqrt(budgetArea / (srcW * videoH)), frameScale),
    2.2,
  )
  return {
    width: Math.round((srcW * scale) / 2) * 2,
    height: Math.round((videoH * scale) / 2) * 2,
    scale,
  }
}

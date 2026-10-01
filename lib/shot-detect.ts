import { callVisionModel, detectModel } from '@/lib/model-provider'

/**
 * The two cheap vision calls that locate the shot before grading: a rough pass
 * over the whole clip, then a precise release pick inside the dense window.
 *
 * Shared by the /api/detect-shot-* routes (browser-side extraction asks over
 * HTTP) and lib/server-frame-extraction.ts (the server asks directly when it
 * is the one decoding the video). Both callers must see identical prompts, or
 * the same clip would be windowed differently depending on which machine
 * decoded it.
 */

/** 0-100: how far into the clip the release most likely sits. */
export async function detectShotRegion(frames: string[]): Promise<number> {
  const n = frames.length
  const { text } = await callVisionModel({
    model: detectModel(),
    framesBase64: frames,
    frameMimeTypes: frames.map(() => 'image/jpeg'),
    maxTokens: 50,
    userText: `These are ${n} evenly-spaced frames numbered 0 to ${n - 1} covering a basketball video from start to finish.

Which frame number is closest to the basketball shot release — the moment the shooter's arm is extended upward with the ball leaving their hand? If multiple shots, pick the last one. If no obvious release, pick the most likely frame.

Output ONLY this JSON: {"frame": <0 to ${n - 1}>}`,
  })
  const match = text.match(/\{[\s\S]*?\}/)
  const fallbackFrame = Math.floor(n * 0.6)
  if (!match) return 60
  const parsed = JSON.parse(match[0])
  const frame = Math.max(0, Math.min(n - 1, Number(parsed.frame ?? fallbackFrame)))
  return Math.round((frame / Math.max(1, n - 1)) * 100)
}

/** Index (0..n-1) of the release frame among the dense probe frames. */
export async function detectShotWindow(frames: string[]): Promise<number> {
  const n = frames.length
  const { text } = await callVisionModel({
    model: detectModel(),
    framesBase64: frames,
    frameMimeTypes: frames.map(() => 'image/jpeg'),
    maxTokens: 100,
    userText: `These are ${n} evenly-spaced frames numbered 0 to ${n - 1} from a basketball video.

Find the RELEASE frame — the single moment where the shooter is at the peak of their jump with their shooting arm fully extended upward and the ball at their fingertips just leaving (or just having left) their hand. This is the most visually distinctive moment of any jump shot: full extension, ball at the top, wrist snapping or just snapped.

If there are multiple shots in the video, return the LAST release frame (highest frame number).

Do NOT return a setup frame, a dribbling frame, or a follow-through frame. Only the release — arm up, ball at fingertips.

Output ONLY this JSON, nothing else: {"release": <frame number 0 to ${n - 1}>}`,
  })
  const match = text.match(/\{[\s\S]*?\}/)
  const fallback = Math.floor(n * 0.6)
  if (!match) return fallback
  const parsed = JSON.parse(match[0])
  return Math.max(0, Math.min(n - 1, Number(parsed.release ?? fallback)))
}

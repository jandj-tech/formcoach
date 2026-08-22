/**
 * Validation for the base64 frame arrays the shot-detection routes accept.
 *
 * Both routes forwarded `frames` straight into an Anthropic image request with
 * no length or size limit, so one request could carry hundreds of full-size
 * images — unbounded spend on our API key, and unbounded memory in the
 * function. The client sends 10 (rough pass) or 30 (probe pass) small JPEGs, so
 * these ceilings are far above any legitimate call.
 */

/** Client sends ROUGH_COUNT=10 or PROBE_COUNT=30; leave headroom. */
export const MAX_FRAMES = 40
/** A 320px q0.6 JPEG is ~10-30KB of base64. 256KB is a very loose ceiling. */
export const MAX_FRAME_CHARS = 256 * 1024

export type FrameCheck =
  | { ok: true; frames: string[] }
  | { ok: false; error: string }

export function validateFrames(input: unknown): FrameCheck {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, error: 'frames must be a non-empty array' }
  }
  if (input.length > MAX_FRAMES) {
    return { ok: false, error: `Too many frames (max ${MAX_FRAMES})` }
  }
  for (const f of input) {
    if (typeof f !== 'string' || !f) {
      return { ok: false, error: 'Each frame must be a base64 string' }
    }
    if (f.length > MAX_FRAME_CHARS) {
      return { ok: false, error: 'Frame too large' }
    }
    // Reject anything that is not plain base64 — a data: URL prefix or raw
    // binary would otherwise be forwarded to the model as-is.
    if (!/^[A-Za-z0-9+/=\s]+$/.test(f)) {
      return { ok: false, error: 'Frame is not valid base64' }
    }
  }
  return { ok: true, frames: input as string[] }
}

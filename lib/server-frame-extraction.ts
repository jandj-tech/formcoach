import { chmod, copyFile, mkdtemp, readFile, readdir, rename, rm, stat } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import ffmpegStatic from 'ffmpeg-static'
import { diffFrames, emptyMotionColumns, motionWeightedTimes } from '@/lib/frame-motion'
import { detectShotRegion, detectShotWindow } from '@/lib/shot-detect'

/**
 * Server-side frame extraction with ffmpeg.
 *
 * The browser does this job for free whenever it can (lib/frame-extraction.ts).
 * It cannot when the clip's video codec is one the browser does not decode —
 * an iPhone's default HEVC "High Efficiency" .MOV on a Windows PC, Dolby
 * Vision HDR, ProRes, and most of what Android, GoPros and camcorders write.
 * Those clips used to die with "Could not read this video". Now the browser
 * uploads the original and this module decodes it with ffmpeg, which reads
 * every codec in common use, and hands back the same 28 frames the browser
 * would have produced.
 *
 * The three-phase shape (rough → probe → final) deliberately mirrors the
 * client so a clip gets the same shot window whichever machine decoded it:
 *   1. survey the whole clip at low resolution, ask the model where the shot is
 *   2. probe densely around that region, measure motion, ask for the release
 *   3. decode the 2.5s shot window at full quality and pick motion-weighted frames
 */

const FRAME_COUNT = 28
const ROUGH_COUNT = 10
const PROBE_COUNT = 30
const REGION_PAD = 0.40
const REGION_MIN_S = 5.0
const RELEASE_BEFORE_S = 1.7
const RELEASE_AFTER_S = 0.8

// Phase 1 decodes the clip once at a steady low frame rate. Past this length a
// full decode of a 4K/60 clip would take minutes on one vCPU, so long clips
// are sampled with keyframe seeks instead (a few dozen cheap single-frame
// decodes) — coarser in time, but the final pass re-decodes the shot window
// precisely either way.
const FULL_DECODE_MAX_S = 60
const SURVEY_FPS = 12
const SURVEY_MAX_FRAMES = 720
const SEEK_SURVEY_FRAMES = 64
const SURVEY_EDGE = 320
const ROUGH_EDGE = 160
const FINAL_FPS = 30
// Same env knob as the client; image tokens scale with frame area.
const FINAL_EDGE = Number(process.env.NEXT_PUBLIC_MAX_FRAME_DIM) || 1280
// Nothing longer than this gets decoded — it is a game film, not a shot clip.
const MAX_DURATION_S = 10 * 60
// The frames travel back to the browser in one response, which Vercel caps at
// 4.5MB — same budget the client uses before posting to /api/analyze.
const UPLOAD_BUDGET_BYTES = 3.8 * 1024 * 1024
// The original is ALWAYS downloaded to /tmp and ffmpeg only ever opens local
// files (`-protocol_whitelist file`). Letting ffmpeg fetch the URL itself
// would also let a crafted playlist named .mp4 make it fetch any URL the
// server can reach. Vercel gives a function 500MB of /tmp.
export const DOWNLOAD_MAX_BYTES = 450 * 1024 * 1024
const DOWNLOAD_TIMEOUT_MS = 180_000
// Detector calls are best-effort; past this we fall back to defaults rather
// than let a slow model push the function into Vercel's kill at maxDuration.
const DETECT_TIMEOUT_MS = 60_000
// A tmp dir older than this belongs to a request Vercel killed mid-flight.
const STALE_TMP_MS = 20 * 60 * 1000
const STDERR_CAP = 64 * 1024

export type VideoReadCode = 'no_video' | 'unreadable' | 'too_long' | 'ffmpeg_missing' | 'timeout'

export class VideoReadError extends Error {
  code: VideoReadCode
  constructor(code: VideoReadCode, message: string) {
    super(message)
    this.name = 'VideoReadError'
    this.code = code
  }
}

export interface ServerExtractResult {
  frames: Buffer[]
  /** True when resolution had to be cut to fit the response budget. */
  reduced: boolean
  info: {
    codec: string
    duration: number
    hdr: boolean
    surveyMode: 'full' | 'seek'
    /** Size of the original, from the download. */
    bytes: number
    ms: number
  }
}

export interface ServerExtractOptions {
  log?: (line: string) => void
  /** Total wall-clock budget; each ffmpeg call gets a slice of what is left. */
  deadlineMs?: number
  /** Aborting kills any running ffmpeg and stops the pipeline (client went away). */
  signal?: AbortSignal
}

// --- ffmpeg process plumbing -------------------------------------------------

let resolvedBinary: string | null = null

/**
 * The ffmpeg binary, made executable. The traced copy under node_modules can
 * lose its mode bit on the way into a serverless bundle, and that filesystem
 * is read-only, so the fallback is a copy in /tmp with the bit set.
 */
async function ffmpegBinary(): Promise<string> {
  if (resolvedBinary) return resolvedBinary
  const candidate = process.env.FFMPEG_PATH || ffmpegStatic
  if (!candidate) {
    throw new VideoReadError(
      'ffmpeg_missing',
      'Our server could not start its video reader. This is on our side, not your file — try again in a few minutes, and email support if it keeps happening.',
    )
  }
  try {
    await stat(candidate)
  } catch {
    throw new VideoReadError(
      'ffmpeg_missing',
      'Our server could not start its video reader. This is on our side, not your file — try again in a few minutes, and email support if it keeps happening.',
    )
  }
  try {
    await chmod(candidate, 0o755)
    resolvedBinary = candidate
  } catch {
    const copy = path.join(os.tmpdir(), 'learnhoops-ffmpeg')
    try {
      await stat(copy)
    } catch {
      // Copy under a private name and rename into place, so a concurrent cold
      // start never spawns a half-written binary.
      const partial = `${copy}.${process.pid}.${Date.now()}.part`
      await copyFile(candidate, partial)
      await chmod(partial, 0o755)
      await rename(partial, copy)
    }
    await chmod(copy, 0o755).catch(() => undefined)
    resolvedBinary = copy
  }
  return resolvedBinary
}

interface RunResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

/**
 * child_process loaded out of the bundler's sight. Turbopack reads a spawn()
 * of a computed path as "dynamic filesystem access" and responds by tracing
 * the WHOLE project into this function's bundle — 712 files on the first
 * build, every doc and video in the repo. The binary it is worried about is
 * already named explicitly in next.config's outputFileTracingIncludes.
 */
async function childProcess(): Promise<typeof import('node:child_process')> {
  return import(/* turbopackIgnore: true */ /* webpackIgnore: true */ 'node:child_process')
}

async function runFfmpeg(args: string[], timeoutMs: number, signal?: AbortSignal): Promise<RunResult> {
  if (signal?.aborted) throw new AbortedError()
  const bin = await ffmpegBinary()
  const { spawn } = await childProcess()
  return new Promise<RunResult>((resolve, reject) => {
    // Local files only — never a URL, never a pipe. The input is always the
    // copy we downloaded ourselves.
    const child = spawn(bin, ['-hide_banner', '-nostdin', '-protocol_whitelist', 'file', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, Math.max(1000, timeoutMs))
    const onAbort = () => child.kill('SIGKILL')
    signal?.addEventListener('abort', onAbort, { once: true })
    child.stdout.on('data', (chunk: Buffer) => {
      if (stdout.length < STDERR_CAP) stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < STDERR_CAP) stderr += chunk.toString('utf8')
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      if (signal?.aborted) reject(new AbortedError())
      else resolve({ code, stdout, stderr, timedOut })
    })
  })
}

export class AbortedError extends Error {
  constructor() {
    super('Extraction aborted')
    this.name = 'AbortedError'
  }
}

// --- input handling ----------------------------------------------------------

/**
 * The first bytes of every container ffmpeg should see here are binary. A
 * file that starts as plain text is a playlist or a script (HLS "#EXTM3U",
 * "ffconcat", SDP…) — formats whose whole job is to make the demuxer open
 * OTHER files and URLs. Nobody films a jump shot into one of those.
 */
function looksLikeText(head: Buffer): boolean {
  if (head.length === 0) return true
  let printable = 0
  for (const b of head) {
    if ((b >= 0x20 && b < 0x7f) || b === 0x09 || b === 0x0a || b === 0x0d) printable++
  }
  return printable / head.length > 0.97
}

/** Stream the uploaded original to /tmp, bounded in size and time, following no redirects. */
async function downloadToTmp(url: string, dir: string, log: (s: string) => void, signal?: AbortSignal): Promise<{ file: string; bytes: number }> {
  const tooBig = () =>
    new VideoReadError(
      'unreadable',
      'This video is over 450MB, which is too large for our server to read in one go. Trim it to just the shot (a few seconds) and try again.',
    )
  let res: Response
  try {
    res = await fetch(url, {
      redirect: 'error',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)]) : AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    })
  } catch (err) {
    if (signal?.aborted) throw new AbortedError()
    throw new VideoReadError(
      'unreadable',
      `Our server could not fetch the uploaded video (${err instanceof Error ? err.message : 'network error'}). The upload probably did not finish — check your connection and try again.`,
    )
  }
  if (!res.ok || !res.body) {
    throw new VideoReadError(
      'unreadable',
      `The upload could not be read back (HTTP ${res.status}). The upload probably did not finish — check your connection and try again.`,
    )
  }
  const declared = Number(res.headers.get('content-length') || '0')
  if (declared > DOWNLOAD_MAX_BYTES) throw tooBig()

  const dest = path.join(dir, 'input.bin')
  let seen = 0
  let head: Buffer | null = null
  const body = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream)
  body.on('data', (chunk: Buffer) => {
    seen += chunk.length
    if (!head) head = chunk.subarray(0, 512)
    if (seen > DOWNLOAD_MAX_BYTES) body.destroy(tooBig())
  })
  try {
    await pipeline(body, createWriteStream(dest))
  } catch (err) {
    if (err instanceof VideoReadError) throw err
    if (signal?.aborted) throw new AbortedError()
    throw new VideoReadError(
      'unreadable',
      'The download of the uploaded video stopped partway. Check your connection and try again.',
    )
  }
  if (!head || looksLikeText(head)) {
    throw new VideoReadError(
      'unreadable',
      'This file is a text document, not a video (a playlist or a link file, for example). Upload the video clip itself.',
    )
  }
  log(`downloaded ${seen} bytes`)
  return { file: dest, bytes: seen }
}

/** Remove tmp dirs left behind by requests Vercel killed before their cleanup ran. */
async function sweepStaleTmp(): Promise<void> {
  try {
    const tmp = os.tmpdir()
    const now = Date.now()
    for (const name of await readdir(tmp)) {
      if (!name.startsWith('lh-frames-')) continue
      const full = path.join(tmp, name)
      const st = await stat(full).catch(() => null)
      if (st && now - st.mtimeMs > STALE_TMP_MS) await rm(full, { recursive: true, force: true }).catch(() => undefined)
    }
  } catch {}
}

// --- probing -----------------------------------------------------------------

interface ProbeInfo {
  duration: number
  codec: string
  hdr: boolean
}

/**
 * Container and stream facts from `ffmpeg -i`, which exits non-zero (no
 * output file) but prints everything we need. ffprobe is not shipped with
 * ffmpeg-static, and this avoids a second 40MB binary in the bundle.
 */
async function probe(input: string, timeoutMs: number, signal?: AbortSignal): Promise<ProbeInfo> {
  const { stderr, timedOut } = await runFfmpeg(['-i', input], timeoutMs, signal)
  if (timedOut) {
    throw new VideoReadError(
      'timeout',
      'Our server gave up waiting while opening this video — usually a very large file on a slow connection. Try again, or trim the clip to just the shot.',
    )
  }
  if (/Invalid data found when processing input|No such file|Server returned 4\d\d|Server returned 5\d\d|Unrecognized|moov atom not found/i.test(stderr)) {
    throw new VideoReadError(
      'unreadable',
      'This file is not a video we can read — it may be damaged, cut off mid-download, or not actually a video. Re-send the original clip from the phone it was filmed on and try again.',
    )
  }
  // "Stream #0:0[0x1](und): Video: hevc (Main) (hvc1 / 0x31637668), yuv420p(tv, bt709), 1920x1080 ..."
  // Skip cover-art streams (an MP3's embedded JPEG is "Video: mjpeg ... (attached pic)").
  // ffmpeg itself grades streams and picks the highest-resolution one, so
  // do the same when a file carries several (a thumbnail track, say).
  const videoLines = [...stderr.matchAll(/Stream #\d+:\d+[^\n]*?: Video: ([a-z0-9_]+)[^\n]*/gi)]
    .map((m) => {
      const dims = m[0].match(/, (\d{2,5})x(\d{2,5})/)
      return { codec: m[1].toLowerCase(), line: m[0], area: dims ? Number(dims[1]) * Number(dims[2]) : 0 }
    })
    .filter((v) => !/attached pic/i.test(v.line))
    .sort((a, b) => b.area - a.area)
  if (videoLines.length === 0) {
    throw new VideoReadError(
      'no_video',
      'This file has no picture in it — only audio. It was probably exported as a sound file. Upload the video clip of the shot instead.',
    )
  }
  const video = videoLines[0]
  const dur = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
  if (!dur) {
    throw new VideoReadError(
      'unreadable',
      'This video has no length information, which happens when a recording was interrupted or a file transfer stopped early. Re-send the original clip and try again.',
    )
  }
  const duration = Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3])
  if (!(duration > 0.2)) {
    throw new VideoReadError('unreadable', 'This video is under a quarter of a second long — there is no shot to see. Upload a clip that shows the whole shot.')
  }
  if (duration > MAX_DURATION_S) {
    throw new VideoReadError(
      'too_long',
      'This video is over 10 minutes long — that is a whole session, not one shot. Trim it to the single shot (a few seconds) and upload that.',
    )
  }
  return {
    duration,
    codec: video.codec,
    hdr: /smpte2084|arib-std-b67|bt2020/i.test(video.line),
  }
}

// --- filters -----------------------------------------------------------------

/** Scale so the long edge is `edge` px, never upscaling, even dimensions. */
function scaleFilter(edge: number): string {
  return `scale=w='if(gte(iw,ih),min(${edge},iw),-2)':h='if(gte(iw,ih),-2,min(${edge},ih))'`
}

/**
 * HDR (HLG/PQ, the iPhone default since the 12) decoded straight to JPEG comes
 * out grey and washed out. Tone-map to BT.709 first when the build has zscale;
 * callers retry without this chain if the filter is missing.
 */
const TONEMAP =
  'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv'

function videoFilter(edge: number, fps: number | null, hdr: boolean): string {
  const parts: string[] = []
  if (fps) parts.push(`fps=${fps}`)
  // Scale FIRST: tone-mapping runs in float per pixel, and doing it on 4K
  // frames before shrinking them to 320px cost more than the decode itself.
  parts.push(scaleFilter(edge))
  if (hdr) parts.push(TONEMAP)
  parts.push('format=yuvj420p')
  return parts.join(',')
}

// --- survey / decode passes --------------------------------------------------

interface Survey {
  times: number[]
  files: string[]
}

async function listFrames(dir: string, prefix: string): Promise<string[]> {
  const names = (await readdir(dir)).filter((n) => n.startsWith(prefix) && n.endsWith('.jpg')).sort()
  return names.map((n) => path.join(dir, n))
}

function failed(result: RunResult, what: string): never {
  if (result.timedOut) {
    throw new VideoReadError(
      'timeout',
      'Reading this video took too long — it is very long or very high resolution (4K/60) for our server to decode in time. Trim it to just the shot, or record at 1080p, and try again.',
    )
  }
  const tail = result.stderr.trim().split('\n').slice(-3).join(' | ')
  // The ffmpeg tail goes to the server log; the coach gets the plain reason.
  console.warn(`[server-frame-extraction] ${what} failed: ${tail || 'ffmpeg failed'}`)
  throw new VideoReadError(
    'unreadable',
    'Our server could not decode the picture in this video — the file is most likely damaged or was cut off while copying. Re-send the original clip from the phone it was filmed on and try again.',
  )
}

function filterUnavailable(stderr: string): boolean {
  return /No such filter|Error reinitializing filters|Error initializing filter|zscale|tonemap/i.test(stderr)
}

/** One decode of the whole clip at a steady low frame rate. */
async function fullSurvey(
  input: string,
  dir: string,
  info: ProbeInfo,
  timeoutMs: number,
  log: (s: string) => void,
  signal?: AbortSignal,
): Promise<Survey> {
  const fps = Math.min(SURVEY_FPS, Math.max(2, SURVEY_MAX_FRAMES / info.duration))
  // -t and -frames:v bound the work by what the header CLAIMED, so a file
  // whose header understates its length cannot buy itself a longer decode.
  const attempt = (hdr: boolean) =>
    runFfmpeg(
      [
        '-loglevel', 'error', '-y', '-i', input, '-t', (info.duration + 1).toFixed(3),
        '-an', '-sn', '-dn', '-vf', videoFilter(SURVEY_EDGE, fps, hdr), '-q:v', '4',
        '-frames:v', String(SURVEY_MAX_FRAMES + 24),
        '-f', 'image2', path.join(dir, 's-%05d.jpg'),
      ],
      timeoutMs,
      signal,
    )
  let result = await attempt(info.hdr)
  if (result.code !== 0 && info.hdr && filterUnavailable(result.stderr)) {
    log('tonemap unavailable, decoding HDR without it')
    result = await attempt(false)
  }
  if (result.code !== 0) failed(result, 'survey')
  const files = await listFrames(dir, 's-')
  if (files.length === 0) failed(result, 'survey produced no frames')
  // The fps filter emits frame n at t = n / fps.
  return { files, times: files.map((_, i) => i / fps) }
}

/** Long clips: a few dozen keyframe-seek single-frame decodes instead of a full pass. */
async function seekSurvey(
  input: string,
  dir: string,
  info: ProbeInfo,
  timeoutMs: number,
  log: (s: string) => void,
  signal?: AbortSignal,
): Promise<Survey> {
  const times = Array.from({ length: SEEK_SURVEY_FRAMES }, (_, i) =>
    (info.duration / (SEEK_SURVEY_FRAMES + 1)) * (i + 1),
  )
  const files: string[] = []
  const kept: number[] = []
  const per = Math.max(6000, Math.floor(timeoutMs / SEEK_SURVEY_FRAMES))
  let hdr = info.hdr
  // One slow seek (a 4K keyframe interval that happens to be long) must not
  // sink the whole survey; only a run of them means the file is hopeless.
  let timeouts = 0
  const started = Date.now()
  for (let i = 0; i < times.length; i++) {
    if (Date.now() - started > timeoutMs) break
    const out = path.join(dir, `s-${String(i).padStart(5, '0')}.jpg`)
    const run = (useHdr: boolean) =>
      runFfmpeg(
        [
          '-loglevel', 'error', '-y', '-ss', times[i].toFixed(3), '-i', input,
          '-an', '-sn', '-dn', '-frames:v', '1', '-vf', videoFilter(SURVEY_EDGE, null, useHdr), '-q:v', '4', out,
        ],
        per,
        signal,
      )
    let result = await run(hdr)
    if (result.code !== 0 && hdr && filterUnavailable(result.stderr)) {
      log('tonemap unavailable, decoding HDR without it')
      hdr = false
      result = await run(false)
    }
    if (result.code === 0) {
      try {
        await stat(out)
        files.push(out)
        kept.push(times[i])
      } catch {}
    } else if (result.timedOut) {
      timeouts++
      if (timeouts >= 6) failed(result, 'seek survey')
    }
  }
  if (files.length < 4) {
    throw new VideoReadError(
      'unreadable',
      'Our server could only decode a few frames of this long video, so it could not find the shot. Trim it to the single shot and try again.',
    )
  }
  return { files, times: kept }
}

/** Index of the survey frame nearest to t. */
function nearest(times: number[], t: number): number {
  let best = 0
  let gap = Infinity
  for (let i = 0; i < times.length; i++) {
    const g = Math.abs(times[i] - t)
    if (g < gap) {
      gap = g
      best = i
    }
  }
  return best
}

async function jpegAtEdge(file: string, edge: number, quality: number): Promise<Buffer> {
  const img = sharp(file)
  const meta = await img.metadata()
  const w = meta.width ?? edge
  const h = meta.height ?? edge
  const scale = Math.min(1, edge / Math.max(w, h))
  return img
    .resize(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)))
    .jpeg({ quality })
    .toBuffer()
}

async function rgba(buffer: Buffer): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), width: info.width, height: info.height }
}

/** Decode just the shot window at full quality and steady 30fps. */
async function decodeWindow(
  input: string,
  dir: string,
  info: ProbeInfo,
  start: number,
  end: number,
  timeoutMs: number,
  log: (s: string) => void,
  signal?: AbortSignal,
): Promise<Survey> {
  const span = Math.max(0.2, end - start)
  const attempt = (hdr: boolean) =>
    runFfmpeg(
      [
        '-loglevel', 'error', '-y', '-ss', start.toFixed(3), '-i', input,
        '-t', span.toFixed(3), '-an', '-sn', '-dn', '-vf', videoFilter(FINAL_EDGE, FINAL_FPS, hdr), '-q:v', '2',
        '-frames:v', String(Math.ceil(span * FINAL_FPS) + 5),
        '-f', 'image2', path.join(dir, 'f-%04d.jpg'),
      ],
      timeoutMs,
      signal,
    )
  let result = await attempt(info.hdr)
  if (result.code !== 0 && info.hdr && filterUnavailable(result.stderr)) {
    log('tonemap unavailable, decoding HDR without it')
    result = await attempt(false)
  }
  if (result.code !== 0) failed(result, 'shot window')
  const files = await listFrames(dir, 'f-')
  if (files.length === 0) failed(result, 'shot window produced no frames')
  return { files, times: files.map((_, i) => start + i / FINAL_FPS) }
}

// --- budget ------------------------------------------------------------------

function totalBytes(bufs: Buffer[]): number {
  return bufs.reduce((n, b) => n + b.length, 0)
}

async function reencode(frames: Buffer[], quality: number, scale: number): Promise<Buffer[]> {
  const out: Buffer[] = []
  for (const f of frames) {
    const img = sharp(f)
    if (scale < 1) {
      const meta = await img.metadata()
      img.resize(Math.max(1, Math.round((meta.width ?? 1) * scale)))
    }
    out.push(await img.jpeg({ quality: Math.round(quality * 100) }).toBuffer())
  }
  return out
}

/** Same ladder as the client's fitFramesToBudget: quality first, resolution last. */
async function fitToBudget(frames: Buffer[]): Promise<{ frames: Buffer[]; reduced: boolean }> {
  if (totalBytes(frames) <= UPLOAD_BUDGET_BYTES) return { frames, reduced: false }
  const steps = [
    { quality: 0.7, scale: 1, lossy: false },
    { quality: 0.55, scale: 1, lossy: false },
    { quality: 0.5, scale: 0.8, lossy: true },
    { quality: 0.42, scale: 0.65, lossy: true },
    { quality: 0.35, scale: 0.5, lossy: true },
  ]
  let current = frames
  for (const step of steps) {
    current = await reencode(frames, step.quality, step.scale)
    if (totalBytes(current) <= UPLOAD_BUDGET_BYTES) return { frames: current, reduced: step.lossy }
  }
  return { frames: current, reduced: true }
}

/** Whether ffmpeg can be spawned here, and which version — for the route's health check. */
export async function ffmpegHealth(): Promise<{ ok: boolean; ffmpeg: string | null; error: string | null }> {
  try {
    const { stdout, stderr, code } = await runFfmpeg(['-version'], 10_000)
    const m = (stdout + stderr).match(/ffmpeg version (\S+)/)
    if (code !== 0 || !m) {
      return { ok: false, ffmpeg: null, error: `ffmpeg exited ${code}: ${stderr.trim().split('\n')[0] || 'no output'}` }
    }
    return { ok: true, ffmpeg: m[1], error: null }
  } catch (err) {
    return { ok: false, ffmpeg: null, error: err instanceof Error ? err.message : String(err) }
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)
    p.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
  })
}

// --- the pipeline ------------------------------------------------------------

/**
 * Decode `source` (an https URL of the uploaded original, or a local path) and
 * return the graded frame set. Throws VideoReadError with a user-facing
 * message for anything a different file would fix.
 */
export async function extractFramesOnServer(
  source: string,
  opts: ServerExtractOptions = {},
): Promise<ServerExtractResult> {
  const started = Date.now()
  const log = opts.log ?? (() => {})
  const signal = opts.signal
  const deadline = started + (opts.deadlineMs ?? 540_000)
  const left = () => Math.max(5000, deadline - Date.now())
  const checkAbort = () => {
    if (signal?.aborted) throw new AbortedError()
  }

  await sweepStaleTmp()
  const dir = await mkdtemp(path.join(os.tmpdir(), 'lh-frames-'))
  try {
    let input: string
    let bytes = 0
    if (/^https?:\/\//i.test(source)) {
      const dl = await downloadToTmp(source, dir, log, signal)
      input = dl.file
      bytes = dl.bytes
    } else {
      input = source
      bytes = (await stat(source)).size
    }
    const info = await probe(input, Math.min(30_000, left()), signal)
    log(`probe: ${info.codec} ${info.duration.toFixed(2)}s hdr=${info.hdr}`)

    // --- Phase 1: survey + rough region ---------------------------------------
    const surveyMode: 'full' | 'seek' = info.duration <= FULL_DECODE_MAX_S ? 'full' : 'seek'
    const survey =
      surveyMode === 'full'
        ? await fullSurvey(input, dir, info, Math.min(300_000, left() * 0.6), log, signal)
        : await seekSurvey(input, dir, info, Math.min(300_000, left() * 0.6), log, signal)
    checkAbort()
    log(`survey: ${survey.files.length} frames (${surveyMode})`)

    const duration = info.duration
    const roughTimes = Array.from({ length: ROUGH_COUNT }, (_, i) => (duration / (ROUGH_COUNT + 1)) * (i + 1))
    const roughFrames: string[] = []
    for (const t of roughTimes) {
      const buf = await jpegAtEdge(survey.files[nearest(survey.times, t)], ROUGH_EDGE, 60)
      roughFrames.push(buf.toString('base64'))
    }
    let roughCenter = 0.6
    try {
      roughCenter = Math.max(0, Math.min(100, await withTimeout(detectShotRegion(roughFrames), DETECT_TIMEOUT_MS))) / 100
    } catch (err) {
      log(`region detect failed, using default: ${err instanceof Error ? err.message : err}`)
    }

    // --- Phase 2: dense probes, motion, release -------------------------------
    const roughCenterTime = roughCenter * duration
    const halfWindow = Math.max(REGION_MIN_S / 2, duration * REGION_PAD)
    const denseStart = Math.max(0, roughCenterTime - halfWindow)
    const denseEnd = Math.min(duration, roughCenterTime + halfWindow)
    const probeTimes = Array.from(
      { length: PROBE_COUNT },
      (_, i) => denseStart + ((denseEnd - denseStart) / (PROBE_COUNT + 1)) * (i + 1),
    )
    const probeFrames: string[] = []
    const probeMotion: number[] = []
    let columns = emptyMotionColumns(1)
    let prev: Awaited<ReturnType<typeof rgba>> | null = null
    for (const t of probeTimes) {
      const buf = await readFile(survey.files[nearest(survey.times, t)])
      probeFrames.push(buf.toString('base64'))
      const cur = await rgba(buf)
      if (!prev) columns = emptyMotionColumns(cur.width)
      probeMotion.push(prev && prev.width === cur.width && prev.height === cur.height ? diffFrames(prev, cur, columns) : 0)
      prev = cur
    }
    if (probeMotion.length > 1) probeMotion[0] = probeMotion[1]

    checkAbort()
    let releaseTime = roughCenterTime
    try {
      const idx = Math.max(0, Math.min(PROBE_COUNT - 1, await withTimeout(detectShotWindow(probeFrames), DETECT_TIMEOUT_MS)))
      releaseTime = probeTimes[idx]
    } catch (err) {
      log(`window detect failed, using region center: ${err instanceof Error ? err.message : err}`)
    }
    const shotStart = Math.max(0, releaseTime - RELEASE_BEFORE_S)
    const shotEnd = Math.min(duration, releaseTime + RELEASE_AFTER_S)

    // --- Phase 3: full-quality frames from the shot window --------------------
    const window = await decodeWindow(input, dir, info, shotStart, shotEnd, Math.min(120_000, left()), log, signal)
    const wanted = motionWeightedTimes(FRAME_COUNT, shotStart, shotEnd, probeTimes, probeMotion)
    // Nearest decoded frame to each wanted time, never the same frame twice:
    // a duplicate would spend grading tokens on a picture the model has seen.
    const used = new Set<number>()
    const picks: number[] = []
    for (const t of wanted) {
      let i = nearest(window.times, t)
      let step = 0
      while (used.has(i) && step < window.files.length) {
        step++
        const fwd = i + step
        const back = i - step
        if (fwd < window.files.length && !used.has(fwd)) { i = fwd; break }
        if (back >= 0 && !used.has(back)) { i = back; break }
      }
      if (used.has(i)) continue
      used.add(i)
      picks.push(i)
    }
    picks.sort((a, b) => a - b)
    const raw: Buffer[] = []
    for (const i of picks) raw.push(await readFile(window.files[i]))
    if (raw.length === 0) {
      throw new VideoReadError(
        'unreadable',
        'The shot window of this video decoded to nothing — the file is probably damaged near the end. Re-send the original clip and try again.',
      )
    }

    const fitted = await fitToBudget(raw)
    const ms = Date.now() - started
    log(`done: ${fitted.frames.length} frames, ${totalBytes(fitted.frames)} bytes, reduced=${fitted.reduced}, ${ms}ms`)
    return {
      frames: fitted.frames,
      reduced: fitted.reduced,
      info: { codec: info.codec, duration, hdr: info.hdr, surveyMode, bytes, ms },
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

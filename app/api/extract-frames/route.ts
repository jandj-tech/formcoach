import { NextRequest, NextResponse } from 'next/server'
import { del } from '@vercel/blob'
import { resolveUploader, uploaderKey } from '@/lib/upload-guard'
import { rateLimit, rateLimitByIp } from '@/lib/rate-limit'
import { isOurUploadedVideoUrl } from '@/lib/blob-store'
import { AbortedError, extractFramesOnServer, ffmpegHealth, VideoReadError } from '@/lib/server-frame-extraction'

/**
 * Decode an uploaded original with ffmpeg and return the 28 grading frames.
 *
 * The browser calls this only after its own decoder gave up on the file (see
 * lib/frame-extraction-anywhere.ts). It has already pushed the original to
 * OUR Vercel Blob store through /api/upload-video, so the body is just that
 * URL. The frames come back as one binary payload the client turns into
 * Blobs and posts to /api/analyze exactly as if it had extracted them itself
 * — billing, dedup and entitlement checks all stay in that one place.
 *
 * Response body layout (Content-Type application/octet-stream):
 *   "LHFR" | uint32 BE header length | header JSON | frame bytes back to back
 *   header = { count, sizes[], reduced, keepVideo, info }
 */

// ffmpeg time on a 4K HEVC clip is real CPU work; 600s is within Pro's 800s cap.
export const maxDuration = 600

const ROUTE = 'extract-frames'
const MAGIC = Buffer.from('LHFR')

// Originals up to this size stay in the store so the results page can play
// them — the same threshold the single uploader applies to its own storage
// upload. Larger ones only existed to be decoded and are removed right after.
const KEEP_VIDEO_MAX_BYTES = 100 * 1024 * 1024

// Each call is up to minutes of CPU, so the budget is far tighter than the
// detect routes: a coach's 40-clip session is 40 calls spread over the
// minutes it takes to grade them, not 40 at once. Fluid compute packs
// concurrent requests into one instance, so the per-instance gate keeps
// several ffmpegs from fighting over the same vCPU and all timing out.
const PER_CALLER_PER_10MIN = 12
const PER_IP_PER_10MIN = 24
const SITE_WIDE_PER_10MIN = 60
const MAX_INFLIGHT_PER_INSTANCE = 2
let inflight = 0

function busy(retryAfter: number, message: string) {
  return NextResponse.json({ error: 'busy', detail: message }, { status: 429, headers: { 'Retry-After': String(retryAfter) } })
}

/**
 * GET: can this deployment read videos at all? Runs `ffmpeg -version` and
 * answers with the version line, so after a deploy anyone can confirm the
 * binary shipped and is executable on this platform without uploading a clip.
 * Reveals only the ffmpeg version; rate-limited per IP like everything else.
 */
export async function GET(req: NextRequest) {
  const perIp = await rateLimitByIp(req, `${ROUTE}-health`, 10, 60)
  if (!perIp.ok) return busy(perIp.retryAfterSeconds, 'Too many checks')
  const health = await ffmpegHealth()
  return NextResponse.json(health, { status: health.ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  // Cheapest checks first: nothing hits the database for a caller that is
  // already over the per-IP budget.
  const perIp = await rateLimitByIp(req, ROUTE, PER_IP_PER_10MIN, 600)
  if (!perIp.ok) {
    return busy(perIp.retryAfterSeconds, 'Too many videos from this connection at once — wait a few minutes and press Try again. Nothing was charged.')
  }

  const body = (await req.json().catch(() => ({}))) as { videoUrl?: unknown; teamCode?: string | null }

  const uploader = await resolveUploader(req, body.teamCode)
  if (!uploader) {
    return NextResponse.json({ error: 'Login required' }, { status: 401 })
  }

  const videoUrl = typeof body.videoUrl === 'string' ? body.videoUrl.trim() : ''
  if (!videoUrl || !isOurUploadedVideoUrl(videoUrl)) {
    return NextResponse.json({ error: 'videoUrl must be a video uploaded through this site' }, { status: 400 })
  }

  const perCaller = await rateLimit(`${ROUTE}:${uploaderKey(uploader)}`, PER_CALLER_PER_10MIN, 600)
  if (!perCaller.ok) {
    return busy(perCaller.retryAfterSeconds, 'Our server is still reading your earlier videos — wait a few minutes and press Try again. Nothing was charged.')
  }
  const siteWide = await rateLimit(`${ROUTE}:site`, SITE_WIDE_PER_10MIN, 600)
  if (!siteWide.ok) {
    return busy(Math.min(120, siteWide.retryAfterSeconds), 'Our server is busy reading other coaches’ videos right now. Wait a couple of minutes and press Try again. Nothing was charged.')
  }
  if (inflight >= MAX_INFLIGHT_PER_INSTANCE) {
    return busy(20, 'Our server is busy reading other videos right now. Wait a moment and press Try again. Nothing was charged.')
  }

  const tag = `[extract-frames ${uploaderKey(uploader)}]`
  inflight++
  try {
    const result = await extractFramesOnServer(videoUrl, {
      log: (line) => console.log(tag, line),
      deadlineMs: (maxDuration - 30) * 1000,
      signal: req.signal,
    })
    const keepVideo = result.info.bytes <= KEEP_VIDEO_MAX_BYTES
    if (!keepVideo) {
      await del(videoUrl).catch((err) => console.warn(tag, 'could not remove the large original:', err instanceof Error ? err.message : err))
    }
    const header = Buffer.from(
      JSON.stringify({
        count: result.frames.length,
        sizes: result.frames.map((f) => f.length),
        reduced: result.reduced,
        keepVideo,
        info: result.info,
      }),
    )
    const len = Buffer.alloc(4)
    len.writeUInt32BE(header.length, 0)
    const payload = Buffer.concat([MAGIC, len, header, ...result.frames])
    return new NextResponse(new Uint8Array(payload), {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(payload.length),
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    if (err instanceof AbortedError || req.signal.aborted) {
      // The browser went away (cancel, tab closed); nothing to tell anyone.
      await del(videoUrl).catch(() => undefined)
      return new NextResponse(null, { status: 499 })
    }
    if (err instanceof VideoReadError) {
      console.warn(tag, err.code, err.message)
      // The file itself is the problem — a different file would work — so the
      // original is not worth keeping either.
      if (err.code !== 'ffmpeg_missing' && err.code !== 'timeout') {
        await del(videoUrl).catch(() => undefined)
      }
      return NextResponse.json({ error: err.code, detail: err.message }, { status: 422 })
    }
    console.error(tag, 'failed:', err instanceof Error ? `${err.name}: ${err.message}` : String(err))
    return NextResponse.json(
      {
        error: 'extract_failed',
        detail: 'Something went wrong on our server while reading this video. It is not your file — try again in a minute, and email support with the file name if it keeps happening.',
      },
      { status: 500 },
    )
  } finally {
    inflight--
  }
}

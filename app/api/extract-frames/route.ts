import { NextRequest, NextResponse } from 'next/server'
import { resolveUploader, uploaderKey } from '@/lib/upload-guard'
import { rateLimit, rateLimitByIp } from '@/lib/rate-limit'
import { extractFramesOnServer, VideoReadError } from '@/lib/server-frame-extraction'

/**
 * Decode an uploaded original with ffmpeg and return the 28 grading frames.
 *
 * The browser calls this only after its own decoder gave up on the file (see
 * lib/frame-extraction-anywhere.ts). It has already pushed the original to
 * Vercel Blob through /api/upload-video, so the body is just that URL. The
 * frames come back as one binary payload the client turns into Blobs and
 * posts to /api/analyze exactly as if it had extracted them itself — billing,
 * dedup and entitlement checks all stay in that one place.
 *
 * Response body layout (Content-Type application/octet-stream):
 *   "LHFR" | uint32 BE header length | header JSON | frame bytes back to back
 *   header = { count, sizes[], reduced, info }
 */

// ffmpeg time on a 4K HEVC clip is real CPU work; 600s is within Pro's 800s cap.
export const maxDuration = 600

const ROUTE = 'extract-frames'
const MAGIC = Buffer.from('LHFR')

// Only the store we ourselves minted the upload token for. Anything else is
// a stranger asking our server to fetch an arbitrary URL.
function isOurBlobUrl(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  return /(^|\.)public\.blob\.vercel-storage\.com$/i.test(url.hostname)
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { videoUrl?: unknown; teamCode?: string | null }

  const uploader = await resolveUploader(req, body.teamCode)
  if (!uploader) {
    return NextResponse.json({ error: 'Login required' }, { status: 401 })
  }

  const videoUrl = typeof body.videoUrl === 'string' ? body.videoUrl.trim() : ''
  if (!videoUrl || !isOurBlobUrl(videoUrl)) {
    return NextResponse.json({ error: 'videoUrl must be an uploaded video' }, { status: 400 })
  }

  // Tighter than the detect routes: each call is up to minutes of CPU.
  const perCaller = await rateLimit(`${ROUTE}:${uploaderKey(uploader)}`, 30, 600)
  if (!perCaller.ok) {
    return NextResponse.json(
      { error: 'Too many videos at once — wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(perCaller.retryAfterSeconds) } },
    )
  }
  const perIp = await rateLimitByIp(req, ROUTE, 60, 600)
  if (!perIp.ok) {
    return NextResponse.json(
      { error: 'Too many videos at once — wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(perIp.retryAfterSeconds) } },
    )
  }

  const tag = `[extract-frames ${uploaderKey(uploader)}]`
  try {
    const result = await extractFramesOnServer(videoUrl, {
      log: (line) => console.log(tag, line),
      deadlineMs: (maxDuration - 30) * 1000,
    })
    const header = Buffer.from(
      JSON.stringify({
        count: result.frames.length,
        sizes: result.frames.map((f) => f.length),
        reduced: result.reduced,
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
    if (err instanceof VideoReadError) {
      console.warn(tag, err.code, err.message)
      // 422: the file itself is the problem; a different file would work.
      return NextResponse.json({ error: err.code, detail: err.message }, { status: 422 })
    }
    console.error(tag, 'failed:', err)
    return NextResponse.json(
      { error: 'extract_failed', detail: 'Something went wrong reading this video. Please try again.' },
      { status: 500 },
    )
  }
}

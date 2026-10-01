import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextRequest, NextResponse } from 'next/server'
import { resolveUploader, uploaderKey } from '@/lib/upload-guard'
import { rateLimit, rateLimitByIp } from '@/lib/rate-limit'
import { storageDriver, putObject } from '@/lib/storage'
import { VIDEO_EXTENSIONS } from '@/lib/video-files'

// Video upload handler, one flow per storage backend (STORAGE_DRIVER):
//   - 'vercel': Vercel Blob's handleUpload mints a browser write token so the
//     browser uploads straight to Blob (bypassing the 4.5MB serverless limit).
//   - 's3'    : the browser POSTs the file HERE and we stream it to Cloudflare
//     R2 server-side. The app runs on a normal Node host (not serverless), so
//     there's no small-body limit to bypass, and going through the server means
//     the private R2 bucket needs no CORS config and no presigned URLs.
// Both authenticate the caller first — this endpoint writes to storage, so it
// must not accept anonymous writes.

export const maxDuration = 300

const ROUTE = 'upload-video'

// Any video container we can decode (see lib/video-files.ts). The server-side
// extractor reads the bytes with ffmpeg, so the extension is only a sanity
// gate on what lands in the store, not a promise the browser can play it.
const ALLOWED_EXTENSIONS: readonly string[] = VIDEO_EXTENSIONS
// Browsers report the type they know; Windows sends '' (which the Blob client
// turns into application/octet-stream) for .mkv, .wmv, .mts and friends.
const ALLOWED_CONTENT_TYPES = ['video/*', 'application/octet-stream']
const MAX_BYTES = 200 * 1024 * 1024
// A clip the browser could not decode is uploaded whole so ffmpeg can read it;
// the single uploader already accepts originals up to 1GB (ProRes runs ~90MB a
// second), so the ceiling matches rather than refusing them again here.
const SERVER_EXTRACT_MAX_BYTES = 1024 * 1024 * 1024

// Shared gate for both backends. Throws with a user-facing message on failure.
async function authorizeUpload(
  request: NextRequest,
  pathname: string,
  teamCode: string | null,
): Promise<void> {
  const uploader = await resolveUploader(request, teamCode)
  if (!uploader) {
    throw new Error('Login required to upload a video')
  }

  const perCaller = await rateLimit(`${ROUTE}:${uploaderKey(uploader)}`, 40, 3600)
  if (!perCaller.ok) throw new Error('Too many uploads — try again later')
  const perIp = await rateLimitByIp(request, ROUTE, 80, 3600)
  if (!perIp.ok) throw new Error('Too many uploads — try again later')

  // application/octet-stream stays allowed because iOS Safari / some Android
  // pickers send it for ordinary .mov/.mp4 files, so the extension is the real
  // filter on what lands in the store.
  const ext = pathname.split('.').pop()?.toLowerCase() ?? ''
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error('Only video files can be uploaded')
  }
}

interface ClientPayload {
  teamCode: string | null
  /** 'server-extract': the browser could not decode this file; ffmpeg will. */
  purpose: 'store' | 'server-extract'
}

function parseClientPayload(clientPayload: string | null): ClientPayload {
  const none: ClientPayload = { teamCode: null, purpose: 'store' }
  if (!clientPayload) return none
  try {
    const parsed = JSON.parse(clientPayload) as { teamCode?: string; purpose?: string }
    return {
      teamCode: parsed.teamCode ?? null,
      purpose: parsed.purpose === 'server-extract' ? 'server-extract' : 'store',
    }
  } catch {
    return none
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // --- Cloudflare R2 (upload through the server) -----------------------------
  // Only for the raw-body POST the single uploader sends. The Blob client
  // (@vercel/blob/client upload()) posts JSON token requests here too, and
  // those always take the handleUpload branch below — on Vercel this route can
  // only accept 4.5MB, so a clip the browser could not decode must travel
  // browser → Blob directly, whichever store the rest of the app uses.
  if (storageDriver() === 's3' && request.headers.get('x-upload-pathname')) {
    try {
      const pathname = (request.headers.get('x-upload-pathname') || '').trim()
      const teamCode = (request.headers.get('x-team-code') || '').trim() || null
      const contentType = request.headers.get('content-type') || 'application/octet-stream'
      if (!pathname) throw new Error('Missing upload path')

      await authorizeUpload(request, pathname, teamCode)

      // Reject oversize uploads BEFORE reading the body. request.arrayBuffer()
      // materializes the entire ≤200MB payload in RAM, so a few concurrent big
      // (or deliberately oversize) uploads could OOM the process; the old
      // buffer.length check ran too late to prevent that. Content-Length can be
      // absent or spoofed, so the post-buffer check below stays as backstop.
      const declaredLength = Number(request.headers.get('content-length') || '0')
      if (declaredLength > MAX_BYTES) throw new Error('Video is too large')

      const buffer = Buffer.from(await request.arrayBuffer())
      if (buffer.length === 0) throw new Error('Empty upload')
      if (buffer.length > MAX_BYTES) throw new Error('Video is too large')

      const key = pathname.replace(/^\/+/, '')
      const { url } = await putObject(key, buffer, { contentType })
      return NextResponse.json({ url })
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Upload failed'
      console.error('[upload-video] s3 upload error:', msg)
      return NextResponse.json({ error: msg }, { status: 400 })
    }
  }

  // --- Vercel Blob (handleUpload) --------------------------------------------
  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const payload = parseClientPayload(clientPayload)
        await authorizeUpload(request, pathname, payload.teamCode)
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: payload.purpose === 'server-extract' ? SERVER_EXTRACT_MAX_BYTES : MAX_BYTES,
        }
      },
      onUploadCompleted: async () => {
        // No-op: the URL is captured by the client after upload and posted
        // to /api/analyze along with the extracted frames.
      },
    })
    return NextResponse.json(jsonResponse)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Upload failed'
    console.error('[upload-video] handleUpload error:', msg, error)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

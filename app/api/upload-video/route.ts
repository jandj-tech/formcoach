import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextRequest, NextResponse } from 'next/server'
import { resolveUploader, uploaderKey } from '@/lib/upload-guard'
import { rateLimit, rateLimitByIp } from '@/lib/rate-limit'

// Direct browser → Vercel Blob upload handler. Bypasses the 4.5MB serverless
// body-size limit so users can upload videos up to 200MB without proxying
// through our route.
//
// onBeforeGenerateToken mints a Blob *write* token, so it must authenticate the
// caller. It previously authenticated nobody: anyone on the internet could ask
// for a token and push unlimited 200MB objects into the store. The client sends
// its team code (when the uploader is in team mode) as clientPayload so an
// anonymous team upload still works.

const ROUTE = 'upload-video'

const ALLOWED_EXTENSIONS = ['mp4', 'mov', 'avi', 'webm', 'mkv', 'm4v']

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let teamCode: string | null = null
        if (clientPayload) {
          try {
            teamCode = (JSON.parse(clientPayload) as { teamCode?: string }).teamCode ?? null
          } catch {
            teamCode = null
          }
        }

        const uploader = await resolveUploader(request, teamCode)
        if (!uploader) {
          throw new Error('Login required to upload a video')
        }

        // Storage costs money and a write token is reusable for the life of the
        // upload, so cap how many a caller can mint.
        const perCaller = await rateLimit(`${ROUTE}:${uploaderKey(uploader)}`, 40, 3600)
        if (!perCaller.ok) throw new Error('Too many uploads — try again later')
        const perIp = await rateLimitByIp(request, ROUTE, 80, 3600)
        if (!perIp.ok) throw new Error('Too many uploads — try again later')

        // The content-type list has to keep application/octet-stream because
        // iOS Safari and some Android pickers send it for ordinary .mov/.mp4
        // files. That makes the extension the only real filter on what lands in
        // the store, so enforce it here rather than trusting the declared type.
        const ext = pathname.split('.').pop()?.toLowerCase() ?? ''
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
          throw new Error('Only video files can be uploaded')
        }

        return {
          allowedContentTypes: [
            'video/mp4',
            'video/quicktime',
            'video/x-msvideo',
            'video/webm',
            'video/x-matroska',
            'application/octet-stream',
          ],
          maximumSizeInBytes: 200 * 1024 * 1024,
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

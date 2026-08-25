import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextRequest, NextResponse } from 'next/server'
import { resolveUploader, uploaderKey } from '@/lib/upload-guard'
import { rateLimit, rateLimitByIp } from '@/lib/rate-limit'
import { storageDriver, s3Bucket, s3PublicBase } from '@/lib/storage'

// Direct browser → object-storage upload handler. Bypasses the 4.5MB
// serverless body-size limit so users can upload videos up to 200MB without
// proxying through our route.
//
// Two backends, chosen by STORAGE_DRIVER (see lib/storage.ts):
//   - 'vercel': Vercel Blob's handleUpload mints a short-lived write token.
//   - 's3'    : we mint a presigned PUT URL for Cloudflare R2.
// Both authenticate the caller first — this endpoint hands out write access, so
// it previously authenticated nobody and anyone could push unlimited objects.
// The client sends its team code (when in team mode) as the payload so an
// anonymous team upload still works.

const ROUTE = 'upload-video'

const ALLOWED_EXTENSIONS = ['mp4', 'mov', 'avi', 'webm', 'mkv', 'm4v']
const ALLOWED_CONTENT_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/webm',
  'video/x-matroska',
  'application/octet-stream',
]
const MAX_BYTES = 200 * 1024 * 1024

// Shared gate for both backends. Throws with a user-facing message on any
// failure; returns nothing on success.
async function authorizeUpload(
  request: NextRequest,
  pathname: string,
  teamCode: string | null,
): Promise<void> {
  const uploader = await resolveUploader(request, teamCode)
  if (!uploader) {
    throw new Error('Login required to upload a video')
  }

  // Storage costs money and a write grant is reusable for the life of the
  // upload, so cap how many a caller can mint.
  const perCaller = await rateLimit(`${ROUTE}:${uploaderKey(uploader)}`, 40, 3600)
  if (!perCaller.ok) throw new Error('Too many uploads — try again later')
  const perIp = await rateLimitByIp(request, ROUTE, 80, 3600)
  if (!perIp.ok) throw new Error('Too many uploads — try again later')

  // The content-type list keeps application/octet-stream because iOS Safari and
  // some Android pickers send it for ordinary .mov/.mp4 files. That makes the
  // extension the only real filter on what lands in the store, so enforce it
  // here rather than trusting the declared type.
  const ext = pathname.split('.').pop()?.toLowerCase() ?? ''
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error('Only video files can be uploaded')
  }
}

function parseTeamCode(clientPayload: string | null): string | null {
  if (!clientPayload) return null
  try {
    return (JSON.parse(clientPayload) as { teamCode?: string }).teamCode ?? null
  } catch {
    return null
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // --- Cloudflare R2 (presigned PUT) -----------------------------------------
  if (storageDriver() === 's3') {
    try {
      const { pathname, contentType, clientPayload } = (await request.json()) as {
        pathname?: string
        contentType?: string
        clientPayload?: string | null
      }
      if (!pathname) throw new Error('Missing upload path')

      await authorizeUpload(request, pathname, parseTeamCode(clientPayload ?? null))

      const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3')
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner')
      const s3 = new S3Client({
        region: 'auto',
        endpoint: process.env.S3_ENDPOINT!,
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID!,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
        },
      })

      const key = pathname.replace(/^\/+/, '')
      const uploadUrl = await getSignedUrl(
        s3,
        new PutObjectCommand({
          Bucket: s3Bucket(),
          Key: key,
          ContentType: contentType || undefined,
        }),
        { expiresIn: 600 },
      )

      // publicUrl is what the client posts to /api/analyze and we store; it
      // resolves through the /api/media proxy (bucket stays private).
      return NextResponse.json({
        driver: 's3',
        uploadUrl,
        publicUrl: `${s3PublicBase()}/${key}`,
        maxBytes: MAX_BYTES,
        allowedContentTypes: ALLOWED_CONTENT_TYPES,
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Upload failed'
      console.error('[upload-video] s3 presign error:', msg)
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
        await authorizeUpload(request, pathname, parseTeamCode(clientPayload))
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_BYTES,
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

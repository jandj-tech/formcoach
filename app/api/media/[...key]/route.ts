import { NextRequest, NextResponse } from 'next/server'
import { s3Bucket, storageDriver } from '@/lib/storage'

// Public read-proxy for the private R2 bucket (STORAGE_DRIVER=s3).
//
// The bucket has no public access; uploaded frames and videos are served back
// through here so nothing needs a public bucket URL or a custom CDN domain.
// putObject() stores each object's URL as `${S3_PUBLIC_BASE_URL}/<key>`, and
// S3_PUBLIC_BASE_URL points at this route, so a stored URL like
// `https://www.learnhoops.com/api/media/frames/42/frame-0.jpg` lands here with
// key = ["frames","42","frame-0.jpg"].
//
// Read is intentionally unauthenticated: results pages (incl. shared/token
// links) show frames to signed-out viewers, matching the previous public-Blob
// behaviour. Keys are the only guard, exactly as before.

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> },
) {
  if (storageDriver() !== 's3') {
    // Only meaningful under the s3 driver; on Vercel Blob the stored URLs point
    // straight at Blob and never reach this route.
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { key: segments } = await params
  const Key = (segments ?? []).map((s) => decodeURIComponent(s)).join('/')
  if (!Key) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3')
  const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.S3_ENDPOINT!,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
  })

  const range = req.headers.get('range') || undefined

  try {
    const obj = await s3.send(
      new GetObjectCommand({ Bucket: s3Bucket(), Key, Range: range }),
    )

    if (!obj.Body) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // AWS SDK v3 stream → web ReadableStream for the Response body.
    const body = (
      obj.Body as { transformToWebStream: () => ReadableStream }
    ).transformToWebStream()

    const headers = new Headers()
    if (obj.ContentType) headers.set('Content-Type', obj.ContentType)
    if (obj.ContentLength != null)
      headers.set('Content-Length', String(obj.ContentLength))
    headers.set('Accept-Ranges', 'bytes')
    // Objects are immutable (unique keys), so allow long caching.
    headers.set('Cache-Control', 'public, max-age=31536000, immutable')
    if (obj.ContentRange) headers.set('Content-Range', obj.ContentRange)

    // 206 when the store honoured a Range request, else 200.
    const status = range && obj.ContentRange ? 206 : 200
    return new NextResponse(body, { status, headers })
  } catch (err) {
    const name = (err as { name?: string })?.name
    if (name === 'NoSuchKey' || name === 'NotFound') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    console.error('[media] fetch failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Media unavailable' }, { status: 502 })
  }
}

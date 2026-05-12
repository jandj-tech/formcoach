import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextResponse } from 'next/server'

// Direct browser → Vercel Blob upload handler. Bypasses the 4.5MB serverless
// body-size limit so users can upload videos up to 200MB without proxying
// through our route.

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
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

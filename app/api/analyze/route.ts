import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { db } from '@/lib/db'
import { analyzeShot } from '@/lib/analyze'
import crypto from 'crypto'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const files = formData.getAll('frames') as File[]
    const videoUrl = (formData.get('videoUrl') as string | null) || null
    console.log('[analyze] received videoUrl:', videoUrl ? 'YES' : 'NO', 'frames:', files.length)

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No frames provided' }, { status: 400 })
    }

    // Create submission record
    const submissionToken = crypto.randomBytes(32).toString('hex')
    const [submission] = await db`
      INSERT INTO submissions (token, status)
      VALUES (${submissionToken}, 'processing')
      RETURNING id
    `

    // Upload frames to Vercel Blob + convert to base64 for Claude
    const frameBase64Array: string[] = []
    const frameMimeTypes: string[] = []
    const frameUrls: string[] = []

    const hasBlobToken = !!process.env.BLOB_READ_WRITE_TOKEN

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const buffer = Buffer.from(await file.arrayBuffer())
      const base64 = buffer.toString('base64')
      frameBase64Array.push(base64)
      frameMimeTypes.push(file.type || 'image/jpeg')

      if (hasBlobToken) {
        const blob = await put(`frames/${submission.id}/frame-${i}.jpg`, buffer, {
          access: 'public',
          contentType: file.type || 'image/jpeg',
        })
        frameUrls.push(blob.url)
      }
    }

    // Run Claude Vision analysis
    const result = await analyzeShot(frameBase64Array, frameMimeTypes)

    // Store analysis — try with video_url, fall back to the legacy column set
    // if the migration adding video_url hasn't been applied yet.
    let analysis: { id: number }
    try {
      ;[analysis] = (await db`
        INSERT INTO analyses (submission_id, overall_score, frame_urls, video_url)
        VALUES (${submission.id}, ${result.overall_score}, ${frameUrls}, ${videoUrl})
        RETURNING id
      `) as unknown as [{ id: number }]
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!/column.*video_url.*does not exist/i.test(msg)) throw err
      console.warn('analyses.video_url column missing — run `npm run migrate`. Inserting without video URL.')
      ;[analysis] = (await db`
        INSERT INTO analyses (submission_id, overall_score, frame_urls)
        VALUES (${submission.id}, ${result.overall_score}, ${frameUrls})
        RETURNING id
      `) as unknown as [{ id: number }]
    }

    // Store per-criterion scores
    for (const criterion of result.criteria) {
      await db`
        INSERT INTO criterion_scores (analysis_id, criterion_id, ai_score, ai_reasoning)
        VALUES (${analysis.id}, ${criterion.id}, ${criterion.score}, ${criterion.reasoning})
      `
    }

    // Mark submission as complete
    await db`
      UPDATE submissions SET status = 'complete' WHERE id = ${submission.id}
    `

    return NextResponse.json({
      submissionId: submission.id,
      analysisId: analysis.id,
    })
  } catch (err) {
    console.error('Analysis error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Analysis failed', detail: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

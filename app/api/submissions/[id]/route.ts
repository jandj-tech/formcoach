import { NextRequest, NextResponse } from 'next/server'
import { del } from '@vercel/blob'
import { db } from '@/lib/db'
import { getSessionFromRequest } from '@/lib/auth'

// Lets a signed-in user delete one of their own submissions from their history.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Only allow deleting a submission that belongs to this account —
  // linked either by user_id or by the account email.
  const [submission] = (await db`
    SELECT id FROM submissions
    WHERE id = ${id} AND (user_id = ${session.userId} OR email = ${session.email})
  `) as unknown as [{ id: string } | undefined]

  if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Collect blob URLs (frames + video) before dropping the rows.
  const analyses = (await db`
    SELECT * FROM analyses WHERE submission_id = ${id}
  `) as unknown as Array<Record<string, unknown>>

  const blobUrls: string[] = []
  for (const a of analyses) {
    if (typeof a.video_url === 'string' && a.video_url) blobUrls.push(a.video_url)
    if (Array.isArray(a.frame_urls)) {
      for (const u of a.frame_urls as unknown[]) {
        if (typeof u === 'string' && u) blobUrls.push(u)
      }
    }
  }

  // Delete DB rows in FK-safe order: criterion_scores → analyses → submissions.
  const analysisIds = analyses.map((a) => a.id as number)
  if (analysisIds.length > 0) {
    await db`DELETE FROM criterion_scores WHERE analysis_id = ANY(${analysisIds})`
  }
  await db`DELETE FROM analyses WHERE submission_id = ${id}`
  await db`DELETE FROM submissions WHERE id = ${id}`

  // Best-effort blob cleanup — don't fail the request if storage is unreachable.
  if (blobUrls.length > 0) {
    try {
      await del(blobUrls)
    } catch (err) {
      console.warn('Blob cleanup failed:', err instanceof Error ? err.message : err)
    }
  }

  return NextResponse.json({ deleted: true })
}

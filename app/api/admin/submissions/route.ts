import { NextResponse } from 'next/server'
import { del } from '@vercel/blob'
import { db } from '@/lib/db'
import { cookies } from 'next/headers'

async function isAdmin() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_auth')?.value === process.env.ADMIN_PASSWORD
}

export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const submissions = await db`
    SELECT s.id, s.email, s.status, s.created_at,
           a.id as analysis_id, a.overall_score, a.frame_urls
    FROM submissions s
    LEFT JOIN analyses a ON a.submission_id = s.id
    ORDER BY s.created_at DESC
    LIMIT 100
  `
  return NextResponse.json(submissions)
}

export async function DELETE(req: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { ids?: string[]; all?: boolean }

  // Resolve the set of submission IDs we're going to delete
  let targetIds: string[]
  if (body.all === true) {
    const rows = (await db`SELECT id FROM submissions`) as unknown as { id: string }[]
    targetIds = rows.map((r) => r.id)
  } else if (Array.isArray(body.ids) && body.ids.length > 0) {
    targetIds = body.ids
  } else {
    return NextResponse.json({ error: 'Provide ids[] or all=true' }, { status: 400 })
  }

  if (targetIds.length === 0) {
    return NextResponse.json({ deleted: 0 })
  }

  // Collect all blob URLs (video + frames) attached to these submissions
  // before we drop the DB rows, so we can clean up Vercel Blob storage.
  const analyses = (await db`
    SELECT * FROM analyses WHERE submission_id = ANY(${targetIds})
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

  // Delete DB rows in FK-safe order: criterion_scores → analyses → submissions
  const analysisIds = analyses.map((a) => a.id as number)
  if (analysisIds.length > 0) {
    await db`DELETE FROM criterion_scores WHERE analysis_id = ANY(${analysisIds})`
  }
  await db`DELETE FROM analyses WHERE submission_id = ANY(${targetIds})`
  await db`DELETE FROM submissions WHERE id = ANY(${targetIds})`

  // Best-effort blob cleanup. Don't fail the whole request if Blob is unreachable
  // or a particular URL was already gone — DB state is already consistent.
  if (blobUrls.length > 0) {
    try {
      await del(blobUrls)
    } catch (err) {
      console.warn('Blob cleanup partially failed:', err instanceof Error ? err.message : err)
    }
  }

  return NextResponse.json({ deleted: targetIds.length, blobsDeleted: blobUrls.length })
}

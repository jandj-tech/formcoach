import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { db } from '@/lib/db'

// The iOS app's Home feed: the player's own completed analyses, newest first.
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Login required' }, { status: 401 })

  try {
    const rows = (await db`
      SELECT s.token, s.created_at, a.overall_score, a.frame_urls
      FROM submissions s
      JOIN analyses a ON a.submission_id = s.id
      WHERE (s.user_id = ${session.userId} OR s.email = ${session.email})
        AND s.status = 'complete'
      ORDER BY s.created_at DESC
      LIMIT 50
    `) as unknown as Array<{
      token: string
      created_at: string
      overall_score: number | string | null
      frame_urls: string[] | null
    }>

    const submissions = rows.map(r => {
      const frames = Array.isArray(r.frame_urls) ? r.frame_urls : []
      return {
        token: r.token,
        createdAt: r.created_at,
        overallScore: r.overall_score === null ? null : Number(r.overall_score),
        // Middle frame is usually near the release — the best thumbnail.
        thumbnail: frames.length > 0 ? frames[Math.floor(frames.length / 2)] : null,
      }
    })

    return NextResponse.json({ submissions })
  } catch (err) {
    console.error('[my/submissions] query failed:', err)
    return NextResponse.json({ error: 'Could not load your shots' }, { status: 500 })
  }
}

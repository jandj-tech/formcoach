import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionFromRequest } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const submissions = (await db`
    SELECT s.id, s.created_at, s.token, s.status, a.overall_score
    FROM submissions s
    LEFT JOIN analyses a ON a.submission_id = s.id
    WHERE s.user_id = ${session.userId} OR s.email = ${session.email}
    ORDER BY s.created_at DESC
    LIMIT 100
  `) as unknown as Array<{
    id: string
    created_at: string
    token: string
    status: string
    overall_score: string | number | null
  }>

  return NextResponse.json({
    submissions: submissions.map((s) => ({
      id: s.id,
      token: s.token,
      created_at: s.created_at,
      status: s.status,
      overall_score: s.overall_score !== null ? Number(s.overall_score) : null,
    })),
  })
}

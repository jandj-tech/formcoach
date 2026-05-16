import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  await db`
    UPDATE users
    SET analysis_tokens = COALESCE(analysis_tokens, 0) + 1
    WHERE id = ${session.userId}
  `

  return NextResponse.json({ success: true })
}

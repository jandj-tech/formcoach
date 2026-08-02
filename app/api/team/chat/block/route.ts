import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { db } from '@/lib/db'

// Block/unblock a user: the blocker stops seeing their chat messages
// everywhere (App Store guideline 1.2 requires user-level blocking).
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Login required' }, { status: 401 })

  const p = await req.json().catch(() => ({})) as { userId?: string; unblock?: boolean }
  if (!p.userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })
  if (p.userId === session.userId) return NextResponse.json({ error: 'Cannot block yourself' }, { status: 400 })

  try {
    if (p.unblock) {
      await db`DELETE FROM user_blocks WHERE blocker_user_id = ${session.userId} AND blocked_user_id = ${p.userId}`
    } else {
      await db`
        INSERT INTO user_blocks (blocker_user_id, blocked_user_id)
        VALUES (${session.userId}, ${p.userId})
        ON CONFLICT DO NOTHING
      `
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[team/chat/block] failed:', err)
    return NextResponse.json({ error: 'Could not update block' }, { status: 500 })
  }
}

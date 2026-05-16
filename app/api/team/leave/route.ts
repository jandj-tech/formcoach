import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { db } from '@/lib/db'

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req)
    if (!session) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 })
    }

    await db`
      DELETE FROM team_memberships WHERE user_id = ${session.userId}
    `

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Team leave error:', err)
    return NextResponse.json({ error: 'Failed to leave team' }, { status: 500 })
  }
}

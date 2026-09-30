import { NextRequest, NextResponse } from 'next/server'
import { currentUserPasswordHash, getSessionFromRequest, signSession } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const token = await signSession(
    { userId: session.userId, email: session.email },
    await currentUserPasswordHash(session.userId),
  )
  return NextResponse.json({ token })
}

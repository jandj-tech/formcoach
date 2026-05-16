import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionFromRequest } from '@/lib/auth'

// Lets a signed-in user set or clear their display nickname.
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { nickname?: string }
  const nickname = body.nickname?.trim().slice(0, 50) || null

  try {
    await db`UPDATE users SET nickname = ${nickname} WHERE id = ${session.userId}`
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/column .* does not exist/i.test(msg)) {
      return NextResponse.json(
        { error: 'Nicknames are not enabled yet — the database migration needs to be run.' },
        { status: 500 },
      )
    }
    throw err
  }

  return NextResponse.json({ nickname })
}

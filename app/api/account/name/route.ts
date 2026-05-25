import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionFromRequest } from '@/lib/auth'

// Sets the user's canonical display name (first name + last initial) and
// mirrors it onto every team membership and class enrollment they have, so
// coaches and certificates see the same name everywhere.
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as {
    firstName?: string
    lastInitial?: string
  }
  const rawFirst = body.firstName?.trim().slice(0, 100) ?? ''
  const firstName = rawFirst ? rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1) : ''
  const lastInitial = body.lastInitial?.trim().charAt(0).toUpperCase() ?? ''

  if (!firstName) return NextResponse.json({ error: 'First name is required' }, { status: 400 })
  if (!lastInitial) return NextResponse.json({ error: 'Last initial is required' }, { status: 400 })

  try {
    await db`
      UPDATE users
      SET first_name = ${firstName}, last_initial = ${lastInitial}
      WHERE id = ${session.userId}
    `
    await db`
      UPDATE team_memberships
      SET first_name = ${firstName}, last_name_initial = ${lastInitial}
      WHERE user_id = ${session.userId}
    `
    await db`
      UPDATE org_class_enrollments
      SET first_name = ${firstName}, last_name_initial = ${lastInitial}
      WHERE user_id = ${session.userId}
    `
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/column .* does not exist/i.test(msg)) {
      return NextResponse.json(
        { error: 'Display names are not enabled yet — the database migration needs to be run.' },
        { status: 500 },
      )
    }
    console.error('[account/name] save failed:', err)
    return NextResponse.json({ error: 'Could not save your name' }, { status: 500 })
  }

  return NextResponse.json({ firstName, lastInitial })
}

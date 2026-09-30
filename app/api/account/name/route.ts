import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionFromRequest } from '@/lib/auth'
import { cleanOptionalDisplayText, capitalizeFirst, lastInitialFromText } from '@/lib/moderation'

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
  const first = cleanOptionalDisplayText(body.firstName, 100)
  if (!first.ok) return NextResponse.json({ error: first.error }, { status: 400 })
  const last = cleanOptionalDisplayText(body.lastInitial, 100)
  if (!last.ok) return NextResponse.json({ error: last.error }, { status: 400 })
  const firstName = first.value ? capitalizeFirst(first.value) : ''

  if (!firstName) return NextResponse.json({ error: 'First name is required' }, { status: 400 })
  if (!last.value) return NextResponse.json({ error: 'Last initial is required' }, { status: 400 })
  // One letter, one character: "ß" must not become "SS" in a CHAR(1) column.
  const initial = lastInitialFromText(last.value)
  if (!initial.ok) return NextResponse.json({ error: initial.error }, { status: 400 })
  const lastInitial = initial.value

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

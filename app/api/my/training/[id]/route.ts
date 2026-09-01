import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { db } from '@/lib/db'
import { parseTrainingInput } from '@/lib/training'

/**
 * Edit or delete one of the caller's OWN training entries. Ownership is
 * enforced in the WHERE clause of the write itself — not a prior read — so
 * there is no window in which another user's row id could slip through.
 */

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Login required' }, { status: 401 })
  }
  const { id } = await params
  try {
    const parsed = parseTrainingInput(await req.json())
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    const { input } = parsed
    const rows = (await db`
      UPDATE training_activities
      SET activity_type = ${input.activityType},
          duration_minutes = ${input.durationMinutes},
          activity_date = ${input.activityDate},
          note = ${input.note},
          updated_at = NOW()
      WHERE id = ${id} AND user_id = ${session.userId}
      RETURNING id
    `) as unknown as unknown[]
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[my/training] update failed:', err)
    return NextResponse.json({ error: 'Could not update that entry' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Login required' }, { status: 401 })
  }
  const { id } = await params
  try {
    const rows = (await db`
      DELETE FROM training_activities
      WHERE id = ${id} AND user_id = ${session.userId}
      RETURNING id
    `) as unknown as unknown[]
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[my/training] delete failed:', err)
    return NextResponse.json({ error: 'Could not delete that entry' }, { status: 500 })
  }
}

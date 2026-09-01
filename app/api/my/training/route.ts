import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { db } from '@/lib/db'
import { parseTrainingInput } from '@/lib/training'

/**
 * The manual training log: how much time a player spent on shooting/form work
 * vs. other basketball activity. Deliberately simple — this feeds the
 * consistency dashboard, it is not a workout tracker. Validation lives in
 * lib/training.ts, shared with the [id] edit route.
 */

/** The caller's recent entries, newest first. */
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Login required' }, { status: 401 })
  }
  try {
    const rows = (await db`
      SELECT id, activity_type, duration_minutes, activity_date::text AS activity_date,
             note, created_at
      FROM training_activities
      WHERE user_id = ${session.userId}
      ORDER BY activity_date DESC, created_at DESC
      LIMIT 50
    `) as unknown as Array<{
      id: string
      activity_type: string
      duration_minutes: number
      activity_date: string
      note: string | null
      created_at: string | Date
    }>
    return NextResponse.json({
      activities: rows.map((r) => ({
        id: r.id,
        activityType: r.activity_type,
        durationMinutes: r.duration_minutes,
        activityDate: r.activity_date,
        note: r.note,
        createdAt: new Date(r.created_at).toISOString(),
      })),
    })
  } catch (err) {
    console.error('[my/training] list failed:', err)
    return NextResponse.json({ error: 'Could not load your training log' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Login required' }, { status: 401 })
  }
  try {
    const parsed = parseTrainingInput(await req.json())
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    const { input } = parsed
    const [row] = (await db`
      INSERT INTO training_activities (user_id, activity_type, duration_minutes, activity_date, note)
      VALUES (${session.userId}, ${input.activityType}, ${input.durationMinutes}, ${input.activityDate}, ${input.note})
      RETURNING id, created_at
    `) as unknown as [{ id: string; created_at: string | Date }]
    return NextResponse.json({
      activity: {
        id: row.id,
        activityType: input.activityType,
        durationMinutes: input.durationMinutes,
        activityDate: input.activityDate,
        note: input.note,
        createdAt: new Date(row.created_at).toISOString(),
      },
    })
  } catch (err) {
    console.error('[my/training] create failed:', err)
    return NextResponse.json({ error: 'Could not save that entry' }, { status: 500 })
  }
}

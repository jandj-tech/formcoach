import { NextRequest, NextResponse } from 'next/server'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import {
  resolveNoteTarget,
  normalizeSuggestedScore,
  normalizeNote,
  saveNote,
  deleteNote,
} from '@/lib/coach-notes'

// A coach's own read of one criterion, shown to the player beside the AI
// score. Never touches criterion_scores — see lib/coach-notes.ts for why.
export async function POST(req: NextRequest) {
  const session = await getTeamSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { criterionScoreId, suggestedScore, note } = await req.json()

    const csId = typeof criterionScoreId === 'number' ? Math.floor(criterionScoreId) : NaN
    if (!Number.isInteger(csId) || csId <= 0) {
      return NextResponse.json({ error: 'Invalid criterion' }, { status: 400 })
    }

    const score = normalizeSuggestedScore(suggestedScore)
    if (score === undefined) {
      return NextResponse.json({ error: 'Score must be between 0 and 10' }, { status: 400 })
    }
    const cleanNote = normalizeNote(note)
    if (score === null && cleanNote === null) {
      return NextResponse.json({ error: 'Add a score or a note' }, { status: 400 })
    }

    // 404 rather than 403: a coach must not be able to probe which criterion
    // ids exist outside their own team.
    const target = await resolveNoteTarget(session, csId)
    if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const saved = await saveNote({
      criterionScoreId: csId,
      authorType: 'coach',
      teamId: session.teamId,
      authorEmail: session.adminEmail,
      suggestedScore: score,
      note: cleanNote,
    })

    return NextResponse.json({ success: true, note: saved })
  } catch (err) {
    // Two coaches of the same team saving at once: one loses the partial
    // unique index race. That is a conflict, not a server fault.
    if ((err as { code?: string })?.code === '23505') {
      return NextResponse.json(
        { error: 'Another coach just saved a note here — reload and try again' },
        { status: 409 },
      )
    }
    console.error('Coach note save error:', err)
    return NextResponse.json({ error: 'Could not save note' }, { status: 500 })
  }
}

// Retract this team's note. Ownership is "I authored the live row for my
// team" rather than the full roster join, so a coach can always pull their own
// public note down even after the player has left the team.
export async function DELETE(req: NextRequest) {
  const session = await getTeamSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { criterionScoreId } = await req.json()
    const csId = typeof criterionScoreId === 'number' ? Math.floor(criterionScoreId) : NaN
    if (!Number.isInteger(csId) || csId <= 0) {
      return NextResponse.json({ error: 'Invalid criterion' }, { status: 400 })
    }

    const removed = await deleteNote(csId, session.teamId)
    if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Coach note delete error:', err)
    return NextResponse.json({ error: 'Could not remove note' }, { status: 500 })
  }
}

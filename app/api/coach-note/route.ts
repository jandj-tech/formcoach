import { NextRequest, NextResponse } from 'next/server'
import {
  resolveNoteAuthorForCriterion,
  normalizeSuggestedScore,
  normalizeNote,
  saveNote,
  deleteNote,
} from '@/lib/coach-notes'

// One write path for every note author — the owner (admin cookie or his own
// player account), a team coach, or an org admin over one of its teams.
// resolveNoteAuthorForCriterion decides both who is writing and whether they
// may touch this analysis, so the surfaces (results page, coach shot page,
// admin submission page) all post here and stay in step.
export async function POST(req: NextRequest) {
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

    // 404 rather than 403 so a caller cannot probe which criterion ids exist
    // outside the players they coach.
    const resolved = await resolveNoteAuthorForCriterion(csId)
    if (!resolved) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const saved = await saveNote({
      criterionScoreId: csId,
      authorType: resolved.author.authorType,
      teamId: resolved.author.teamId,
      authorEmail: resolved.author.authorEmail,
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

export async function DELETE(req: NextRequest) {
  try {
    const { criterionScoreId } = await req.json()
    const csId = typeof criterionScoreId === 'number' ? Math.floor(criterionScoreId) : NaN
    if (!Number.isInteger(csId) || csId <= 0) {
      return NextResponse.json({ error: 'Invalid criterion' }, { status: 400 })
    }

    const resolved = await resolveNoteAuthorForCriterion(csId)
    if (!resolved) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const removed = await deleteNote(csId, resolved.author.teamId)
    if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Coach note delete error:', err)
    return NextResponse.json({ error: 'Could not remove note' }, { status: 500 })
  }
}

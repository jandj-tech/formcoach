import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  resolveAdminNoteTarget,
  normalizeSuggestedScore,
  normalizeNote,
  saveNote,
  deleteNote,
} from '@/lib/coach-notes'

async function isAdmin() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_auth')?.value === process.env.ADMIN_PASSWORD
}

// The owner coaches players through his own account, so he writes the same
// player-visible Coach's Notes as a team coach — stored with team_id NULL.
// This is NOT the Learn Mode correction path: it does not touch
// criterion_scores and never reaches the grading prompt.
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

    const target = await resolveAdminNoteTarget(csId)
    if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const saved = await saveNote({
      criterionScoreId: csId,
      authorType: 'admin',
      teamId: null,
      authorEmail: 'owner',
      suggestedScore: score,
      note: cleanNote,
    })

    return NextResponse.json({ success: true, note: saved })
  } catch (err) {
    if ((err as { code?: string })?.code === '23505') {
      return NextResponse.json({ error: 'A note was just saved here — reload' }, { status: 409 })
    }
    console.error('Admin coach note save error:', err)
    return NextResponse.json({ error: 'Could not save note' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { criterionScoreId } = await req.json()
    const csId = typeof criterionScoreId === 'number' ? Math.floor(criterionScoreId) : NaN
    if (!Number.isInteger(csId) || csId <= 0) {
      return NextResponse.json({ error: 'Invalid criterion' }, { status: 400 })
    }

    const removed = await deleteNote(csId, null)
    if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Admin coach note delete error:', err)
    return NextResponse.json({ error: 'Could not remove note' }, { status: 500 })
  }
}

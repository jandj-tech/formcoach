import { NextRequest, NextResponse } from 'next/server'
import {
  resolveAnalysisNoteAuthor,
  analysisIdForCriterion,
  normalizeBody,
  saveAnalysisNote,
  deleteAnalysisNote,
} from '@/lib/analysis-notes'

// Personal notes, one per author per criterion. Writable by the player the
// analysis belongs to, the account that uploaded it (how a trainer writes up
// someone else's shot), and anyone already entitled to coach it.
export async function POST(req: NextRequest) {
  try {
    const { criterionScoreId, body, isPublic } = await req.json()

    const csId = typeof criterionScoreId === 'number' ? Math.floor(criterionScoreId) : NaN
    if (!Number.isInteger(csId) || csId <= 0) {
      return NextResponse.json({ error: 'Invalid criterion' }, { status: 400 })
    }

    const text = normalizeBody(body)
    if (!text) return NextResponse.json({ error: 'Write something first' }, { status: 400 })

    const analysisId = await analysisIdForCriterion(csId)
    if (!analysisId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // 404 rather than 403 so a share-link visitor cannot probe criterion ids.
    const author = await resolveAnalysisNoteAuthor(analysisId)
    if (!author) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const saved = await saveAnalysisNote({
      analysisId,
      criterionScoreId: csId,
      author,
      body: text,
      isPublic: isPublic === true,
    })

    return NextResponse.json({ success: true, note: saved })
  } catch (err) {
    console.error('Analysis note save error:', err)
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

    const analysisId = await analysisIdForCriterion(csId)
    if (!analysisId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const author = await resolveAnalysisNoteAuthor(analysisId)
    if (!author) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const removed = await deleteAnalysisNote(csId, author.authorKey)
    if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Analysis note delete error:', err)
    return NextResponse.json({ error: 'Could not remove note' }, { status: 500 })
  }
}

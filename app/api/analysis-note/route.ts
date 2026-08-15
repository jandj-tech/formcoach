import { NextRequest, NextResponse } from 'next/server'
import {
  resolveAnalysisNoteAuthor,
  normalizeBody,
  saveAnalysisNote,
  deleteAnalysisNote,
} from '@/lib/analysis-notes'

// Personal notes on a whole analysis. Writable by the player it belongs to,
// the account that uploaded it (how a trainer writes up someone else's shot),
// and anyone already entitled to coach it.
export async function POST(req: NextRequest) {
  try {
    const { analysisId, body, isPublic } = await req.json()

    const id = typeof analysisId === 'number' ? Math.floor(analysisId) : NaN
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid analysis' }, { status: 400 })
    }

    const text = normalizeBody(body)
    if (!text) return NextResponse.json({ error: 'Write something first' }, { status: 400 })

    // 404 rather than 403 so a share-link visitor cannot probe analysis ids.
    const author = await resolveAnalysisNoteAuthor(id)
    if (!author) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const saved = await saveAnalysisNote({
      analysisId: id,
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
    const { analysisId } = await req.json()
    const id = typeof analysisId === 'number' ? Math.floor(analysisId) : NaN
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid analysis' }, { status: 400 })
    }

    const author = await resolveAnalysisNoteAuthor(id)
    if (!author) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const removed = await deleteAnalysisNote(id, author.authorKey)
    if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Analysis note delete error:', err)
    return NextResponse.json({ error: 'Could not remove note' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'

async function isAdmin() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_auth')?.value === process.env.ADMIN_PASSWORD
}

// Review queue for Coach's Notes. Accepting one is the ONLY bridge from a
// coach's opinion into the grading model, and it is deliberately manual.
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const notes = await db`
    SELECT
      cn.id, cn.suggested_score, cn.note, cn.author_type, cn.author_email,
      cn.created_at, cn.criterion_score_id,
      cs.ai_score, cs.ai_reasoning, cs.admin_score,
      c.name AS criterion_name,
      t.name AS team_name,
      s.token AS submission_token,
      a.frame_urls,
      -- How much this criterion's accepted corrections already steer the
      -- grader, so the owner can see the weight of one more.
      (SELECT COUNT(*) FROM criterion_scores x
        WHERE x.criterion_id = cs.criterion_id AND x.admin_score IS NOT NULL)::int AS existing_corrections,
      (SELECT ROUND(AVG(x.admin_score - x.ai_score)::numeric, 2) FROM criterion_scores x
        WHERE x.criterion_id = cs.criterion_id AND x.admin_score IS NOT NULL) AS existing_drift
    FROM coach_notes cn
    JOIN criterion_scores cs ON cs.id = cn.criterion_score_id
    JOIN criteria c ON c.id = cs.criterion_id
    JOIN analyses a ON a.id = cs.analysis_id
    JOIN submissions s ON s.id = a.submission_id
    LEFT JOIN teams t ON t.id = cn.team_id
    WHERE cn.deleted_at IS NULL AND cn.status = 'pending'
    ORDER BY cn.created_at DESC
    LIMIT 100
  `
  return NextResponse.json({ notes })
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { noteId, action, adminScore, adminNotes, reason } = await req.json()

    const id = typeof noteId === 'number' ? Math.floor(noteId) : NaN
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid note' }, { status: 400 })
    }
    if (action !== 'accept' && action !== 'reject') {
      return NextResponse.json({ error: 'action must be accept or reject' }, { status: 400 })
    }

    const [note] = (await db`
      SELECT id, criterion_score_id FROM coach_notes
      WHERE id = ${id} AND deleted_at IS NULL AND status = 'pending'
    `) as unknown as [{ id: number; criterion_score_id: number } | undefined]
    if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (action === 'reject') {
      await db`
        UPDATE coach_notes
        SET status = 'rejected', reviewed_at = NOW(), review_reason = ${reason || null}
        WHERE id = ${id}
      `
      // The note stays visible on the player's report — status governs
      // training data, not display.
      return NextResponse.json({ success: true })
    }

    // Accept: this writes criterion_scores.admin_score, which IS the live
    // calibration input read by lib/analyze.ts on the very next analysis.
    //
    // adminScore/adminNotes come from the OWNER's own fields in the request.
    // Never derive adminNotes from the coach's note: analyze.ts quotes
    // admin_notes verbatim into the system prompt, so coach free text there
    // would be an untrusted-input-into-prompt path.
    const score = Number(adminScore)
    if (!Number.isFinite(score) || score < 0 || score > 10) {
      return NextResponse.json({ error: 'Enter your own score between 0 and 10' }, { status: 400 })
    }
    const ownNotes = typeof adminNotes === 'string' ? adminNotes.trim().slice(0, 1000) || null : null

    await db.begin(async (sql) => {
      await sql`
        UPDATE criterion_scores
        SET admin_score = ${score}, admin_notes = ${ownNotes}
        WHERE id = ${note.criterion_score_id}
      `
      await sql`
        UPDATE coach_notes
        SET status = 'accepted', reviewed_at = NOW()
        WHERE id = ${id}
      `
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Admin coach-notes review error:', err)
    return NextResponse.json({ error: 'Could not process review' }, { status: 500 })
  }
}

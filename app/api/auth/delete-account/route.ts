import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { clearAllSessions } from '@/lib/sessions'
import { sendAccountDeletedEmail } from '@/lib/email'

export async function DELETE() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { userId } = session

  // Capture email before deletion for confirmation email
  const [userRow] = await db`SELECT email FROM users WHERE id = ${userId}` as unknown as [{ email: string } | undefined]

  // Delete in FK order: scores → analyses → submissions → memberships → user
  await db`
    DELETE FROM criterion_scores
    WHERE analysis_id IN (
      SELECT a.id FROM analyses a
      JOIN submissions s ON s.id = a.submission_id
      WHERE s.user_id = ${userId} OR s.email = (SELECT email FROM users WHERE id = ${userId})
    )
  `
  await db`
    DELETE FROM analyses
    WHERE submission_id IN (
      SELECT id FROM submissions
      WHERE user_id = ${userId} OR email = (SELECT email FROM users WHERE id = ${userId})
    )
  `
  await db`DELETE FROM submissions WHERE user_id = ${userId} OR email = (SELECT email FROM users WHERE id = ${userId})`
  await db`DELETE FROM team_memberships WHERE user_id = ${userId}`
  await db`DELETE FROM users WHERE id = ${userId}`

  if (userRow?.email) {
    try { await sendAccountDeletedEmail(userRow.email) } catch {}
  }

  const res = NextResponse.json({ success: true })
  clearAllSessions(res)
  return res
}

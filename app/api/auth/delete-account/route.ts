import { NextResponse } from 'next/server'
import { deleteObjects } from '@/lib/storage'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { clearAllSessions } from '@/lib/sessions'
import { sendAccountDeletedEmail } from '@/lib/email'
import { appleRevoke, appleAppClientId, appleWebClientId } from '@/lib/oauth'

export async function DELETE() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { userId } = session

  // Capture email before deletion for confirmation email
  const [userRow] = await db`SELECT email FROM users WHERE id = ${userId}` as unknown as [{ email: string } | undefined]

  // Collect blob URLs (frames + videos) BEFORE dropping the rows — deleting
  // the analyses first would destroy the only record of the URLs and orphan
  // the files at public URLs forever.
  const analyses = (await db`
    SELECT a.* FROM analyses a
    JOIN submissions s ON s.id = a.submission_id
    WHERE s.user_id = ${userId} OR s.email = (SELECT email FROM users WHERE id = ${userId})
  `) as unknown as Array<Record<string, unknown>>

  const blobUrls: string[] = []
  for (const a of analyses) {
    if (typeof a.video_url === 'string' && a.video_url) blobUrls.push(a.video_url)
    if (Array.isArray(a.frame_urls)) {
      for (const u of a.frame_urls as unknown[]) {
        if (typeof u === 'string' && u) blobUrls.push(u)
      }
    }
  }

  // Apple requires the Sign in with Apple grant to be revoked when the account
  // it belongs to is deleted — otherwise we keep showing up under the person's
  // "Apps Using Apple ID" for an account that no longer exists. Must happen
  // before the user row goes, since the token is stored against it.
  await revokeAppleGrants(userId)

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

  // Stop all marketing email to this address — "account deleted" must mean
  // no more mail beyond the single confirmation below.
  if (userRow?.email) {
    try { await db`DELETE FROM email_list WHERE email = ${userRow.email}` } catch {}
  }

  await db`DELETE FROM users WHERE id = ${userId}`

  // Best-effort blob cleanup — don't fail the deletion if storage is unreachable.
  if (blobUrls.length > 0) {
    try {
      await deleteObjects(blobUrls)
    } catch (err) {
      console.warn('Delete-account blob cleanup failed:', err instanceof Error ? err.message : err)
    }
  }

  if (userRow?.email) {
    try { await sendAccountDeletedEmail(userRow.email) } catch {}
  }

  const res = NextResponse.json({ success: true })
  clearAllSessions(res)
  return res
}

/**
 * Best effort by design: a deletion the person asked for must not fail because
 * Apple is unreachable. The tokens are tried against both clients because the
 * grant belongs to whichever one issued it — the app's bundle id for a native
 * sign-in, the Services ID for one done on the website.
 */
async function revokeAppleGrants(userId: string) {
  try {
    const identities = (await db`
      SELECT refresh_token FROM user_oauth_identities
      WHERE user_id = ${userId} AND provider = 'apple' AND refresh_token IS NOT NULL
    `) as unknown as Array<{ refresh_token: string }>

    for (const { refresh_token } of identities) {
      for (const clientId of [appleAppClientId(), appleWebClientId()]) {
        try {
          await appleRevoke(refresh_token, clientId)
        } catch (err) {
          console.warn('Apple token revoke failed:', err instanceof Error ? err.message : err)
        }
      }
    }
  } catch (err) {
    // Table absent, or Apple not configured — neither should block a deletion.
    console.warn('Apple revoke lookup skipped:', err instanceof Error ? err.message : err)
  }
}

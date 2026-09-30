import { NextRequest, NextResponse } from 'next/server'
import { deleteObjects } from '@/lib/storage'
import { getSessionFromRequest } from '@/lib/auth'
import { db } from '@/lib/db'
import { clearAllSessions } from '@/lib/sessions'
import { sendAccountDeletedEmail } from '@/lib/email'
import { appleRevoke, appleAppClientId, appleWebClientId } from '@/lib/oauth'
import { releaseSeatsForDeletedUser } from '@/lib/org-membership'

// getSessionFromRequest instead of the cookie-only getSession: the app's
// native Settings screen deletes over Bearer auth (Apple 5.1.1(v) requires
// in-app deletion); the web dashboard's cookie path is unchanged.
export async function DELETE(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { userId } = session

  // Capture email before deletion for confirmation email
  const [userRow] = await db`SELECT email FROM users WHERE id = ${userId}` as unknown as [{ email: string } | undefined]

  // Ownership is user_id ONLY (security audit 2026-09-28, item 1). An email
  // match is not ownership: signup does not verify the inbox, and
  // submissions.email today holds a coach's or org admin's address on their
  // own self-uploads — so matching on it let a stranger who signed up with a
  // coach's email delete that coach's shots. Legacy anonymous uploads that
  // really are this person's were given a user_id at signup (and by the
  // one-time backfill in migrate-email-list-legacy-sub.sql).
  //
  // Collect blob URLs (frames + videos) BEFORE dropping the rows — deleting
  // the analyses first would destroy the only record of the URLs and orphan
  // the files at public URLs forever.
  const analyses = (await db`
    SELECT a.* FROM analyses a
    JOIN submissions s ON s.id = a.submission_id
    WHERE s.user_id = ${userId}
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
      WHERE s.user_id = ${userId}
    )
  `
  await db`
    DELETE FROM analyses
    WHERE submission_id IN (SELECT id FROM submissions WHERE user_id = ${userId})
  `
  await db`DELETE FROM submissions WHERE user_id = ${userId}`
  // Org membership seats go back to their orgs' pools (silently — the
  // account is going away).
  await releaseSeatsForDeletedUser(userId)
  await db`DELETE FROM team_memberships WHERE user_id = ${userId}`

  // Stop all marketing email to this address — "account deleted" must mean
  // no more mail beyond the single confirmation below.
  // But not when the same address is also a coach's or org admin's: that
  // row is theirs too (and signup never proved this account owns the inbox).
  if (userRow?.email) {
    try {
      await db`
        DELETE FROM email_list
        WHERE email = ${userRow.email}
          AND NOT EXISTS (SELECT 1 FROM teams WHERE LOWER(admin_email) = LOWER(${userRow.email}))
          AND NOT EXISTS (SELECT 1 FROM team_coaches WHERE LOWER(email) = LOWER(${userRow.email}))
          AND NOT EXISTS (SELECT 1 FROM organizations WHERE LOWER(admin_email) = LOWER(${userRow.email}))
      `
    } catch {}
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

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionFromRequest } from '@/lib/auth'
import {
  verifyEmailConfirmToken,
  markEmailVerified,
  applyEmailEntitlement,
  issueOwnershipSetupUrl,
} from '@/lib/email-entitlements'

/**
 * The link in "Confirm your email to activate your free membership".
 *
 * The link proves the clicker reads the inbox the comp was granted to. It does
 * NOT prove they are the person who registered the account: anyone can sign up
 * with any address and pick the password. So:
 *
 *   - already verified                 → apply the comp, done
 *   - signed in as this account here   → the clicker holds the account AND the
 *                                        inbox: verify + apply in one click
 *   - OAuth-only (no password)         → the provider identity is the only way
 *                                        in; verify + apply in one click
 *   - anything else (a password nobody
 *     proved, or no way to log in)     → "set your password to activate": the
 *                                        reset page with a fresh token. Setting
 *                                        it verifies, applies the comp, and
 *                                        locks out whoever chose the old one.
 *
 * Mints no session itself: a forwarded or pre-fetched link must not log anyone
 * in (the reset step logs the owner in once they set the password).
 */
export async function GET(req: NextRequest) {
  const baseUrl = req.nextUrl.origin
  const token = req.nextUrl.searchParams.get('token') ?? ''
  const claims = token ? await verifyEmailConfirmToken(token) : null
  if (!claims) return NextResponse.redirect(`${baseUrl}/dashboard?activated=expired`)

  try {
    const [u] = (await db`
      SELECT u.id, LOWER(u.email) AS email, u.email_verified_at IS NOT NULL AS verified,
             u.password_hash IS NOT NULL AS has_password,
             EXISTS (SELECT 1 FROM user_oauth_identities oi WHERE oi.user_id = u.id) AS has_oauth
      FROM users u WHERE u.id = ${claims.userId}
    `) as unknown as [{ id: string; email: string; verified: boolean; has_password: boolean; has_oauth: boolean } | undefined]

    // The address must still be the account's: a link for an old address never
    // verifies (or takes over) an account that has since changed it.
    if (!u || u.email !== claims.email) return NextResponse.redirect(`${baseUrl}/dashboard?activated=expired`)

    if (!u.verified) {
      const session = await getSessionFromRequest(req)
      const signedInAsOwner = session?.userId === u.id
      const oauthOnly = !u.has_password && u.has_oauth
      if (!signedInAsOwner && !oauthOnly) {
        const setupPath = await issueOwnershipSetupUrl(u.id, claims.email)
        if (setupPath) return NextResponse.redirect(`${baseUrl}${setupPath}`)
        // Verified between the SELECT and now (another tab): fall through.
      }
      const verified = await markEmailVerified(u.id, claims.email)
      if (!verified) return NextResponse.redirect(`${baseUrl}/dashboard?activated=expired`)
    }

    // The link is bound to THIS account, so using it is the family's choice
    // when several player accounts share the address (sendEntitlementChoice).
    await applyEmailEntitlement(u.id, { chosen: true })
    return NextResponse.redirect(`${baseUrl}/dashboard?activated=1`)
  } catch (err) {
    console.error('[confirm-email] failed:', err instanceof Error ? err.message : err)
    return NextResponse.redirect(`${baseUrl}/dashboard?activated=error`)
  }
}

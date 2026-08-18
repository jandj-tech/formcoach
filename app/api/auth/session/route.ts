import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { getTeamSession } from '@/lib/team-auth'
import { getOrgSession } from '@/lib/org-auth'
import { db } from '@/lib/db'
import { userHasInitiatedTeam } from '@/lib/team-tokens'

export async function GET(req: NextRequest) {
  // 1. Player session — also returns token/subscription info used elsewhere.
  // getSessionFromRequest checks the cookie first (web unchanged) and falls
  // back to the mobile app's Bearer JWT so native screens see login state.
  const session = await getSessionFromRequest(req)
  if (session) {
    type UserRow = {
      id: string
      email: string
      subscription_type: string | null
      subscription_expires_at: string | null
      analysis_tokens?: number
      free_analysis_used?: boolean | null
    }

    // The analysis_tokens column may not exist yet if the DB migration
    // hasn't been applied — fall back to the legacy column set.
    let user: UserRow | undefined
    try {
      ;[user] = (await db`
        SELECT id, email, subscription_type, subscription_expires_at, analysis_tokens, free_analysis_used
        FROM users WHERE id = ${session.userId}
      `) as unknown as [UserRow | undefined]
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!/(analysis_tokens|free_analysis_used).*does not exist/i.test(msg)) throw err
      console.warn('users.analysis_tokens column missing — run `npm run migrate`.')
      ;[user] = (await db`
        SELECT id, email, subscription_type, subscription_expires_at
        FROM users WHERE id = ${session.userId}
      `) as unknown as [UserRow | undefined]
    }

    if (user) {
      const isSubscribed =
        !!user.subscription_type &&
        !!user.subscription_expires_at &&
        new Date(user.subscription_expires_at) > new Date()

      const tokens = user.analysis_tokens ?? 0
      const subscribed = isSubscribed || tokens > 0

      // Whether the player is on a team — drives the "ask your coach" option.
      let onTeam = false
      try {
        const rows = (await db`
          SELECT 1 FROM team_memberships WHERE user_id = ${user.id} LIMIT 1
        `) as unknown as unknown[]
        onTeam = rows.length > 0
      } catch {
        // team_memberships table may not exist yet
      }

      // If any of their teams has reached the initiated player count, the
      // per-analysis price is $0.99 instead of $1.79.
      const onInitiatedTeam = onTeam && (await userHasInitiatedTeam(user.id))

      // The one-time free signup analysis is still available (score-only
      // preview). Only meaningful when they have no tokens or subscription.
      const freeUpload = !isSubscribed && tokens <= 0 && user.free_analysis_used === false

      // The iOS app's Analyze tab unlocks on tokens > 0 and predates the
      // freeUpload flag, so it would paywall brand-new accounts that still
      // have their free analysis. Present that free analysis as a token to
      // app clients only (native iOS requests carry CFNetwork in the UA;
      // browsers never do — web handles freeUpload itself).
      const isNativeApp = (req.headers.get('user-agent') ?? '').includes('CFNetwork')
      const appTokens = isNativeApp && freeUpload ? tokens + 1 : tokens

      return NextResponse.json({
        user: { id: user.id, email: user.email, subscribed, tokens: appTokens, onTeam, onInitiatedTeam, freeUpload },
        account: { type: 'player', dashboard: '/dashboard' },
      })
    }
  }

  // 2. Coach / organization sessions — so the nav shows a logged-in state.
  const teamSession = await getTeamSession()
  if (teamSession) {
    return NextResponse.json({ user: null, account: { type: 'team', dashboard: '/team/dashboard' } })
  }

  const orgSession = await getOrgSession()
  if (orgSession) {
    return NextResponse.json({ user: null, account: { type: 'org', dashboard: '/org/dashboard' } })
  }

  return NextResponse.json({ user: null, account: null })
}

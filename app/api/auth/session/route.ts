import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getTeamSession } from '@/lib/team-auth'
import { getOrgSession } from '@/lib/org-auth'
import { db } from '@/lib/db'

export async function GET() {
  // 1. Player session — also returns token/subscription info used elsewhere.
  const session = await getSession()
  if (session) {
    type UserRow = {
      id: string
      email: string
      subscription_type: string | null
      subscription_expires_at: string | null
      analysis_tokens?: number
    }

    // The analysis_tokens column may not exist yet if the DB migration
    // hasn't been applied — fall back to the legacy column set.
    let user: UserRow | undefined
    try {
      ;[user] = (await db`
        SELECT id, email, subscription_type, subscription_expires_at, analysis_tokens
        FROM users WHERE id = ${session.userId}
      `) as unknown as [UserRow | undefined]
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!/analysis_tokens.*does not exist/i.test(msg)) throw err
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

      return NextResponse.json({
        user: { id: user.id, email: user.email, subscribed, tokens },
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

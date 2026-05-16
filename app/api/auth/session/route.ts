import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ user: null })

  type UserRow = {
    id: string
    email: string
    subscription_type: string | null
    subscription_expires_at: string | null
    analysis_tokens?: number
  }

  // The analysis_tokens column may not exist yet if the DB migration
  // hasn't been applied — fall back to the legacy column set so the
  // session endpoint still works (same pattern as app/dashboard/page.tsx).
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

  if (!user) return NextResponse.json({ user: null })

  const isSubscribed =
    !!user.subscription_type &&
    !!user.subscription_expires_at &&
    new Date(user.subscription_expires_at) > new Date()

  const tokens = user.analysis_tokens ?? 0
  const subscribed = isSubscribed || tokens > 0

  return NextResponse.json({ user: { id: user.id, email: user.email, subscribed, tokens } })
}

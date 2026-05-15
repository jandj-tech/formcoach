import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ user: null })

  const [user] = await db`
    SELECT id, email, subscription_type, subscription_expires_at, analysis_tokens
    FROM users WHERE id = ${session.userId}
  ` as unknown as [{ id: string; email: string; subscription_type: string | null; subscription_expires_at: string | null; analysis_tokens: number } | undefined]

  if (!user) return NextResponse.json({ user: null })

  const isSubscribed =
    !!user.subscription_type &&
    !!user.subscription_expires_at &&
    new Date(user.subscription_expires_at) > new Date()

  const tokens = user.analysis_tokens ?? 0
  const subscribed = isSubscribed || tokens > 0

  return NextResponse.json({ user: { id: user.id, email: user.email, subscribed, tokens } })
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionFromRequest } from '@/lib/auth'

// /dashboard/shots/<submission id> — opens one of the signed-in player's own
// shots. A "finish setting up to see your results" email lands the player
// here after they set a password, so the email never has to carry the
// results token itself. Someone else's shot (or a bad id) goes to the
// player's dashboard; signed out goes to log in and back here.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const session = await getSessionFromRequest(req)
  if (!session?.userId) {
    const login = new URL('/login', req.url)
    login.searchParams.set('next', `/dashboard/shots/${encodeURIComponent(id)}`)
    return NextResponse.redirect(login)
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    try {
      const [row] = (await db`
        SELECT token FROM submissions
        WHERE id = ${id} AND user_id = ${session.userId} AND token IS NOT NULL
      `) as unknown as [{ token: string } | undefined]
      if (row) return NextResponse.redirect(new URL(`/results/${encodeURIComponent(row.token)}`, req.url))
    } catch (err) {
      console.error('[dashboard/shots] lookup failed:', err)
    }
  }
  return NextResponse.redirect(new URL('/dashboard', req.url))
}

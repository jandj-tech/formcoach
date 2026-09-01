import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { getPlayerDashboard } from '@/lib/player-dashboard'

/**
 * The consolidated player dashboard: plan + weekly/monthly allowance +
 * purchased tokens + training/consistency series, in one response. Website
 * and iOS app both render from this endpoint (or the same lib server-side),
 * so the two can never disagree about what's left — and the signed-in home
 * screen costs one request, not one per card.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Login required' }, { status: 401 })
  }
  try {
    const dashboard = await getPlayerDashboard(session.userId)
    return NextResponse.json(dashboard)
  } catch (err) {
    console.error('[my/usage] failed:', err)
    return NextResponse.json({ error: 'Could not load your usage' }, { status: 500 })
  }
}

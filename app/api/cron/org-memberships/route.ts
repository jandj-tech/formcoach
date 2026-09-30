import { NextRequest, NextResponse } from 'next/server'
import { requireEnv, safeEqual } from '@/lib/env'
import { runMembershipCron } from '@/lib/org-membership'

export const maxDuration = 300

/**
 * Daily org-membership lifecycle (vercel.json):
 *   - 30- and 7-day expiry notices to the org, 7-day notice to the player
 *   - seats past their end → 'expired'; a paused personal Stripe plan resumes
 *   - future-dated seats that started → pause the holder's personal plan
 *   - seats whose holder left the org by another path → back to the pool
 *   - checkouts abandoned >24h → placeholder seats removed
 * Every step is idempotent (per-seat/per-order stamps), so a re-run or an
 * overlapping run sends nothing twice.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!safeEqual(authHeader, `Bearer ${requireEnv('CRON_SECRET')}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await runMembershipCron()
    console.log('[cron/org-memberships]', result)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[cron/org-memberships] failed:', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

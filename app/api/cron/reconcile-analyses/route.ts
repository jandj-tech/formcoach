import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireEnv, safeEqual } from '@/lib/env'
import { refundChargesForSubmission } from '@/lib/analysis-charge'
import { markSubmissionFailed } from '@/lib/player-subscription'

export const maxDuration = 300

/**
 * How long a submission may legitimately sit at 'processing'.
 *
 * /api/analyze runs with maxDuration = 300s, so anything past that is dead by
 * definition — Vercel has already killed it. 30 minutes leaves a wide margin
 * for clock skew and for a request that started just before a deploy, so this
 * can never refund an analysis that is still running and about to succeed.
 */
const STRANDED_AFTER = '30 minutes'

/**
 * Gives back credits taken for analyses that never finished.
 *
 * The gap this fills: the refund in /api/analyze lives in a `catch`. Vercel
 * kills a function at maxDuration with a wall-clock SIGKILL, which is not a JS
 * exception — so on a timeout the `catch` never runs, the submission stays
 * 'processing' forever, and the user is short one credit with nothing to show.
 * That was the single worst money bug in the product: it costs the customer,
 * and it costs them silently.
 *
 * Runs hourly (vercel.json). Refunds are claimed atomically in
 * analysis_charges, so a run overlapping a late-but-alive request cannot
 * double-credit.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!safeEqual(authHeader, `Bearer ${requireEnv('CRON_SECRET')}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const stranded = (await db`
    SELECT id, created_at
    FROM submissions
    WHERE status = 'processing'
      AND created_at < NOW() - ${STRANDED_AFTER}::interval
    ORDER BY created_at
    LIMIT 200
  `) as unknown as Array<{ id: string; created_at: Date }>

  let refunded = 0
  let failedToRefund = 0
  const touched: string[] = []

  for (const s of stranded) {
    try {
      const n = await refundChargesForSubmission(s.id)
      refunded += n
      // Terminal state either way. A stranded row with no charge record (it
      // predates this table, or was a legacy-unlimited analysis that was never
      // debited) still must not sit at 'processing' forever — the user's
      // history shows it stuck mid-analysis.
      await markSubmissionFailed(s.id)
      touched.push(s.id)
    } catch (err) {
      failedToRefund++
      console.error('[reconcile] submission could not be reconciled', {
        submissionId: s.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  if (stranded.length > 0) {
    console.log('[reconcile] stranded analyses reconciled', {
      stranded: stranded.length,
      creditsRefunded: refunded,
      failed: failedToRefund,
      oldest: stranded[0]?.created_at,
    })
  }

  return NextResponse.json({
    stranded: stranded.length,
    creditsRefunded: refunded,
    failed: failedToRefund,
    submissions: touched,
  })
}

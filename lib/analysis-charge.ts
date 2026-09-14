import { db } from './db'
import { markSubmissionFailed } from './player-subscription'

/**
 * jsonb columns must be written with db.json(value). Its JSONValue parameter
 * wants an index signature, which a named interface like ChargeRef does not
 * have even though it is structurally JSON. Declared here rather than imported
 * from lib/eval, which would drag the whole eval + grader module graph into
 * every request that charges a credit.
 */
const asJson = (v: unknown) => v as Parameters<typeof db.json>[0]

/**
 * Durable record of the credit an analysis reserved, so it can be given back
 * by something other than the request that took it.
 *
 * THE LEAK THIS CLOSES: /api/analyze reserves the credit atomically before the
 * model call, and undoes it from a closure in a `catch`. Vercel kills the
 * function at maxDuration (300s) with a wall-clock SIGKILL — that is not a JS
 * exception, so the `catch` never runs, the closure dies with the process, and
 * the submission is stranded at 'processing' forever with the credit consumed
 * and no analysis to show for it. Nothing reconciled those rows.
 *
 * A closure cannot survive the process, so the charge is written to a table
 * instead and the reconcile cron replays it. The in-request refund path calls
 * the same function, so there is exactly one refund implementation per funding
 * source rather than one in the route and a second in the cron.
 */

/** Which balance was debited, and therefore how to give it back. */
export type ChargeKind =
  | 'coach_credit_lower' // coach_credits matched on LOWER(email)
  | 'coach_credit_exact' // coach_credits matched on email = (see note below)
  | 'team_credit'
  | 'org_balance'
  | 'user_token'
  | 'subscription' // included allowance: no balance to increment

/**
 * What the refund needs to find the row again.
 *
 * `coach_credit_lower` and `coach_credit_exact` are deliberately distinct
 * kinds. The team-upload path debits `WHERE LOWER(email) = ...` and the
 * coach-self path debits `WHERE email = ...`. Refunding either with the other's
 * predicate can credit a different row than the one debited, or none at all, on
 * any address whose stored casing differs. The refund must mirror the debit
 * exactly, so the debit records which one it used.
 */
export interface ChargeRef {
  email?: string
  teamId?: string
  orgId?: string
  userId?: string
}

interface ChargeRow {
  id: number
  submission_id: string
  kind: ChargeKind
  ref: ChargeRef
}

/**
 * Writes the charge down. Best-effort: a failure here must NOT fail the
 * analysis the user already paid for. The in-request refund path still works
 * without it — this only costs the ability to reconcile after a hard kill.
 */
export async function recordCharge(
  submissionId: string,
  kind: ChargeKind,
  ref: ChargeRef
): Promise<void> {
  try {
    await db`
      INSERT INTO analysis_charges (submission_id, kind, ref)
      VALUES (${submissionId}, ${kind}, ${db.json(asJson(ref))})
    `
  } catch (err) {
    console.error('[charge] could not record charge', {
      submissionId,
      kind,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/** The single refund switch. Every funding source gives its credit back here. */
async function applyRefund(row: ChargeRow): Promise<void> {
  const { kind, ref } = row
  switch (kind) {
    case 'coach_credit_lower':
      if (!ref.email) throw new Error('coach_credit_lower charge has no email')
      await db`UPDATE coach_credits SET credits = credits + 1 WHERE LOWER(email) = ${ref.email}`
      return
    case 'coach_credit_exact':
      if (!ref.email) throw new Error('coach_credit_exact charge has no email')
      await db`UPDATE coach_credits SET credits = credits + 1 WHERE email = ${ref.email}`
      return
    case 'team_credit':
      if (!ref.teamId) throw new Error('team_credit charge has no teamId')
      await db`UPDATE teams SET credits = credits + 1 WHERE id = ${ref.teamId}`
      return
    case 'org_balance':
      if (!ref.orgId) throw new Error('org_balance charge has no orgId')
      await db`UPDATE organizations SET token_balance = token_balance + 1 WHERE id = ${ref.orgId}`
      return
    case 'user_token':
      if (!ref.userId) throw new Error('user_token charge has no userId')
      await db`UPDATE users SET analysis_tokens = analysis_tokens + 1 WHERE id = ${ref.userId}`
      return
    case 'subscription':
      // An included analysis has no balance to increment. Dropping out of the
      // usage window IS the refund, and markSubmissionFailed does that.
      await markSubmissionFailed(row.submission_id)
      return
    default: {
      // A kind written by a newer deploy than this one is running. Leaving the
      // row unrefunded is right: a later deploy reconciles it, whereas
      // swallowing it here would mark it refunded having done nothing.
      const exhaustive: never = kind
      throw new Error(`unknown charge kind: ${String(exhaustive)}`)
    }
  }
}

/**
 * Refunds every outstanding charge on a submission, at most once each.
 *
 * The claim and the refund are separated by `refunded_at`: the UPDATE claims
 * rows atomically, so a live request and the reconcile cron racing on the same
 * submission cannot both give the credit back. This is the idempotency key the
 * charge path never had.
 *
 * If a refund then throws, its claim is released so a later run retries it —
 * a claimed-but-unapplied row would be a credit silently kept.
 *
 * Returns how many charges were actually refunded.
 */
export async function refundChargesForSubmission(submissionId: string): Promise<number> {
  let claimed: ChargeRow[]
  try {
    claimed = (await db`
      UPDATE analysis_charges
      SET refunded_at = NOW()
      WHERE submission_id = ${submissionId} AND refunded_at IS NULL
      RETURNING id, submission_id, kind, ref
    `) as unknown as ChargeRow[]
  } catch (err) {
    console.error('[charge] could not claim charges', {
      submissionId,
      error: err instanceof Error ? err.message : String(err),
    })
    return 0
  }

  let refunded = 0
  for (const row of claimed) {
    try {
      await applyRefund(row)
      refunded++
    } catch (err) {
      console.error('[charge] refund failed, releasing claim for retry', {
        chargeId: row.id,
        kind: row.kind,
        error: err instanceof Error ? err.message : String(err),
      })
      try {
        await db`UPDATE analysis_charges SET refunded_at = NULL WHERE id = ${row.id}`
      } catch (releaseErr) {
        console.error('[charge] could not release claim — credit is stuck', {
          chargeId: row.id,
          error: releaseErr instanceof Error ? releaseErr.message : String(releaseErr),
        })
      }
    }
  }
  return refunded
}

/**
 * Drops the charge record once the analysis has succeeded and the credit is
 * genuinely spent, so the reconcile cron never sees it. Best-effort: the cron
 * only looks at submissions still stuck at 'processing', so a leftover row on a
 * completed submission is inert either way.
 */
export async function settleChargesForSubmission(submissionId: string): Promise<void> {
  try {
    await db`
      UPDATE analysis_charges SET settled_at = NOW()
      WHERE submission_id = ${submissionId} AND settled_at IS NULL AND refunded_at IS NULL
    `
  } catch (err) {
    console.error('[charge] could not settle charges', {
      submissionId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

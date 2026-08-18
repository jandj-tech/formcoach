/**
 * Backfills `orders` from Stripe.
 *
 * Digital purchases never wrote a row — they incremented a balance and left
 * the only record of the sale inside Stripe — so the admin Orders page has
 * been blind to real revenue. This walks every checkout session and inserts
 * what is missing.
 *
 * Safe to run repeatedly: `stripe_session_id` is unique and every insert is
 * ON CONFLICT DO NOTHING, so rows the webhook already wrote are left exactly
 * as they are. It only ever inserts; it never updates or deletes.
 *
 *   npx tsx scripts/backfill-orders.ts --dry     (show what would be added)
 *   npx tsx scripts/backfill-orders.ts           (write them)
 */
import { readFileSync } from 'fs'
import path from 'path'

for (const line of readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
}

const DRY = process.argv.includes('--dry')

async function main() {
  const { getStripe } = await import('../lib/stripe')
  const { db } = await import('../lib/db')
  const stripe = getStripe()

  const sessions = []
  let startingAfter: string | undefined
  for (;;) {
    const page = await stripe.checkout.sessions.list({
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })
    sessions.push(...page.data)
    if (!page.has_more) break
    startingAfter = page.data[page.data.length - 1]?.id
  }

  // 'no_payment_required' is a 100%-off comp code — a real order at zero.
  const settled = sessions.filter(
    (s) => s.payment_status === 'paid' || s.payment_status === 'no_payment_required',
  )

  const existing = new Set(
    ((await db`SELECT stripe_session_id FROM orders`) as unknown as Array<{
      stripe_session_id: string
    }>).map((r) => r.stripe_session_id),
  )

  let added = 0
  let skippedExisting = 0
  let skippedBall = 0
  let skippedNoEmail = 0

  for (const s of settled) {
    if (existing.has(s.id)) { skippedExisting++; continue }

    const meta = s.metadata ?? {}
    const type = meta.type || (meta.plan === 'team-credits' ? 'team-credits' : null)
    const qty = Math.max(0, parseInt(meta.quantity || meta.tokensEach || '0', 10) || 0)

    // Ball and class-package orders carry shipping details this script has no
    // business inventing. The webhook writes those with their addresses; a
    // stripped-down row here would be worse than the gap it fills.
    if (!type || type === 'org_class_package' || meta.variant || meta.size) { skippedBall++; continue }

    const spec: Record<string, { kind: string; label: (n: number) => string; buyer: string | null }> = {
      analysis_token: { kind: 'analysis_tokens', label: (n) => `${n} shot analysis token${n === 1 ? '' : 's'}`, buyer: 'user' },
      coach_self_credits: { kind: 'coach_credits', label: (n) => `${n} coach upload credit${n === 1 ? '' : 's'}`, buyer: 'coach' },
      org_token_purchase: { kind: 'org_tokens', label: (n) => `${n} analysis token${n === 1 ? '' : 's'} for the organization`, buyer: 'org' },
      team_token_grant: { kind: 'player_tokens', label: (n) => `${n} token${n === 1 ? '' : 's'} granted to players`, buyer: null },
      'team-credits': { kind: 'team_credits', label: (n) => `${n} team upload credit${n === 1 ? '' : 's'}`, buyer: 'team' },
      monthly: { kind: 'subscription', label: () => 'Monthly subscription (retired)', buyer: 'user' },
      annual: { kind: 'subscription', label: () => 'Annual subscription (retired)', buyer: 'user' },
    }
    const rule = spec[type]
    if (!rule) { skippedBall++; continue }

    const recipients = (meta.recipientUserIds || '').split(',').filter(Boolean).length
    let quantity = type === 'team_token_grant' && recipients > 0 ? qty * recipients : qty

    // Sessions predating the quantity metadata carry none. The webhook reads a
    // missing quantity on a token sale as 1 (it was hardcoded to +1 before
    // multi-buy existed), so match that rather than recording a sale of zero.
    if (quantity < 1 && (type === 'analysis_token' || type === 'monthly' || type === 'annual')) {
      quantity = 1
    }

    const email = (meta.coachEmail || s.customer_details?.email || s.customer_email || '')
      .trim()
      .toLowerCase()
    if (!email) { skippedNoEmail++; continue }

    const created = new Date(s.created * 1000)
    console.log(
      `${DRY ? 'would add' : 'adding  '}  ${created.toISOString().slice(0, 10)}  ` +
        `${((s.amount_total ?? 0) / 100).toFixed(2)} ${(s.currency ?? 'usd').toUpperCase()}  ` +
        `${rule.kind.padEnd(16)} ${email}`,
    )

    if (!DRY) {
      await db`
        INSERT INTO orders (
          stripe_session_id, email, customer_name,
          variant, size, amount_total, currency,
          kind, quantity, description, buyer_kind, buyer_ref, status, created_at
        ) VALUES (
          ${s.id}, ${email}, ${s.customer_details?.name ?? null},
          NULL, NULL, ${s.amount_total ?? 0}, ${s.currency ?? 'usd'},
          ${rule.kind}, ${quantity}, ${rule.label(quantity)},
          ${rule.buyer}, ${meta.orgId ?? meta.teamId ?? meta.userId ?? email},
          'paid', ${created}
        )
        ON CONFLICT (stripe_session_id) DO NOTHING
      `
    }
    added++
  }

  console.log(
    `\n${DRY ? 'would add' : 'added'} ${added}` +
      ` | already recorded ${skippedExisting}` +
      ` | physical/class (webhook owns these) ${skippedBall}` +
      ` | no email ${skippedNoEmail}` +
      ` | settled sessions seen ${settled.length}`,
  )
  await db.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

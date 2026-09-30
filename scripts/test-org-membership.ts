/**
 * Org-sponsored membership integration sweep — LOCAL QA DATABASE ONLY.
 *
 *   npx tsx --env-file=.env.local scripts/test-org-membership.ts
 *
 * Refuses to run unless DATABASE_URL points at localhost:5433. Talks to the
 * dev server at QA_BASE (default http://localhost:3100) for the HTTP checks.
 * Stripe is never called: lib-level checks use a recording fake
 * (setMembershipStripeForTests); the dev server uses the local double
 * (lib/org-membership-stripe.ts, active only for the literal mock key).
 *
 * Seeds its own org/teams/players with a unique suffix and deletes them at
 * the end.
 */
import bcrypt from 'bcryptjs'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { NextRequest } from 'next/server'

const DBURL = process.env.DATABASE_URL ?? ''
if (!/@localhost:5433\//.test(DBURL)) {
  console.error('Refusing to run: DATABASE_URL is not the local QA database (localhost:5433).')
  process.exit(2)
}
const BASE = process.env.QA_BASE ?? 'http://localhost:3100'
// The local Resend mock's send log (one JSON line per email).
const MAIL_INDEX = process.env.QA_MAIL_INDEX ??
  '/private/tmp/claude-501/-Users-joseph-Basketball-AI-formcoach/eaf91bb7-654c-49f9-b968-95d39be732cd/scratchpad/qa/mail/index.jsonl'
function mailsTo(email: string): Array<{ subject: string }> {
  if (!fs.existsSync(MAIL_INDEX)) return []
  return fs.readFileSync(MAIL_INDEX, 'utf8').split('\n').filter(Boolean)
    .map((l) => { try { return JSON.parse(l) as { to: string | string[]; subject: string } } catch { return null } })
    .filter((m): m is { to: string | string[]; subject: string } => !!m && [m.to].flat().includes(email))
}

let pass = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail: unknown = '') {
  if (ok) pass++
  else failures.push(`${name}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`)
}
async function rejects(fn: () => Promise<unknown>, status: number, code?: string): Promise<boolean> {
  try {
    await fn()
    return false
  } catch (err) {
    const e = err as { status?: number; code?: string }
    return e.status === status && (code === undefined || e.code === code)
  }
}

async function main() {
  const { db } = await import('../lib/db')
  const om = await import('../lib/org-membership')
  const stripeMod = await import('../lib/org-membership-stripe')
  const ent = await import('../lib/player-entitlement')
  const sub = await import('../lib/player-subscription')
  const inApp = await import('../lib/in-app')
  const grants = await import('../lib/token-grants')

  // --- recording Stripe fake -------------------------------------------------------
  const calls: Array<{ op: string; args: unknown }> = []
  let seq = 0
  const sfxOuter = Date.now().toString(36)
  stripeMod.setMembershipStripeForTests({
    async createCheckout(params) {
      stripeMod.assertStripeMetadataLimits(params.metadata as Record<string, unknown>)
      calls.push({ op: 'create', args: params })
      return { id: `cs_test_fake_${sfxOuter}_${++seq}`, url: `https://checkout.test/${seq}` }
    },
    async retrieveCheckout() {
      throw new Error('not used')
    },
    async pauseSubscription(id, resumesAt) {
      calls.push({ op: 'pause', args: { id, resumesAt: resumesAt.toISOString() } })
    },
    async resumeSubscription(id) {
      calls.push({ op: 'resume', args: { id } })
    },
  })

  const sfx = `mt${Date.now().toString(36)}`
  const pw = 'Membership-QA-2026'
  const hash = await bcrypt.hash(pw, 4)
  const created = { orgs: [] as string[], teams: [] as string[], users: [] as string[] }

  const mkOrg = async (name: string) => {
    const [o] = (await db`
      INSERT INTO organizations (name, admin_email, password_hash, access_code, subscription_status, subscription_tier)
      VALUES (${name}, ${`${name.toLowerCase().replace(/\W+/g, '')}-${sfx}@orgs.test`}, ${hash}, ${`O${sfx}${created.orgs.length}`.slice(0, 20).toUpperCase()}, 'active', 'plus')
      RETURNING id, admin_email
    `) as unknown as [{ id: string; admin_email: string }]
    created.orgs.push(o.id)
    return o
  }
  const mkTeam = async (orgId: string, name: string, credits: number) => {
    const [t] = (await db`
      INSERT INTO teams (name, admin_email, password_hash, access_code, organization_id, credits)
      VALUES (${name}, ${`coach-${created.teams.length}-${sfx}@coaches.test`}, ${hash}, ${`T${sfx}${created.teams.length}`.slice(0, 20).toUpperCase()}, ${orgId}, ${credits})
      RETURNING id, access_code
    `) as unknown as [{ id: string; access_code: string }]
    created.teams.push(t.id)
    return t
  }
  const mkUser = async (tag: string, fields: Record<string, unknown> = {}, teamId?: string, lastInitial = 'Q') => {
    const [u] = (await db`
      INSERT INTO users (email, password_hash, first_name, last_initial, email_verified_at, analysis_tokens)
      VALUES (${`${tag.toLowerCase()}-${sfx}@parents.test`}, ${fields.noPassword ? null : hash}, ${tag}, ${lastInitial}, NOW(), 0)
      RETURNING id, email
    `) as unknown as [{ id: string; email: string }]
    created.users.push(u.id)
    const f = { ...fields }
    delete f.noPassword
    if (Object.keys(f).length > 0) await db`UPDATE users SET ${db(f)} WHERE id = ${u.id}`
    if (teamId) {
      await db`INSERT INTO team_memberships (user_id, team_id, first_name, last_name_initial) VALUES (${u.id}, ${teamId}, ${tag}, ${lastInitial})`
    }
    return u
  }

  try {
    const org = await mkOrg('Membership QA Club')
    const other = await mkOrg('Other QA Club')
    const team = await mkTeam(org.id, 'MQA U14', 5)
    const team2 = await mkTeam(other.id, 'Other U14', 0)
    const day = 86_400_000
    const A = await mkUser('Ava', {}, team.id)
    const B = await mkUser('Ben', { plan: 'player', plan_status: 'active', plan_interval: 'monthly', plan_anchor: new Date(Date.now() - 10 * day), stripe_subscription_id: 'sub_test_B' }, team.id)
    const C = await mkUser('Cal', { plan: 'pro', plan_status: 'active', plan_interval: 'monthly', plan_anchor: new Date(Date.now() - 3 * day) }, team.id)
    const D = await mkUser('Dee', { subscription_type: 'monthly', subscription_expires_at: new Date(Date.now() + 365 * day) }, team.id)
    const E = await mkUser('Eli', {}, team2.id)
    const F = await mkUser('Fay', {}, team.id)
    const G = await mkUser('Gus', { noPassword: true, roster_pending: true }, team.id)
    const H = await mkUser('Hal', {}, team.id, 'Z')

    // --- 1. pure resolver ------------------------------------------------------------
    const now = new Date()
    const baseUser = { subscription_type: null, subscription_expires_at: null, plan: null, plan_status: null, plan_anchor: null, plan_period_end: null, stripe_subscription_id: null }
    const seat = (plan: string, startOff = -day, endOff = 30 * day) => ({ id: 's1', org_id: 'o1', org_name: 'Club', plan, starts_at: new Date(now.getTime() + startOff), ends_at: new Date(now.getTime() + endOff), anchor_at: null })
    let r = ent.resolveEffectivePlan({ ...baseUser, plan: 'player', plan_status: 'active', plan_anchor: now, stripe_subscription_id: 'sub_x' }, [seat('player')], now)
    check('tie → org wins', r.source === 'org' && r.plan === 'player' && r.billedVia === 'org' && r.personal?.billedVia === 'stripe', r)
    r = ent.resolveEffectivePlan({ ...baseUser, plan: 'pro', plan_status: 'active', plan_anchor: now }, [seat('player')], now)
    check('personal Pro beats Player seat', r.source === 'personal' && r.plan === 'pro' && r.billedVia === 'apple', r)
    r = ent.resolveEffectivePlan({ ...baseUser, plan: 'player', plan_status: 'active', plan_anchor: now }, [seat('pro')], now)
    check('Pro seat beats personal Player', r.source === 'org' && r.plan === 'pro', r)
    r = ent.resolveEffectivePlan({ ...baseUser, subscription_type: 'monthly', subscription_expires_at: new Date(now.getTime() + day) }, [seat('pro')], now)
    check('legacy wins, plan null', r.source === 'legacy' && r.plan === null && r.billedVia === 'legacy', r)
    r = ent.resolveEffectivePlan(baseUser, [seat('pro', 5 * day, 90 * day)], now)
    check('future seat = upcoming only', r.source === null && r.upcomingSeat?.plan === 'pro', r)
    r = ent.resolveEffectivePlan({ ...baseUser, plan: 'pro', plan_status: 'canceled', plan_anchor: now }, [], now)
    check('canceled personal = none', r.source === null && r.personal === null, r)

    // --- 2. ordering rules ------------------------------------------------------------
    const today = new Date().toISOString().slice(0, 10)
    const base = { orgId: org.id, createdBy: org.admin_email, plan: 'player', term: 'm3', startDate: today, currency: 'usd' }
    check('9 seats fresh → 400', await rejects(() => om.createMembershipOrder({ ...base, seats: 9 }), 400))
    check('start 61 days out → 400', await rejects(() => om.createMembershipOrder({ ...base, seats: 10, startDate: new Date(Date.now() + 62 * day).toISOString().slice(0, 10) }), 400))
    check('bad date → 400', await rejects(() => om.createMembershipOrder({ ...base, seats: 10, startDate: '2026-02-31' }), 400))
    check('player off-org → 403', await rejects(() => om.createMembershipOrder({ ...base, seats: 10, userIds: [E.id] }), 403, 'not_your_player'))
    check('legacy player → 409', await rejects(() => om.createMembershipOrder({ ...base, seats: 10, userIds: [D.id] }), 409, 'has_better_plan'))
    check('own Pro vs Player seat → 409', await rejects(() => om.createMembershipOrder({ ...base, seats: 10, userIds: [C.id] }), 409, 'has_better_plan'))
    check('more players than seats → 400', await rejects(() => om.createMembershipOrder({ ...base, seats: 10, userIds: Array(11).fill(A.id).map((x, i) => (i ? `${x.slice(0, -2)}${String(i).padStart(2, '0')}` : x)) }), 400))

    const { order, quote } = await om.createMembershipOrder({ ...base, seats: 12, userIds: [A.id, B.id] })
    check('order priced tier 10 $42', quote.tier === 10 && order.unit_cents === 4200 && order.total_cents === 12 * 4200, order)
    const [pend] = (await db`SELECT COUNT(*)::int AS n FROM org_membership_seats WHERE order_id = ${order.id} AND status = 'pending_payment'`) as unknown as [{ n: number }]
    check('12 pending_payment seats', pend.n === 12)
    check('pending seats not live', (await om.liveSeatCount(org.id)) === 0)

    const url = await om.createMembershipCheckout(order, org.admin_email)
    const createCall = calls.find((c) => c.op === 'create')!.args as { metadata: Record<string, string>; mode: string; success_url: string; line_items: Array<{ quantity: number; price_data: { unit_amount: number } }> }
    check('checkout url', url.startsWith('https://checkout.test/'))
    check('metadata ONLY type+orderId', JSON.stringify(createCall.metadata) === JSON.stringify({ type: 'org_membership_purchase', orderId: order.id }), createCall.metadata)
    check('mode payment, 12 × $42', createCall.mode === 'payment' && createCall.line_items[0].quantity === 12 && createCall.line_items[0].price_data.unit_amount === 4200)
    check('success_url carries session id', createCall.success_url.includes('membership_session={CHECKOUT_SESSION_ID}'))

    // --- 3. completion idempotency (the webhook handler, fed a fake session) ---------------
    const [{ stripe_session_id: sessId }] = (await db`SELECT stripe_session_id FROM org_membership_orders WHERE id = ${order.id}`) as unknown as [{ stripe_session_id: string }]
    const fakeSession = { id: sessId, metadata: { type: 'org_membership_purchase', orderId: order.id }, payment_status: 'paid' as const, amount_total: order.total_cents, currency: 'usd', payment_intent: `pi_test_${sfx}`, customer_details: { email: org.admin_email } }
    const unpaid = await om.completeMembershipOrder({ ...fakeSession, payment_status: 'unpaid' })
    check('unpaid → not applied', !unpaid.applied && unpaid.reason === 'unpaid')
    const first = await om.completeMembershipOrder(fakeSession)
    check('first completion applies', first.applied && first.order?.status === 'paid', first)
    const second = await om.completeMembershipOrder(fakeSession)
    check('redelivery no-ops', !second.applied && second.reason === 'already_processed', second)
    const wrong = await om.completeMembershipOrder({ ...fakeSession, id: 'cs_test_other' })
    check('other session for same order refused', !wrong.applied && wrong.reason === 'session_mismatch', wrong)
    const statuses = (await db`SELECT status, COUNT(*)::int AS n FROM org_membership_seats WHERE order_id = ${order.id} GROUP BY status ORDER BY status`) as unknown as Array<{ status: string; n: number }>
    check('2 assigned + 10 unassigned', JSON.stringify(statuses) === JSON.stringify([{ status: 'assigned', n: 2 }, { status: 'unassigned', n: 10 }]), statuses)
    check('live seats = 12', (await om.liveSeatCount(org.id)) === 12)
    const [purchase] = (await db`SELECT kind, quantity FROM orders WHERE stripe_session_id = ${sessId}`) as unknown as [{ kind: string; quantity: number } | undefined]
    check('recorded in orders ledger once', purchase?.kind === 'org_memberships' && purchase.quantity === 12, purchase)

    const pauseB = calls.find((c) => c.op === 'pause')
    check('B personal Stripe plan paused until seat end', !!pauseB && (pauseB.args as { id: string }).id === 'sub_test_B', calls.map((c) => c.op))
    const [bSeat] = (await db`SELECT paused_stripe_sub_id FROM org_membership_seats WHERE user_id = ${B.id} AND status = 'assigned'`) as unknown as [{ paused_stripe_sub_id: string | null }]
    check('paused_stripe_sub_id stored', bSeat?.paused_stripe_sub_id === 'sub_test_B')

    let eA = await ent.effectivePlan(A.id)
    check('A covered by org', eA.source === 'org' && eA.plan === 'player' && eA.orgName === 'Membership QA Club' && eA.billedVia === 'org', eA)
    const eB = await ent.effectivePlan(B.id)
    check('B tie → org, personal still visible', eB.source === 'org' && eB.personal?.plan === 'player', eB)

    // --- 4. top-up tiering ---------------------------------------------------------------
    const topUp = await om.createMembershipOrder({ ...base, plan: 'pro', term: 'm6', seats: 13 })
    check('top-up 12 live + 13 → tier 25 Pro 6mo $119', topUp.quote.tier === 25 && topUp.order.unit_cents === 11900, topUp.quote)
    const small = await om.createMembershipOrder({ ...base, seats: 3 })
    check('top-up of 3 allowed with 12 live', small.order.seats === 3 && small.quote.tier === 10)
    await db`DELETE FROM org_membership_orders WHERE id IN (${topUp.order.id}, ${small.order.id})`

    // --- 5. assign / unassign rules --------------------------------------------------------
    const free = async () => ((await db`SELECT id FROM org_membership_seats WHERE order_id = ${order.id} AND status = 'unassigned' ORDER BY id LIMIT 1`) as unknown as [{ id: string }])[0].id
    check('unknown seat → 404', await rejects(() => om.assignSeat(org.id, '00000000-0000-0000-0000-000000000000', A.id), 404))
    check('A again → 409', await rejects(async () => om.assignSeat(org.id, await free(), A.id), 409, 'already_covered'))
    check('C (own Pro) → 409', await rejects(async () => om.assignSeat(org.id, await free(), C.id), 409, 'has_better_plan'))
    check('D (legacy) → 409', await rejects(async () => om.assignSeat(org.id, await free(), D.id), 409, 'has_better_plan'))
    check('E (other org) → 403', await rejects(async () => om.assignSeat(org.id, await free(), E.id), 403, 'not_your_player'))
    check('other org cannot touch seat → 404', await rejects(async () => om.assignSeat(other.id, await free(), E.id), 404))
    const gSeatId = await free()
    const gSeat = await om.assignSeat(org.id, gSeatId, G.id)
    check('roster_pending stub assignable', gSeat.status === 'assigned' && gSeat.user_id === G.id)
    const firstAnchor = new Date(gSeat.anchor_at!).getTime()
    const back = await om.unassignSeat(org.id, gSeatId)
    check('unassign → back to pool', back.status === 'unassigned' && back.user_id === null)
    check('unassign unassigned → 409', await rejects(() => om.unassignSeat(org.id, gSeatId), 409))
    await new Promise((res) => setTimeout(res, 20))
    const again = await om.assignSeat(org.id, gSeatId, G.id, { notify: false })
    check('re-assign keeps usage anchor', new Date(again.anchor_at!).getTime() === firstAnchor)

    // --- 5b. move a covered player to another seat: one step, ONE email --------------------
    check('mail index present', fs.existsSync(MAIL_INDEX), MAIL_INDEX)
    const heldBy = async (userId: string) => ((await db`SELECT * FROM org_membership_seats WHERE user_id = ${userId} AND status = 'assigned'`) as unknown as [{ id: string; anchor_at: Date; paused_stripe_sub_id: string | null; pause_checked_at: Date | null }])[0]
    const aFrom = await heldBy(A.id)
    const aTo = await free()
    const aMailsBefore = mailsTo(A.email).length
    const movedA = await om.moveSeat(org.id, A.id, aTo)
    const aMails = mailsTo(A.email).slice(aMailsBefore)
    check('move: A holds the new seat', movedA.id === aTo && movedA.status === 'assigned' && movedA.user_id === A.id, movedA)
    check('move: usage anchor carried over', new Date(movedA.anchor_at!).getTime() === new Date(aFrom.anchor_at).getTime())
    const [aOld] = (await db`SELECT status, user_id FROM org_membership_seats WHERE id = ${aFrom.id}`) as unknown as [{ status: string; user_id: string | null }]
    check('move: old seat back in the pool', aOld.status === 'unassigned' && aOld.user_id === null, aOld)
    check('move: exactly one email to the player', aMails.length === 1, aMails.map((m) => m.subject))
    check('move: it says "now covers your … through …"', /^Membership QA Club now covers your LearnHoops Player membership through \w+ \d+, \d{4}$/.test(aMails[0]?.subject ?? ''), aMails[0]?.subject)
    check('move: no "no longer covers" email', !aMails.some((m) => /no longer covers/.test(m.subject)))
    const [aHist] = (await db`SELECT reason FROM org_membership_seat_history WHERE seat_id = ${aFrom.id} AND user_id = ${A.id} ORDER BY assigned_at DESC LIMIT 1`) as unknown as [{ reason: string }]
    check('move: history reason = moved', aHist?.reason === 'moved', aHist)
    check('move: A still covered by org', (await ent.effectivePlan(A.id)).source === 'org')

    const bFrom = await heldBy(B.id)
    const bCalls = calls.length
    const bMailsBefore = mailsTo(B.email).length
    const movedB = await om.moveSeat(org.id, B.id, await free())
    const bMails = mailsTo(B.email).slice(bMailsBefore)
    check('move: paused personal Stripe plan stays paused on the new seat', bFrom.paused_stripe_sub_id === 'sub_test_B' && movedB.paused_stripe_sub_id === 'sub_test_B' && !!movedB.pause_checked_at, movedB)
    check('move: no resume / re-pause call (same end date)', !calls.slice(bCalls).some((c) => c.op === 'resume' || c.op === 'pause'), calls.slice(bCalls))
    check('move: B gets one email (no paused/resumed/removed mail)', bMails.length === 1 && /now covers/.test(bMails[0].subject), bMails.map((m) => m.subject))

    check('move: player with no seat → 409', await rejects(async () => om.moveSeat(org.id, F.id, await free()), 409, 'seat_unavailable'))
    check('move: to a taken seat → 409', await rejects(async () => om.moveSeat(org.id, A.id, (await heldBy(G.id)).id), 409, 'seat_unavailable'))
    check('move: to own seat → 409', await rejects(async () => om.moveSeat(org.id, A.id, aTo), 409, 'seat_unavailable'))
    check('move: other org → 409 (holds none of theirs)', await rejects(async () => om.moveSeat(other.id, A.id, aFrom.id), 409))
    check('move: unknown seat → 404', await rejects(() => om.moveSeat(org.id, A.id, '00000000-0000-0000-0000-000000000000'), 404))

    // Take back + give again within the move window: the covered email reads as a move.
    const aNow = await heldBy(A.id)
    await om.unassignSeat(org.id, aNow.id, { reason: 'unassigned' })
    const aMails2Before = mailsTo(A.email).length
    await om.assignSeat(org.id, await free(), A.id)
    const aMails2 = mailsTo(A.email).slice(aMails2Before)
    check('take back + give within 10 min → "now covers" wording', aMails2.length === 1 && /now covers your/.test(aMails2[0].subject), aMails2.map((m) => m.subject))
    const lateMailsBefore = mailsTo(F.email).length
    const fFirst = await om.assignSeat(org.id, await free(), F.id)
    check('first-ever give → "is covering" wording', /is covering your/.test(mailsTo(F.email).slice(lateMailsBefore)[0]?.subject ?? ''))
    await om.unassignSeat(org.id, fFirst.id, { notify: false })

    // --- 6. reservation: caps across both sources ---------------------------------------------
    const mkSub = async (userId: string, source: string | null = null, status = 'processing') => {
      const [s] = (await db`
        INSERT INTO submissions (token, status, user_id, entitlement_source, created_at)
        VALUES (${`${sfx}-${Math.random().toString(36).slice(2)}`}, ${status}, ${userId}, ${source}, NOW())
        RETURNING id
      `) as unknown as [{ id: string }]
      return s.id
    }
    const r1 = await sub.reserveSubscriptionAnalysis(A.id, await mkSub(A.id))
    const r2 = await sub.reserveSubscriptionAnalysis(A.id, await mkSub(A.id))
    const r3 = await sub.reserveSubscriptionAnalysis(A.id, await mkSub(A.id))
    check('A 1st+2nd included (org_membership)', r1.ok && r2.ok && r1.source === 'org_membership', { r1, r2 })
    check('A 3rd blocked weekly', !r3.ok && r3.reason === 'weekly', r3)
    const [{ n: stamped }] = (await db`SELECT COUNT(*)::int AS n FROM submissions WHERE user_id = ${A.id} AND entitlement_source = 'org_membership'`) as unknown as [{ n: number }]
    check('stamps = org_membership', stamped === 2)

    const fSeat = await om.assignSeat(org.id, await free(), F.id, { notify: false })
    await mkSub(F.id, 'subscription', 'complete') // usage from a personal plan earlier in the window
    const f1 = await sub.reserveSubscriptionAnalysis(F.id, await mkSub(F.id))
    const f2 = await sub.reserveSubscriptionAnalysis(F.id, await mkSub(F.id))
    check('F: personal-stamped row counts against the seat', f1.ok && !f2.ok && (f2 as { reason: string }).reason === 'weekly', { f1, f2 })

    // --- 7. /api/analyze over HTTP --------------------------------------------------------
    const hSeatId = await free()
    await om.assignSeat(org.id, hSeatId, H.id, { notify: false })
    const frameDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mqa-'))
    const frames = (tag: number) => {
      const dir = path.join(frameDir, String(tag))
      fs.mkdirSync(dir)
      // Same source as the QA harness's upload.sh (the grader stub accepts it);
      // the hue shift makes every call's frames unique so the frames-hash
      // cache never reuses an earlier result.
      const hue = (Date.now() / 1000 + tag * 47) % 360
      execFileSync('/opt/homebrew/bin/ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', `testsrc2=size=320x240:duration=1,hue=h=${hue.toFixed(2)}`, '-frames:v', '8', path.join(dir, 'f%02d.jpg')])
      return fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f)))
    }
    const form = (tag: number, extra: Record<string, string> = {}) => {
      const fd = new FormData()
      for (const buf of frames(tag)) fd.append('frames', new Blob([new Uint8Array(buf)], { type: 'image/jpeg' }), 'f.jpg')
      for (const [k, v] of Object.entries(extra)) fd.append(k, v)
      return fd
    }
    const login = async (email: string) => {
      const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: pw }) })
      const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).filter((c) => !/=$/.test(c)).join('; ')
      if (!cookie) console.log('[test] login gave no cookie', email, res.status, await res.text())
      return cookie
    }
    const hCookie = await login(H.email)
    const own = await fetch(`${BASE}/api/analyze`, { method: 'POST', headers: { cookie: hCookie }, body: form(1) })
    const ownBody = (await own.json().catch(() => ({}))) as Record<string, unknown>
    const [hRow] = (await db`SELECT entitlement_source, status FROM submissions WHERE user_id = ${H.id} ORDER BY created_at DESC LIMIT 1`) as unknown as [{ entitlement_source: string; status: string } | undefined]
    check('covered player own upload → 200', own.status === 200, { status: own.status, ownBody })
    check('stamped org_membership', hRow?.entitlement_source === 'org_membership', hRow)

    const [{ credits: before }] = (await db`SELECT credits FROM teams WHERE id = ${team.id}`) as unknown as [{ credits: number }]
    const coachUp = await fetch(`${BASE}/api/analyze`, { method: 'POST', body: form(2, { teamCode: team.access_code, playerFirstName: 'Hal', playerLastName: 'Z' }) })
    const [{ credits: after }] = (await db`SELECT credits FROM teams WHERE id = ${team.id}`) as unknown as [{ credits: number }]
    const [coachRow] = (await db`SELECT entitlement_source FROM submissions WHERE user_id = ${H.id} AND team_id = ${team.id} ORDER BY created_at DESC LIMIT 1`) as unknown as [{ entitlement_source: string } | undefined]
    check('team upload for covered player → 200', coachUp.status === 200, { s: coachUp.status, b: await coachUp.clone().text() })
    check('team upload charged team tokens, not the seat', after === before - 1 && coachRow?.entitlement_source === 'team_credit', { before, after, coachRow })
    const hUsage = await sub.getSubscriptionUsage(H.id, (await ent.effectivePlan(H.id)) as { anchor: Date })
    check('seat usage counts only the own upload', hUsage.weeklyUsed === 1, hUsage)

    const aCookie = await login(A.email)
    const capped = await fetch(`${BASE}/api/analyze`, { method: 'POST', headers: { cookie: aCookie }, body: form(3) })
    const cappedBody = (await capped.json().catch(() => ({}))) as { error?: string }
    check('A at weekly cap, no tokens → 402 limit_reached', capped.status === 402 && cappedBody.error === 'limit_reached', { s: capped.status, cappedBody })

    // --- 8. native app / Bearer guard ------------------------------------------------------
    const mkReq = (h: Record<string, string>) => new NextRequest('http://localhost/api/org/memberships/checkout', { method: 'POST', headers: h })
    check('native UA → 403', inApp.rejectNativeAppPurchase(mkReq({ 'user-agent': 'LearnHoops/41 CFNetwork/1498 Darwin/24' }))?.status === 403)
    check('WebView UA → 403', inApp.rejectNativeAppPurchase(mkReq({ 'user-agent': 'Mozilla/5.0 LearnHoopsApp' }))?.status === 403)
    check('Bearer → 403', inApp.rejectNativeAppPurchase(mkReq({ authorization: 'Bearer abc', 'user-agent': 'Mozilla/5.0' }))?.status === 403)
    check('browser → allowed', inApp.rejectNativeAppPurchase(mkReq({ 'user-agent': 'Mozilla/5.0 (Macintosh)' })) === null)

    const orgCookie = await login(org.admin_email)
    const post = (p: string, body: unknown, headers: Record<string, string> = {}) =>
      fetch(`${BASE}${p}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: orgCookie, ...headers }, body: JSON.stringify(body) })
    const coBody = { plan: 'pro', term: 'm12', seats: 10, startDate: today }
    check('HTTP checkout w/ Bearer → 403', (await post('/api/org/memberships/checkout', coBody, { authorization: 'Bearer x' })).status === 403)
    check('HTTP checkout native UA → 403', (await post('/api/org/memberships/checkout', coBody, { 'user-agent': 'LearnHoops/41 CFNetwork/1498' })).status === 403)
    check('HTTP assign native UA → 403', (await post('/api/org/memberships/assign', { seatId: gSeatId, userId: G.id }, { 'user-agent': 'LearnHoops/41 CFNetwork/1498' })).status === 403)
    check('HTTP no session → 401', (await fetch(`${BASE}/api/org/memberships`)).status === 401)

    // --- 9. HTTP routes end to end (dev server's local Stripe double) ---------------------------
    const ov = (await (await fetch(`${BASE}/api/org/memberships`, { headers: { cookie: orgCookie } })).json()) as {
      liveSeats: number; summary: { assigned: number; unassigned: number }; players: Array<{ userId: string | null; assignable: boolean; reason?: string; coverage: { source: string | null } }>; seats: unknown[]; orders: unknown[]
    }
    check('GET overview: 12 live, 5 assigned', ov.liveSeats === 12 && ov.summary.assigned === 5 && ov.summary.unassigned === 7, ov.summary)
    const pl = (id: string) => ov.players.find((p) => p.userId === id)
    check('GET players: reasons', pl(A.id)?.reason === 'already_covered' && pl(D.id)?.reason === 'has_better_plan' && pl(C.id)?.assignable === true && pl(A.id)?.coverage.source === 'org', { A: pl(A.id), C: pl(C.id), D: pl(D.id) })
    const q = (await (await post('/api/org/memberships/quote', { plan: 'player', term: 'm12', seats: 13 })).json()) as { tier: number; unitCents: number; currency: string }
    check('HTTP quote top-up → tier 25 $135', q.tier === 25 && q.unitCents === 13500 && !!q.currency, q)
    check('HTTP quote top-up of 1 ok with 12 live', (await post('/api/org/memberships/quote', { plan: 'player', term: 'm3', seats: 1 })).status === 200)
    const co = await post('/api/org/memberships/checkout', { ...coBody, userIds: [C.id] })
    const coJson = (await co.json()) as { url?: string; error?: string }
    check('HTTP checkout → url', co.status === 200 && !!coJson.url, coJson)
    const sid = new URL(coJson.url ?? 'http://x/').searchParams.get('membership_session') ?? ''
    const c1 = (await (await post('/api/org/memberships/complete', { sessionId: sid })).json()) as { applied?: boolean; order?: { status: string } }
    const c2 = (await (await post('/api/org/memberships/complete', { sessionId: sid })).json()) as { applied?: boolean }
    check('HTTP complete applies once', c1.applied === true && c1.order?.status === 'paid' && c2.applied === false, { c1, c2 })
    const eC = await ent.effectivePlan(C.id)
    check('C (own Pro, Apple) got Pro seat → org', eC.source === 'org' && eC.plan === 'pro' && eC.personal?.billedVia === 'apple', eC)
    const cSeat = ((await db`SELECT id FROM org_membership_seats WHERE user_id = ${C.id} AND status = 'assigned'`) as unknown as [{ id: string }])[0]
    const un = await post('/api/org/memberships/unassign', { seatId: cSeat.id })
    check('HTTP unassign → 200', un.status === 200)
    const as = await post('/api/org/memberships/assign', { seatId: cSeat.id, userId: C.id })
    check('HTTP assign → 200', as.status === 200, await as.clone().text())
    check('HTTP assign taken seat → 409', (await post('/api/org/memberships/assign', { seatId: cSeat.id, userId: F.id })).status === 409)
    const [cTo] = (await db`SELECT id FROM org_membership_seats WHERE org_id = ${org.id} AND plan = 'pro' AND status = 'unassigned' AND starts_at <= NOW() LIMIT 1`) as unknown as [{ id: string }]
    check('HTTP move native UA → 403', (await post('/api/org/memberships/move', { seatId: cTo.id, userId: C.id }, { 'user-agent': 'LearnHoops/41 CFNetwork/1498' })).status === 403)
    const cMailsBefore = mailsTo(C.email).length
    const mv = await post('/api/org/memberships/move', { seatId: cTo.id, userId: C.id })
    const mvJson = (await mv.json()) as { seat?: { id: string; userId: string; plan: string } }
    const cMails = mailsTo(C.email).slice(cMailsBefore)
    check('HTTP move → 200, C on the new seat', mv.status === 200 && mvJson.seat?.id === cTo.id && mvJson.seat.userId === C.id, mvJson)
    check('HTTP move: one email, App Store steps not re-sent', cMails.length === 1 && /now covers your LearnHoops Pro membership/.test(cMails[0].subject), cMails.map((m) => m.subject))
    check('HTTP move: old seat free again', ((await db`SELECT status FROM org_membership_seats WHERE id = ${cSeat.id}`) as unknown as [{ status: string }])[0].status === 'unassigned')

    // --- 10. buy-player-tokens: 30 players, no ids in metadata, ownership enforced ----------------
    const thirty: string[] = []
    for (let i = 0; i < 30; i++) thirty.push((await mkUser(`P${i}`, {}, team.id)).id)
    const bad = await post('/api/org/buy-player-tokens', { playerUserIds: [...thirty.slice(0, 3), E.id], quantity: 2, teamId: team.id })
    check('org buy-player-tokens with foreign player → 403', bad.status === 403, bad.status)
    const good = await post('/api/org/buy-player-tokens', { playerUserIds: thirty, quantity: 2, teamId: team.id })
    const goodJson = (await good.json()) as { url?: string; error?: string }
    check('org buy-player-tokens × 30 → 200 (metadata limits enforced by the double)', good.status === 200 && !!goodJson.url, goodJson)
    const [grant] = (await db`SELECT id, stripe_session_id, recipient_user_ids FROM pending_token_grants WHERE buyer_ref = ${org.id} ORDER BY created_at DESC LIMIT 1`) as unknown as [{ id: string; stripe_session_id: string; recipient_user_ids: string[] }]
    check('recipients stored server-side', grant?.recipient_user_ids.length === 30 && !!grant.stripe_session_id)
    const grantSession = { id: grant.stripe_session_id, metadata: { type: 'team_token_grant', grantId: grant.id, tokensEach: '2' }, customer_details: { email: org.admin_email }, amount_total: 0, currency: 'usd' }
    const g1 = await grants.fulfillTokenGrant(grantSession as never)
    const g2 = await grants.fulfillTokenGrant(grantSession as never)
    const [{ total }] = (await db`SELECT SUM(analysis_tokens)::int AS total FROM users WHERE id = ANY(${thirty}::uuid[])`) as unknown as [{ total: number }]
    check('grant applied once, 30 × 2 tokens', g1 === 'granted' && g2 === 'already_processed' && total === 60, { g1, g2, total })
    // Legacy metadata shape would have been 30 × 37 chars:
    check('legacy id list would have broken Stripe', thirty.join(',').length > 500)

    const teamCookie = await login((await db`SELECT admin_email FROM teams WHERE id = ${team.id}`.then((r) => (r as unknown as [{ admin_email: string }])[0])).admin_email)
    if (teamCookie.includes('fc_team_session')) {
      const tp = (body: unknown) => fetch(`${BASE}/api/team/buy-player-tokens`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: teamCookie }, body: JSON.stringify(body) })
      check('team buy-player-tokens foreign → 403', (await tp({ playerUserIds: [thirty[0], E.id], quantity: 1 })).status === 403)
      check('team buy-player-tokens × 30 → 200', (await tp({ playerUserIds: thirty, quantity: 1 })).status === 200)
    } else {
      check('team coach login for buy-player-tokens', false, 'no fc_team_session cookie (login changed?)')
    }

    // --- 11. refunds -----------------------------------------------------------------------------
    const pi = `pi_test_${sfx}`
    const partial = await om.applyMembershipRefund(pi, 2 * order.unit_cents, false)
    const [{ n: refunded2 }] = (await db`SELECT COUNT(*)::int AS n FROM org_membership_seats WHERE order_id = ${order.id} AND status = 'refunded'`) as unknown as [{ n: number }]
    check('partial refund of 2 seats → 2 unassigned seats refunded', partial && refunded2 === 2, refunded2)
    calls.length = 0
    await om.applyMembershipRefund(pi, order.total_cents, true)
    const left = (await db`SELECT status, COUNT(*)::int AS n FROM org_membership_seats WHERE order_id = ${order.id} GROUP BY status`) as unknown as Array<{ status: string; n: number }>
    check('full refund → every seat refunded', left.length === 1 && left[0].status === 'refunded' && left[0].n === 12, left)
    check('full refund resumed B personal plan', calls.some((c) => c.op === 'resume' && (c.args as { id: string }).id === 'sub_test_B'), calls)
    eA = await ent.effectivePlan(A.id)
    check('A no longer covered after refund', eA.source === null, eA)
    check('unknown PI → false', (await om.applyMembershipRefund('pi_not_ours', 100, true)) === false)

    // --- 12. release on leave + cron -------------------------------------------------------------
    const o2 = await om.createMembershipOrder({ ...base, seats: 10, userIds: [F.id] })
    const o2s = (await db`SELECT stripe_session_id FROM org_membership_orders WHERE id = ${o2.order.id}`) as unknown as [{ stripe_session_id: string | null }]
    await om.completeMembershipOrder({ id: o2s[0].stripe_session_id ?? `cs_test_o2_${sfx}`, metadata: { type: 'org_membership_purchase', orderId: o2.order.id }, payment_status: 'paid', amount_total: o2.order.total_cents, currency: 'usd', payment_intent: `pi_test2_${sfx}` })
    check('F reassigned on new order', (await ent.effectivePlan(F.id)).source === 'org')
    check('release while still on a team → 0', (await om.releaseSeatIfLeftOrg(F.id, org.id)) === 0)
    await db`DELETE FROM team_memberships WHERE user_id = ${F.id}`
    check('release after leaving → 1', (await om.releaseSeatIfLeftOrg(F.id, org.id)) === 1)
    check('F uncovered', (await ent.effectivePlan(F.id)).source === null)
    void fSeat

    // Cron: one order 5 days from its end, one past it.
    const o2Seat = await free2(db, o2.order.id)
    await om.assignSeat(org.id, o2Seat, G.id, { notify: false })
    await db`UPDATE org_membership_seats SET ends_at = NOW() + INTERVAL '5 days' WHERE order_id = ${o2.order.id}`
    const c1r = await om.runMembershipCron()
    const c2r = await om.runMembershipCron()
    check('cron: 7-day org reminder sent once', c1r.orgReminders7 >= 1 && c2r.orgReminders7 === 0, { c1r, c2r })
    await db`UPDATE org_membership_seats SET ends_at = NOW() - INTERVAL '1 minute' WHERE order_id = ${o2.order.id}`
    const c3r = await om.runMembershipCron()
    const [{ n: exp }] = (await db`SELECT COUNT(*)::int AS n FROM org_membership_seats WHERE order_id = ${o2.order.id} AND status = 'expired'`) as unknown as [{ n: number }]
    check('cron: ended seats expire', c3r.expiredSeats >= 10 && exp === 10, { c3r, exp })

    // --- 13. personal plans while covered, delete-team release, seat names, last initials ---------
    const cvr = (plan: string) => ent.resolveEffectivePlan(baseUser, [seat(plan)], now)
    const pv = (seatPlan: string, want: 'player' | 'pro') => ent.personalPlanVsClub(cvr(seatPlan), want)
    const proMsg = pv('pro', 'pro')
    check('Pro seat blocks personal Pro and Player', !proMsg.ok && !pv('pro', 'player').ok && /^Your club already covers your Pro membership until \w+ \d+, \d{4}\.$/.test((proMsg as { message: string }).message), proMsg)
    const up = pv('player', 'pro')
    check('Player seat blocks Player, allows Pro with a note', !pv('player', 'player').ok && up.ok && !!(up as { note: string | null }).note, up)
    const pPro = ent.resolveEffectivePlan({ ...baseUser, plan: 'pro', plan_status: 'active', plan_anchor: now }, [seat('player')], now)
    check('own Pro over a Player seat: liveSeat kept, switching down blocked', pPro.source === 'personal' && pPro.liveSeat?.plan === 'player' && !ent.personalPlanVsClub(pPro, 'player').ok, pPro)
    check('no seat → allowed, no note', JSON.stringify(ent.personalPlanVsClub(ent.resolveEffectivePlan(baseUser, [], now), 'pro')) === JSON.stringify({ ok: true, note: null }))

    const o3 = await om.createMembershipOrder({ ...base, seats: 10 })
    const [o3s] = (await db`SELECT stripe_session_id FROM org_membership_orders WHERE id = ${o3.order.id}`) as unknown as [{ stripe_session_id: string | null }]
    await om.completeMembershipOrder({ id: o3s.stripe_session_id ?? `cs_test_o3_${sfx}`, metadata: { type: 'org_membership_purchase', orderId: o3.order.id }, payment_status: 'paid', amount_total: o3.order.total_cents, currency: 'usd', payment_intent: `pi_test3_${sfx}` })
    const team3 = await mkTeam(org.id, 'MQA Gone', 0)
    const I = await mkUser('Ivy', {}, team3.id) // only on the team that gets deleted
    const J = await mkUser('Jon', {}, team3.id) // also on another team of the org
    await db`INSERT INTO team_memberships (user_id, team_id, first_name, last_name_initial) VALUES (${J.id}, ${team.id}, 'Jon', 'Q')`
    const K = await mkUser('Kit', {}, team.id) // siblings sharing one account: Kit + Lou
    await db`INSERT INTO team_memberships (user_id, team_id, first_name, last_name_initial) VALUES (${K.id}, ${team3.id}, 'Lou', 'R')`
    for (const u of [I, J, K]) await om.assignSeat(org.id, await free2(db, o3.order.id), u.id, { notify: false })

    const ov2 = (await (await fetch(`${BASE}/api/org/memberships`, { headers: { cookie: orgCookie } })).json()) as { seats: Array<{ status: string; player: { userId: string; name: string } | null }> }
    const kName = ov2.seats.find((x) => x.status === 'assigned' && x.player?.userId === K.id)?.player?.name
    check('shared-account seat named after both roster entries', kName === 'Lou R. & Kit Q.', kName)

    const iCookie = await login(I.email)
    const subPost = (p: string, body: unknown) => fetch(`${BASE}${p}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: iCookie }, body: JSON.stringify(body) })
    const sPlayer = await subPost('/api/subscribe', { plan: 'player', interval: 'monthly' })
    const sPlayerJson = (await sPlayer.json()) as { error?: string; clubCovered?: boolean }
    check('HTTP subscribe Player while Player seat → 409 plain message', sPlayer.status === 409 && sPlayerJson.clubCovered === true && /^Your club already covers your Player membership until /.test(sPlayerJson.error ?? ''), sPlayerJson)
    const sPro = await subPost('/api/subscribe', { plan: 'pro', interval: 'monthly' })
    const sProJson = (await sPro.json().catch(() => ({}))) as { clubCovered?: boolean }
    check('HTTP subscribe Pro while Player seat → not blocked', sPro.status !== 409 && !sProJson.clubCovered, { s: sPro.status, sProJson })
    const cp = await subPost('/api/player/change-plan', { plan: 'player', interval: 'annual' })
    check('HTTP change-plan to Player while Player seat → 409', cp.status === 409 && ((await cp.json()) as { clubCovered?: boolean }).clubCovered === true)

    const del = await post('/api/org/delete-team', { teamId: team3.id })
    const delJson = (await del.json()) as { deleted?: boolean; seatsReleased?: number }
    check('delete-team → 1 seat released', del.status === 200 && delJson.seatsReleased === 1, delJson)
    check('player only on the deleted team lost the seat', (await ent.effectivePlan(I.id)).source === null)
    check('player still on another team keeps the seat', (await ent.effectivePlan(J.id)).source === 'org' && (await ent.effectivePlan(K.id)).source === 'org')

    const nm = (lastInitial: string) => subPost('/api/account/name', { firstName: 'Ivy', lastInitial })
    const sharp = await nm('ßmith')
    const sharpJson = (await sharp.json()) as { lastInitial?: string }
    check('account/name ß → one character "S"', sharp.status === 200 && sharpJson.lastInitial === 'S', { s: sharp.status, sharpJson })
    const digit = await nm('1')
    check('account/name non-letter → 400 plain message', digit.status === 400 && /must be a letter/.test(((await digit.json()) as { error?: string }).error ?? ''))

    const M = await mkUser('Max')
    await db`UPDATE users SET first_name = NULL, last_initial = NULL WHERE id = ${M.id}`
    const mCookie = await login(M.email)
    const join = (lastInitial: string) => fetch(`${BASE}/api/team/join`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: mCookie }, body: JSON.stringify({ teamCode: team.access_code, firstName: 'Max', lastInitial }) })
    const jBad = await join('-')
    check('team/join non-letter initial → 400', jBad.status === 400, await jBad.clone().text())
    const jOk = await join('ß')
    const [mTm] = (await db`SELECT last_name_initial FROM team_memberships WHERE user_id = ${M.id} AND team_id = ${team.id}`) as unknown as [{ last_name_initial: string } | undefined]
    check('team/join ß → joined as "S"', jOk.status === 200 && mTm?.last_name_initial === 'S', { s: jOk.status, b: await jOk.clone().text(), mTm })

    const markup = await fetch(`${BASE}/api/analyze`, { method: 'POST', body: form(4, { teamCode: team.access_code, playerFirstName: 'Hal', playerLastName: '<b>Z' }) })
    check('public name path: markup last name → 400, not filed as "B."', markup.status === 400, { s: markup.status, b: await markup.clone().text() })
  } catch (err) {
    failures.push(`CRASH: ${err instanceof Error ? `${err.message}\n${err.stack?.split('\n').slice(1, 4).join('\n')}` : String(err)}`)
  } finally {
    stripeMod.setMembershipStripeForTests(null)
    try {
      await db`DELETE FROM processed_stripe_sessions WHERE session_id IN (SELECT stripe_session_id FROM org_membership_orders WHERE org_id = ANY(${created.orgs}::uuid[])) OR session_id IN (SELECT stripe_session_id FROM pending_token_grants WHERE buyer_ref = ANY(${[...created.orgs, ...created.teams]}::uuid[]))`
      await db`DELETE FROM orders WHERE buyer_ref = ANY(${created.orgs.concat(created.teams)}::text[])`.catch(() => undefined)
      await db`DELETE FROM org_membership_orders WHERE org_id = ANY(${created.orgs}::uuid[])`
      await db`DELETE FROM pending_token_grants WHERE buyer_ref = ANY(${[...created.orgs, ...created.teams]}::uuid[])`
      await db`DELETE FROM analysis_charges WHERE submission_id IN (SELECT id FROM submissions WHERE user_id = ANY(${created.users}::uuid[]) OR team_id = ANY(${created.teams}::uuid[]))`
      await db`DELETE FROM criterion_scores WHERE analysis_id IN (SELECT a.id FROM analyses a JOIN submissions s ON s.id = a.submission_id WHERE s.user_id = ANY(${created.users}::uuid[]) OR s.team_id = ANY(${created.teams}::uuid[]))`.catch(() => undefined)
      await db`DELETE FROM analyses WHERE submission_id IN (SELECT id FROM submissions WHERE user_id = ANY(${created.users}::uuid[]) OR team_id = ANY(${created.teams}::uuid[]))`.catch(() => undefined)
      await db`DELETE FROM result_releases WHERE submission_id IN (SELECT id FROM submissions WHERE user_id = ANY(${created.users}::uuid[]) OR team_id = ANY(${created.teams}::uuid[]))`.catch(() => undefined)
      await db`DELETE FROM submissions WHERE user_id = ANY(${created.users}::uuid[]) OR team_id = ANY(${created.teams}::uuid[])`
      await db`DELETE FROM team_players WHERE team_id = ANY(${created.teams}::uuid[])`.catch(() => undefined)
      await db`DELETE FROM teams WHERE id = ANY(${created.teams}::uuid[])`
      await db`DELETE FROM organizations WHERE id = ANY(${created.orgs}::uuid[])`
      await db`DELETE FROM users WHERE id = ANY(${created.users}::uuid[])`
    } catch (err) {
      console.error('cleanup failed (local QA data left behind):', err instanceof Error ? err.message : err)
    }
    await db.end()
  }

  console.log(`\n${pass} passed, ${failures.length} failed`)
  for (const f of failures) console.log(`  FAIL  ${f}`)
  process.exit(failures.length > 0 ? 1 : 0)
}

async function free2(db: typeof import('../lib/db').db, orderId: string): Promise<string> {
  const [r] = (await db`SELECT id FROM org_membership_seats WHERE order_id = ${orderId} AND status = 'unassigned' ORDER BY id LIMIT 1`) as unknown as [{ id: string }]
  return r.id
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

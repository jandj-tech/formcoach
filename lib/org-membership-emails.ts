import { Resend } from 'resend'
import { resolveBaseUrl } from './base-url'
import { NOTIFICATION_FROM } from './email-senders'
import { type MembershipPlan, type MembershipTerm, membershipPerMonthCents, termLabel } from './org-membership-pricing'
import { PLAYER_PLANS } from './player-plans'
import { playerEmailPaused } from './player-email-pause'

/**
 * Emails for org-sponsored player memberships (a club prepays seats and gives
 * them to players on its teams). Kept out of lib/email.ts on purpose.
 *
 * Every one of these is a transactional account or billing notice, so per
 * lib/email-senders.ts they go from NOTIFICATION_FROM with no Reply-To and no
 * List-Unsubscribe headers, and (like receipts, password and token notices)
 * no unsubscribe link in the body: they describe what happened to the
 * recipient's own membership or order.
 *
 * Every string that came from a person (org name, player name) is escaped in
 * the HTML and stripped of line breaks in the subject, so callers pass raw text.
 *
 * Each sender THROWS when Resend reports an error, so a cron can leave a
 * reminder unmarked and retry. Callers that must not fail (webhooks, the
 * assign route) should wrap the call in try/catch and log.
 *
 * Nothing here ever mentions buying in the iOS app. Any "keep going" link
 * points at the website.
 */

export type { MembershipPlan, MembershipTerm }

export interface RenderedEmail {
  subject: string
  text: string
  html: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getResend() {
  return new Resend(process.env.RESEND_API_KEY!)
}

function base(): string {
  return resolveBaseUrl()
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** One line of display text: no control characters, collapsed whitespace. */
function clean(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanSubject(s: string): string {
  return clean(s).slice(0, 200)
}

/** An absolute http(s) link, or the fallback. Never a javascript: or relative URL. */
function safeUrl(url: string | null | undefined, fallback: string): string {
  const u = (url ?? '').trim()
  return /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : fallback
}

function orgLabel(orgName: string): string {
  return clean(orgName) || 'Your organization'
}

function firstName(name: string | null | undefined): string | null {
  const n = clean(name)
  return n ? n.slice(0, 60) : null
}

function planName(plan: MembershipPlan): string {
  return PLAYER_PLANS[plan]?.name ?? 'LearnHoops'
}

/** "up to 5 shot analyses a week, and up to 15 a month" */
function planAllowance(plan: MembershipPlan): string {
  const p = PLAYER_PLANS[plan]
  const week = `up to ${p.weeklyLimit} shot analys${p.weeklyLimit === 1 ? 'is' : 'es'} a week`
  return `${week}, and up to ${p.monthlyLimit} a month`
}

/** Dates are stored as UTC instants; show the UTC calendar day. */
function fmtDate(d: Date): string {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * The last day a seat covers. Seat end instants are EXCLUSIVE (see
 * membershipEndsAt in lib/org-membership-pricing.ts): a seat from Oct 1 ending
 * Apr 1 00:00 UTC is last usable on Mar 31, so coverage reads "through Mar 31".
 */
function fmtLastDay(endsAt: Date): string {
  return fmtDate(new Date(new Date(endsAt).getTime() - 1))
}

function fmtMoney(cents: number, currency: string): string {
  const amount = (Math.round(cents) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const code = clean(currency).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'USD'
  return `$${amount} ${code}`
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

// ---------------------------------------------------------------------------
// Layout (same look as the branded emails in lib/email.ts)
// ---------------------------------------------------------------------------

const P = 'margin:0 0 14px;color:#27272A;font-size:15px;line-height:1.6;'
const SMALL = 'margin:0 0 10px;color:#71717A;font-size:13px;line-height:1.55;'

interface Row {
  label: string
  value: string
  strong?: boolean
}

interface Block {
  /** Plain-text paragraph (escaped for HTML). */
  p?: string
  /** A small grey note. */
  note?: string
  /** A bulleted list. */
  list?: string[]
  /** A numbered list. */
  steps?: string[]
  /** A details table. */
  rows?: Row[]
}

interface LayoutInput {
  subject: string
  /** Shown under the logo (usually the org name). */
  headerSub: string | null
  heading: string
  blocks: Block[]
  button?: { label: string; href: string } | null
  /** Blocks after the button. */
  after?: Block[]
  footer: string
}

function blockHtml(b: Block): string {
  if (b.p) return `<p style="${P}">${escHtml(b.p)}</p>`
  if (b.note) return `<p style="${SMALL}">${escHtml(b.note)}</p>`
  if (b.list) {
    return `<ul style="margin:0 0 14px;padding-left:20px;color:#27272A;font-size:15px;line-height:1.6;">${b.list
      .map((i) => `<li style="margin:0 0 6px;">${escHtml(i)}</li>`)
      .join('')}</ul>`
  }
  if (b.steps) {
    return `<ol style="margin:0 0 14px;padding-left:22px;color:#27272A;font-size:15px;line-height:1.6;">${b.steps
      .map((i) => `<li style="margin:0 0 6px;">${escHtml(i)}</li>`)
      .join('')}</ol>`
  }
  if (b.rows) {
    const rows = b.rows
      .map(
        (r, i) => `<tr>
          <td style="padding:11px 16px;color:#52525B;font-size:14px;${i ? 'border-top:1px solid #E4E4E7;' : ''}">${escHtml(r.label)}</td>
          <td align="right" style="padding:11px 16px;color:#111;font-size:${r.strong ? '16px' : '14px'};font-weight:${r.strong ? '900' : '700'};${i ? 'border-top:1px solid #E4E4E7;' : ''}">${escHtml(r.value)}</td>
        </tr>`
      )
      .join('')
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;background:#FAFAFA;border:1px solid #E4E4E7;border-radius:10px;border-collapse:separate;">${rows}</table>`
  }
  return ''
}

function blockText(b: Block): string[] {
  if (b.p) return [b.p, '']
  if (b.note) return [b.note, '']
  if (b.list) return [...b.list.map((i) => `- ${i}`), '']
  if (b.steps) return [...b.steps.map((s, i) => `${i + 1}. ${s}`), '']
  if (b.rows) {
    const w = Math.max(...b.rows.map((r) => r.label.length))
    return [...b.rows.map((r) => `${(r.label + ':').padEnd(w + 2)}${r.value}`), '']
  }
  return []
}

function layout(input: LayoutInput): RenderedEmail {
  const subject = cleanSubject(input.subject)
  const after = input.after ?? []
  const text = [
    input.heading,
    '',
    ...input.blocks.flatMap(blockText),
    ...(input.button ? [`${input.button.label}: ${input.button.href}`, ''] : []),
    ...after.flatMap(blockText),
    '--',
    input.footer,
    'LearnHoops.com',
  ].join('\n')

  const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F5;"><tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #E4E4E7;">
      <tr><td style="background:#000;padding:22px 32px;">
        <div style="color:#FF5C1A;font-size:20px;font-weight:800;letter-spacing:-0.3px;line-height:1;">LearnHoops<span style="color:#71717A;">.com</span></div>
        ${input.headerSub ? `<div style="color:#A1A1AA;font-size:12px;margin-top:5px;">${escHtml(input.headerSub)}</div>` : ''}
      </td></tr>
      <tr><td style="padding:32px 32px 4px;">
        <h1 style="margin:0 0 14px;color:#111;font-size:22px;line-height:1.3;font-weight:800;">${escHtml(input.heading)}</h1>
        ${input.blocks.map(blockHtml).join('')}
      </td></tr>
      ${
        input.button
          ? `<tr><td style="padding:6px 32px 10px;">
        <a href="${escHtml(input.button.href)}" style="display:inline-block;background:#FF5C1A;color:#111;padding:13px 26px;border-radius:10px;text-decoration:none;font-weight:800;font-size:15px;">${escHtml(input.button.label)}</a>
        <p style="margin:12px 0 0;color:#A1A1AA;font-size:12px;line-height:1.5;">If the button doesn't work, copy this link into your browser:<br/><a href="${escHtml(input.button.href)}" style="color:#71717A;word-break:break-all;">${escHtml(input.button.href)}</a></p>
      </td></tr>`
          : ''
      }
      ${after.length ? `<tr><td style="padding:14px 32px 0;">${after.map(blockHtml).join('')}</td></tr>` : ''}
      <tr><td style="padding:18px 32px 30px;">
        <p style="margin:0;border-top:1px solid #E4E4E7;padding-top:16px;color:#71717A;font-size:12px;line-height:1.6;">${escHtml(input.footer)}</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`.trim()

  return { subject, text, html }
}

async function send(to: string, email: RenderedEmail, what: string): Promise<void> {
  const { data, error } = await getResend().emails.send({
    from: NOTIFICATION_FROM,
    to,
    subject: email.subject,
    text: email.text,
    html: email.html,
  })
  if (error) {
    const msg = typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : String(error)
    console.error(`[email] ${what} failed:`, msg)
    throw new Error(`${what} email failed: ${msg}`)
  }
  console.log(`[email] ${what} sent:`, data?.id)
}

/** Player-facing notices go through the testing kill switch; org receipts do not. */
async function sendToPlayer(to: string, email: RenderedEmail, what: string): Promise<void> {
  if (playerEmailPaused(what, to)) return
  await send(to, email, what)
}

function hello(first: string | null): string {
  return first ? `Hi ${first},` : 'Hi there,'
}

function playerFooter(org: string): string {
  return `${org} provides this membership through LearnHoops. This is an automated notice about your account; replies to this address aren't read. For help, visit ${base()}/support.`
}

// ---------------------------------------------------------------------------
// 1. Org receipt
// ---------------------------------------------------------------------------

export interface OrgMembershipReceiptInput {
  orgName: string
  plan: MembershipPlan
  term: MembershipTerm
  seats: number
  unitCents: number
  totalCents: number
  currency: string
  startsAt: Date
  endsAt: Date
  dashboardUrl: string
}

export function renderOrgMembershipReceipt(a: OrgMembershipReceiptInput): RenderedEmail {
  const org = orgLabel(a.orgName)
  const plan = planName(a.plan)
  const seats = plural(a.seats, 'player membership', 'player memberships')
  const dashboard = safeUrl(a.dashboardUrl, `${base()}/org/dashboard`)
  return layout({
    subject: `Receipt: ${seats} (${plan}) for ${org}`,
    headerSub: org,
    heading: a.seats === 1 ? 'Your player membership is paid' : 'Your player memberships are paid',
    blocks: [
      { p: `Thanks for your order. ${org} now has ${seats} for ${plan}. Here are the details for your records.` },
      {
        rows: [
          { label: 'Plan', value: plan },
          { label: 'Length', value: termLabel(a.term) },
          { label: 'Memberships', value: String(a.seats) },
          { label: 'Price per player', value: `${fmtMoney(a.unitCents, a.currency)} (${fmtMoney(membershipPerMonthCents(a.unitCents, a.term), a.currency).replace(/ [A-Z]{3}$/, '')}/month)` },
          { label: 'Total paid', value: fmtMoney(a.totalCents, a.currency), strong: true },
          { label: 'Starts', value: fmtDate(a.startsAt) },
          { label: 'Covered through', value: fmtLastDay(a.endsAt) },
        ],
      },
      { p: `Each player you give a membership to gets ${planAllowance(a.plan)}, for the shots they upload themselves, through ${fmtLastDay(a.endsAt)}. Shots your coaches upload for players still use tokens, as before.` },
      { p: 'If you chose players at checkout, they are already covered and have been emailed. Give out the rest from the Memberships tab on your dashboard at any time, and move a membership to another player if someone leaves the team.' },
    ],
    button: { label: 'Give out memberships', href: dashboard },
    after: [{ note: 'This membership is prepaid and does not renew automatically. We will email you 30 days and 7 days before it ends.' }],
    footer: `Receipt for ${org}. This is an automated message; replies to this address aren't read. For help, visit ${base()}/support.`,
  })
}

export async function sendOrgMembershipReceipt(to: string, a: OrgMembershipReceiptInput): Promise<void> {
  await send(to, renderOrgMembershipReceipt(a), 'org membership receipt')
}

// ---------------------------------------------------------------------------
// 2. Player: you're covered
// ---------------------------------------------------------------------------

export interface PlayerCoveredInput {
  playerFirstName: string | null
  orgName: string
  plan: MembershipPlan
  endsAt: Date
  hasAccount: boolean
  setupUrl?: string
  /**
   * The club moved the player from one of its memberships to another (a
   * switch, or taking one back and giving another within a few minutes).
   * This is then the ONLY email about the change: it says what covers them
   * now, never that they lost their membership.
   */
  moved?: boolean
}

export function renderPlayerCoveredEmail(a: PlayerCoveredInput): RenderedEmail {
  const org = orgLabel(a.orgName)
  const plan = planName(a.plan)
  const first = firstName(a.playerFirstName)
  const until = fmtLastDay(a.endsAt)
  const setup = a.hasAccount ? null : safeUrl(a.setupUrl, `${base()}/signup`)
  const moved = a.moved === true
  return layout({
    subject: moved ? `${org} now covers your ${plan} membership through ${until}` : `${org} is covering your ${plan} membership`,
    headerSub: org,
    heading: moved
      ? first ? `${first}, your membership has changed` : 'Your membership has changed'
      : first ? `${first}, your membership is covered` : 'Your membership is covered',
    blocks: [
      { p: hello(first) },
      moved
        ? { p: `${org} now covers your ${plan} membership. It runs through ${until}, and there is nothing for you to pay. This replaces the membership ${org} gave you before; the analyses you already used this week and month still count.` }
        : { p: `${org} has given you a ${plan} membership through LearnHoops. It runs through ${until}, and there is nothing for you to pay.` },
      {
        list: [
          `${planAllowance(a.plan)[0].toUpperCase()}${planAllowance(a.plan).slice(1)}, for shots you upload yourself.`,
          'A full breakdown of every shot, with what to work on next.',
          'Your allowance resets every week and every month. Unused analyses don\'t carry over.',
          'Shots your coach uploads for you work the same as before.',
        ],
      },
      setup
        ? { p: 'To start using it, finish setting up your account with this email address.' }
        : { p: 'It is already active on your account. Sign in and upload a shot whenever you are ready.' },
    ],
    button: setup
      ? { label: 'Set up your account', href: setup }
      : { label: 'Go to my dashboard', href: `${base()}/dashboard` },
    after: setup && setup === (a.setupUrl ?? '').trim() ? [{ note: "If this link stops working, ask your coach to send you a new one." }] : [],
    footer: playerFooter(org),
  })
}

export async function sendPlayerCoveredEmail(to: string, a: PlayerCoveredInput): Promise<void> {
  await sendToPlayer(to, renderPlayerCoveredEmail(a), 'player membership covered')
}

// ---------------------------------------------------------------------------
// 3. Org: seats expiring (30 / 7 days)
// ---------------------------------------------------------------------------

export interface OrgSeatsExpiringInput {
  orgName: string
  daysLeft: 30 | 7
  seats: number
  endsAt: Date
  renewUrl: string
}

export function renderOrgSeatsExpiringEmail(a: OrgSeatsExpiringInput): RenderedEmail {
  const org = orgLabel(a.orgName)
  const last = fmtLastDay(a.endsAt)
  const seats = plural(a.seats, 'player membership', 'player memberships')
  const renew = safeUrl(a.renewUrl, `${base()}/org/dashboard`)
  return layout({
    subject: `${seats} for ${org} end${a.seats === 1 ? 's' : ''} in ${a.daysLeft} days`,
    headerSub: org,
    heading: `${seats} end${a.seats === 1 ? 's' : ''} in ${a.daysLeft} days`,
    blocks: [
      { p: `${seats} that ${org} bought through LearnHoops end${a.seats === 1 ? 's' : ''} in ${a.daysLeft} days. The last day of coverage is ${last}.` },
      { p: `After that date, ${a.seats === 1 ? 'that player is' : 'those players are'} no longer covered by the club. Past analyses stay in their accounts.` },
      { p: 'To keep them covered, buy new memberships on the LearnHoops website before then and give them out from the Memberships tab.' },
    ],
    button: { label: 'Renew on the dashboard', href: renew },
    after: a.daysLeft === 30 ? [{ note: `We will remind you again 7 days before ${a.seats === 1 ? 'it ends' : 'they end'}.` }] : [],
    footer: `Sent to the account holder for ${org}. This is an automated message; replies to this address aren't read. For help, visit ${base()}/support.`,
  })
}

export async function sendOrgSeatsExpiringEmail(to: string, a: OrgSeatsExpiringInput): Promise<void> {
  await send(to, renderOrgSeatsExpiringEmail(a), 'org seats expiring')
}

// ---------------------------------------------------------------------------
// 4. Player: membership ending (7 days / today)
// ---------------------------------------------------------------------------

export interface PlayerMembershipEndingInput {
  playerFirstName: string | null
  orgName: string
  plan: MembershipPlan
  endsAt: Date
  daysLeft: 7 | 0
}

export function renderPlayerMembershipEndingEmail(a: PlayerMembershipEndingInput): RenderedEmail {
  const org = orgLabel(a.orgName)
  const plan = planName(a.plan)
  const first = firstName(a.playerFirstName)
  const last = fmtLastDay(a.endsAt)
  const today = a.daysLeft === 0
  return layout({
    subject: today ? `Your ${plan} membership from ${org} has ended` : `Your ${plan} membership from ${org} ends in 7 days`,
    headerSub: org,
    heading: today ? 'Your membership has ended' : 'Your membership ends in 7 days',
    blocks: [
      { p: hello(first) },
      today
        ? { p: `The ${plan} membership ${org} provided through LearnHoops has ended. Your last day of coverage was ${last}. Your past analyses stay in your account.` }
        : { p: `The ${plan} membership ${org} provided through LearnHoops ends in 7 days. Your last day of coverage is ${last}, and until then you can keep uploading shots as usual.` },
      { p: `If ${org} renews your membership, we will email you as soon as you are covered again. You can also keep going on your own with a personal plan on the LearnHoops website.` },
    ],
    button: { label: 'See plans on learnhoops.com', href: `${base()}/pricing` },
    footer: playerFooter(org),
  })
}

export async function sendPlayerMembershipEndingEmail(to: string, a: PlayerMembershipEndingInput): Promise<void> {
  await sendToPlayer(to, renderPlayerMembershipEndingEmail(a), `player membership ending (${a.daysLeft}d)`)
}

// ---------------------------------------------------------------------------
// 5. Player: seat removed
// ---------------------------------------------------------------------------

export interface SeatRemovedInput {
  playerFirstName: string | null
  orgName: string
}

export function renderSeatRemovedEmail(a: SeatRemovedInput): RenderedEmail {
  const org = orgLabel(a.orgName)
  const first = firstName(a.playerFirstName)
  return layout({
    subject: `${org} no longer covers your LearnHoops membership`,
    headerSub: org,
    heading: 'Your membership has been removed',
    blocks: [
      { p: hello(first) },
      { p: `${org} has removed the membership it was providing you through LearnHoops, so it no longer covers your shot analyses. Your past analyses stay in your account.` },
      { p: `If you think this is a mistake, please check with ${org} directly. To keep going on your own, you can choose a personal plan on the LearnHoops website.` },
    ],
    button: { label: 'See plans on learnhoops.com', href: `${base()}/pricing` },
    footer: `This is an automated notice about your LearnHoops account; replies to this address aren't read. For help, visit ${base()}/support.`,
  })
}

export async function sendSeatRemovedEmail(to: string, a: SeatRemovedInput): Promise<void> {
  await sendToPlayer(to, renderSeatRemovedEmail(a), 'membership seat removed')
}

// ---------------------------------------------------------------------------
// 6. Player: personal plan paused (Stripe) / how to cancel (Apple)
// ---------------------------------------------------------------------------

export interface PersonalPlanPausedInput {
  playerFirstName: string | null
  orgName: string
  resumesAt: Date
  billedVia: 'stripe' | 'apple'
}

export function renderPersonalPlanPausedEmail(a: PersonalPlanPausedInput): RenderedEmail {
  const org = orgLabel(a.orgName)
  const first = firstName(a.playerFirstName)
  const until = fmtDate(a.resumesAt)
  if (a.billedVia === 'apple') {
    return layout({
      subject: `${org} is covering you: how to stop your App Store billing`,
      headerSub: org,
      heading: 'You may want to cancel your App Store subscription',
      blocks: [
        { p: hello(first) },
        { p: `${org} is now providing your LearnHoops membership, through ${fmtLastDay(a.resumesAt)}. You also have a personal LearnHoops plan that is billed by Apple through the App Store.` },
        { p: 'Apple handles that billing, so we can\'t pause it for you. Unless you cancel it, Apple will keep charging you while you are covered. To cancel on your iPhone:' },
        {
          steps: [
            'Open the Settings app.',
            'Tap your name at the top.',
            'Tap Subscriptions.',
            'Tap LearnHoops.',
            'Tap Cancel Subscription and confirm.',
          ],
        },
        { p: `Cancelling doesn't cut you off: your personal plan runs to the end of the period you already paid for, and the membership from ${org} covers you after that, through ${fmtLastDay(a.resumesAt)}.` },
      ],
      after: [{ note: 'If you would rather keep your personal plan as well, you don\'t need to do anything.' }],
      footer: playerFooter(org),
    })
  }
  return layout({
    // "Restarts on", never "paused until": the resume date is the day AFTER
    // the club's last covered day and must not read as a coverage date.
    subject: `Billing on your own plan is paused and restarts on ${until}`,
    headerSub: org,
    heading: 'Your personal plan is paused',
    blocks: [
      { p: hello(first) },
      { p: `${org} is now covering your LearnHoops membership through ${fmtLastDay(a.resumesAt)}. Billing on your own plan is paused and restarts on ${until}. You won't be charged for it while you are covered.` },
      {
        list: [
          'Nothing you already paid for is lost. You keep full access the whole time.',
          `Billing restarts on its own on ${until}.`,
          'If you would rather not restart it, you can cancel your personal plan any time from your account on the LearnHoops website.',
        ],
      },
    ],
    button: { label: 'Manage my account', href: `${base()}/dashboard` },
    footer: playerFooter(org),
  })
}

export async function sendPersonalPlanPausedEmail(to: string, a: PersonalPlanPausedInput): Promise<void> {
  await sendToPlayer(to, renderPersonalPlanPausedEmail(a), `personal plan paused (${a.billedVia})`)
}

// ---------------------------------------------------------------------------
// 7. Player: personal plan resumed
// ---------------------------------------------------------------------------

export interface PersonalPlanResumedInput {
  playerFirstName: string | null
  orgName: string
}

export function renderPersonalPlanResumedEmail(a: PersonalPlanResumedInput): RenderedEmail {
  const org = orgLabel(a.orgName)
  const first = firstName(a.playerFirstName)
  return layout({
    subject: 'Your personal LearnHoops plan is active again',
    headerSub: null,
    heading: 'Your personal plan is active again',
    blocks: [
      { p: hello(first) },
      { p: `The membership ${org} provided through LearnHoops no longer covers you, so we have restarted billing on your personal LearnHoops plan. It continues on its usual schedule, and you can keep uploading shots without a break.` },
      { p: 'If you would rather stop it, you can cancel any time from your account on the LearnHoops website.' },
    ],
    button: { label: 'Manage my account', href: `${base()}/dashboard` },
    footer: `This is an automated notice about your LearnHoops account; replies to this address aren't read. For help, visit ${base()}/support.`,
  })
}

export async function sendPersonalPlanResumedEmail(to: string, a: PersonalPlanResumedInput): Promise<void> {
  await sendToPlayer(to, renderPersonalPlanResumedEmail(a), 'personal plan resumed')
}

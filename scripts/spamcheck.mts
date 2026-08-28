/**
 * Deliverability test for every email the app sends.
 *
 *   npx tsx --env-file=.env.local scripts/spamcheck.mts
 *
 * Nothing is sent. `globalThis.fetch` is replaced before lib/email.ts loads, so
 * the Resend SDK's HTTP call is captured instead of made, and every real send
 * function can be invoked to get the exact payload it would have transmitted.
 *
 * Each payload is assembled into a real MIME message and scored by Postmark's
 * public SpamCheck endpoint, which runs SpamAssassin -- the same engine behind
 * mail-tester.com. Lower is better: under 5 is inbox territory, and anything at
 * or above 5 is what most filters treat as spam.
 *
 * Alongside the score it reports the content signals that actually move
 * placement: whether a plain-text alternative exists at all, the text-to-HTML
 * ratio, how many links there are and whether they all point at our own domain,
 * and whether the message declares itself bulk mail via List-Unsubscribe.
 * A measured run beats an opinion about whether a template "looks spammy".
 *
 * Unlike scripts/test-promo.ts, which sends one real promo for visual preview,
 * this sends nothing and covers all of them.
 */

/* ------------------------------------------------------------------ capture */

interface Captured {
  label: string
  from: string
  to: string
  replyTo?: string
  subject: string
  headers: Record<string, string>
  text?: string
  html?: string
}

const captured: Captured[] = []
let currentLabel = '(unknown)'

const realFetch = globalThis.fetch

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url

  if (url.includes('api.resend.com/emails')) {
    const body = JSON.parse(String(init?.body ?? '{}'))
    // The batch endpoint posts an array; the single endpoint posts one object.
    for (const m of Array.isArray(body) ? body : [body]) {
      captured.push({
        label: currentLabel,
        from: m.from,
        to: Array.isArray(m.to) ? m.to[0] : m.to,
        replyTo: m.reply_to ?? m.replyTo,
        subject: m.subject,
        headers: m.headers ?? {},
        text: m.text,
        html: m.html,
      })
    }
    return new Response(JSON.stringify({ id: 'captured-not-sent' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return realFetch(input as never, init)
}) as typeof fetch

// Resend's constructor rejects a missing key before any send is attempted.
process.env.RESEND_API_KEY ||= 're_testkeytestkeytestkeytestkey00'
process.env.NEXT_PUBLIC_BASE_URL = 'https://www.learnhoops.com'

const E = await import('../lib/email.ts')

/* -------------------------------------------------------------- the fixtures */

const TO = 'deliverability-probe@example.com'

// Every send the app can make, with realistic arguments. The three marked
// [mkt] are the marketing stream that carries List-Unsubscribe.
const CASES: Array<[string, () => Promise<unknown>]> = [
  ['sendResultsEmail', () => E.sendResultsEmail(TO, 'tok_results_example')],
  ['sendFilmingTipsEmail', () => E.sendFilmingTipsEmail(TO)],
  ['sendPasswordResetEmail', () => E.sendPasswordResetEmail(TO, 'tok_reset_example')],
  ['sendPasswordChangedEmail', () => E.sendPasswordChangedEmail(TO)],
  ['sendCoachInviteEmail', () => E.sendCoachInviteEmail(TO, 'Maple Basketball', 'U14 Boys', 'tok_invite')],
  ['sendCoachSignupEmail', () => E.sendCoachSignupEmail(TO, 'U14 Boys', 'tok_signup')],
  ['sendCoachAddedEmail', () => E.sendCoachAddedEmail(TO, 'Maple Basketball', 'U14 Boys')],
  ['sendOrgApprovalEmail', () => E.sendOrgApprovalEmail(TO, 'Maple Basketball', 'tok_org')],
  ['sendTeamCreatedEmail', () => E.sendTeamCreatedEmail(TO, 'Maple Basketball', 'U14 Boys', 'HOOP24', 'https://www.learnhoops.com/org/dashboard')],
  ['sendClassPurchaseConfirmationEmail', () => E.sendClassPurchaseConfirmationEmail(TO, 'Maple Basketball', 12, 'HOOP24', 'https://www.learnhoops.com/org/dashboard')],
  ['sendTokenPurchaseConfirmationEmail', () => E.sendTokenPurchaseConfirmationEmail(TO, 'Maple Basketball', 10, 'https://www.learnhoops.com/org/dashboard')],
  ['sendClaimCreditsEmail', () => E.sendClaimCreditsEmail(TO, 'Megh Gandhi', 2, 'tok_claim')],
  ['sendShippingEmail', () => E.sendShippingEmail(TO, 'Megh Gandhi', 'https://www.canadapost.ca/track/1234')],
  ['sendLeftTeamEmail', () => E.sendLeftTeamEmail(TO, 'U14 Boys')],
  ['sendAccountDeletedEmail', () => E.sendAccountDeletedEmail(TO)],
  ['sendSupportRequestEmail', () => E.sendSupportRequestEmail({
    topic: 'Analysis question',
    name: 'Sam Rivera',
    email: 'sam@example.com',
    message: 'My upload finished but the elbow score looks wrong. Can you take a look?',
  })],
  ['sendPromoEmail  [mkt]', () => E.sendPromoEmail(TO)],
  ['sendAbandonedCheckoutEmail  [mkt]', () => E.sendAbandonedCheckoutEmail(TO, 'Megh', 'https://www.learnhoops.com/cart')],
  ...[0, 1, 2, 3, 4].map(
    (n) => [`drip ${n + 1} of 5  [mkt]`, () => E.sendNextMarketingEmail(TO, n)] as [string, () => Promise<unknown>]
  ),
]

for (const [label, run] of CASES) {
  currentLabel = label
  try {
    await run()
  } catch (err) {
    console.error(`  ! ${label} threw: ${(err as Error).message}`)
  }
}

/* ----------------------------------------------------------------- analysis */

function b64(s: string): string {
  return (Buffer.from(s, 'utf8').toString('base64').match(/.{1,76}/g) ?? []).join('\r\n')
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}

/** Assemble the multipart/alternative message a receiver would actually see. */
function toMime(m: Captured): string {
  const boundary = '----lh-boundary-8f2a1c'
  const head = [
    `From: ${m.from}`,
    `To: ${m.to}`,
    m.replyTo ? `Reply-To: ${m.replyTo}` : null,
    `Subject: ${m.subject}`,
    'Date: Thu, 28 Aug 2026 12:00:00 +0000',
    `Message-ID: <probe.${Math.abs(hash(m.label))}@learnhoops.com>`,
    ...Object.entries(m.headers).map(([k, v]) => `${k}: ${v}`),
    'MIME-Version: 1.0',
  ].filter(Boolean) as string[]

  if (m.text && m.html) {
    return [
      ...head,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      b64(m.text),
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      b64(m.html),
      `--${boundary}--`,
      '',
    ].join('\r\n')
  }

  const only = m.html ?? m.text ?? ''
  return [
    ...head,
    `Content-Type: text/${m.html ? 'html' : 'plain'}; charset=utf-8`,
    'Content-Transfer-Encoding: base64',
    '',
    b64(only),
    '',
  ].join('\r\n')
}

function stripTags(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface Signals {
  hasText: boolean
  ratio: string
  links: number
  offDomain: string[]
  bulk: boolean
  htmlKb: string
}

function signals(m: Captured): Signals {
  const html = m.html ?? ''
  const visible = stripTags(html)
  const hrefs = [...html.matchAll(/href="([^"]+)"/gi)].map((x) => x[1])
  const offDomain = [
    ...new Set(
      hrefs
        .filter((h) => /^https?:/i.test(h))
        .map((h) => {
          try {
            return new URL(h).hostname
          } catch {
            return ''
          }
        })
        .filter((host) => host && !host.endsWith('learnhoops.com'))
    ),
  ]
  return {
    hasText: Boolean(m.text && m.text.trim().length > 40),
    ratio: html ? (visible.length / Math.max(html.length, 1)).toFixed(2) : 'n/a',
    links: hrefs.length,
    offDomain,
    bulk: Boolean(m.headers['List-Unsubscribe']),
    htmlKb: html ? (html.length / 1024).toFixed(1) : '0',
  }
}

async function score(raw: string): Promise<{ score: number | null; rules: string[] }> {
  try {
    const r = await realFetch('https://spamcheck.postmarkapp.com/filter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: raw, options: 'long' }),
    })
    const b = (await r.json()) as {
      success?: boolean
      score?: string
      rules?: Array<{ score: string; description: string }>
    }
    if (!b?.success) return { score: null, rules: [] }
    const rules = (b.rules ?? [])
      .filter((x) => Number(x.score) > 0)
      .sort((a, z) => Number(z.score) - Number(a.score))
      .map((x) => `+${Number(x.score).toFixed(1)} ${x.description}`)
    return { score: Number(b.score), rules }
  } catch {
    return { score: null, rules: [] }
  }
}

/* ------------------------------------------------------------------- report */

console.log(`\ncaptured ${captured.length} messages from ${CASES.length} send functions\n`)
console.log('score  txt  ratio  links  off  bulk  html   template')
console.log('-----  ---  -----  -----  ---  ----  -----  --------')

const results: Array<{
  label: string
  s: number | null
  rules: string[]
  sig: Signals
  from: string
  subject: string
}> = []

for (const m of captured) {
  const sig = signals(m)
  const { score: s, rules } = await score(toMime(m))
  results.push({ label: m.label, s, rules, sig, from: m.from, subject: m.subject })
  const flag = s === null ? '  ?  ' : s >= 5 ? `${s.toFixed(1)} !!` : s >= 3 ? `${s.toFixed(1)} ! ` : `${s.toFixed(1)}   `
  console.log(
    [
      flag.padEnd(5),
      (sig.hasText ? 'yes' : 'NO ').padEnd(3),
      String(sig.ratio).padEnd(5),
      String(sig.links).padEnd(5),
      String(sig.offDomain.length).padEnd(3),
      (sig.bulk ? 'YES ' : '-   ').padEnd(4),
      (sig.htmlKb + 'k').padEnd(5),
      m.label,
    ].join('  ')
  )
}

const worst = results.filter((r) => r.s !== null && r.s >= 3).sort((a, z) => (z.s ?? 0) - (a.s ?? 0))
if (worst.length) {
  console.log('\n--- what SpamAssassin objected to (score >= 3) ---')
  for (const r of worst) {
    console.log(`\n${r.label}   score ${r.s?.toFixed(1)}`)
    console.log(`  subject: ${r.subject}`)
    for (const rule of r.rules.slice(0, 6)) console.log(`  ${rule}`)
  }
}

const noText = results.filter((r) => !r.sig.hasText)
if (noText.length) {
  console.log('\n--- MISSING plain-text alternative (a real placement penalty) ---')
  for (const r of noText) console.log(`  ${r.label}`)
}

const off = results.filter((r) => r.sig.offDomain.length)
if (off.length) {
  console.log('\n--- links pointing off learnhoops.com ---')
  for (const r of off) console.log(`  ${r.label}: ${r.sig.offDomain.join(', ')}`)
}

const nums = results.map((r) => r.s).filter((s): s is number => s !== null)
if (nums.length) {
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length
  console.log(`\naverage ${avg.toFixed(2)}   worst ${Math.max(...nums).toFixed(1)}   best ${Math.min(...nums).toFixed(1)}`)
  console.log('SpamAssassin: under 5 reaches the inbox, 5 and over is filtered.')
}

const senders = [...new Set(captured.map((m) => m.from))]
console.log(`\nFrom addresses used: ${senders.join(' | ')}`)

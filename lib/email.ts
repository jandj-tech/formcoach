import { Resend } from 'resend'
import { resolveBaseUrl } from './base-url'
import { unsubscribeUrl } from './unsubscribe'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY!)
}

// Sender addresses live in one place — see lib/email-senders.ts for why
// transactional and marketing must not share a From address. The sending
// domain must be verified in the Resend dashboard before an address will
// deliver; until then, set EMAIL_FROM to `onboarding@resend.dev`.
import { INTERNAL_INBOX, MARKETING_FROM, NOTIFICATION_FROM, SUPPORT_ADDRESS, SUPPORT_FROM, onBehalfFrom } from './email-senders'
import { playerEmailPaused } from './player-email-pause'

export const BASE_URL = resolveBaseUrl()

export function orgSignupLink(signupToken: string) {
  return `${BASE_URL}/org/signup?token=${signupToken}`
}

export async function sendResultsEmail(to: string, token: string) {
  const link = `${BASE_URL}/results/${token}`
  const unsubscribe = unsubscribeUrl(to)

  const { data, error } = await getResend().emails.send({
    from: NOTIFICATION_FROM,
    to,
    subject: 'Your shot analysis is ready',
    // Plain-text alternative is a strong "this is transactional" signal to
    // Gmail and other clients — emails with no text body skew toward Promotions.
    text: [
      `Your shot analysis is ready.`,
      ``,
      `We studied 28 frames across 18 coaching criteria. View your full breakdown here:`,
      link,
      ``,
      `This link is private to you — bookmark it, it'll always work.`,
      ``,
      `LearnHoops.com`,
      `Unsubscribe: ${unsubscribe}`,
    ].join('\n'),
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111111;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F4F4F5;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #E4E4E7;">

        <!-- Brand bar -->
        <tr><td style="background:#000000;padding:22px 32px;">
          <div style="color:#F97316;font-size:20px;font-weight:800;letter-spacing:-0.3px;line-height:1;">LearnHoops<span style="color:#71717A;">.com</span></div>
          <div style="color:#A1A1AA;font-size:12px;margin-top:5px;">Your shot. Perfected by AI.</div>
        </td></tr>

        <!-- Hero -->
        <tr><td style="padding:36px 32px 8px;">
          <h1 style="margin:0 0 10px;color:#111111;font-size:24px;line-height:1.25;font-weight:800;">Your shot analysis is ready.</h1>
          <p style="margin:0;color:#52525B;font-size:15px;line-height:1.55;">
            We studied 28 frames of your shot across 18 coaching criteria.
            Your full breakdown — overall score, what you're doing well, and exactly what to fix — is one tap away.
          </p>
        </td></tr>

        <!-- Primary CTA -->
        <tr><td style="padding:24px 32px 8px;">
          <a href="${link}" style="display:inline-block;background:#F97316;color:#ffffff;padding:13px 26px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">
            View my shot analysis
          </a>
        </td></tr>

        <!-- Plain-text link fallback -->
        <tr><td style="padding:6px 32px 32px;">
          <p style="margin:0;color:#A1A1AA;font-size:12px;line-height:1.5;">
            Your link is private — bookmark it, it'll always work.<br/>
            <a href="${link}" style="color:#A1A1AA;word-break:break-all;text-decoration:underline;">${link}</a>
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:18px 32px;background:#FAFAFA;border-top:1px solid #E4E4E7;">
          <p style="margin:0;color:#A1A1AA;font-size:11px;line-height:1.6;">
            You're getting this because you submitted a shot at <a href="${BASE_URL}" style="color:#71717A;text-decoration:none;font-weight:600;">LearnHoops.com</a>.
            &nbsp;·&nbsp;
            <a href="${escHtml(unsubscribe)}" style="color:#71717A;text-decoration:underline;">Unsubscribe</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
    `.trim(),
  })

  if (error) {
    console.error('[email] Resend rejected send:', error, 'from:', NOTIFICATION_FROM, 'to:', to)
    throw new Error(
      `Resend send failed: ${error.message || JSON.stringify(error)}. ` +
        `Check the EMAIL_FROM env var and verify the sending domain in Resend.`,
    )
  }
  console.log('[email] sent results email:', data?.id, 'to:', to, 'from:', NOTIFICATION_FROM)
}

// The 5-email drip, in order. Each entry carries BOTH a plain-text and an HTML
// body on purpose: a message whose text part does not match its HTML — or is a
// stub telling the reader to switch clients — is itself a spam signal, and this
// array was the only place in the file that shipped one. getText mirrors
// getHtml, so if you edit one, edit both.
//
// Subject lines here are deliberately flat. "Last chance", "It's here", emoji,
// and manufactured scarcity are the phrase clusters bulk filters score hardest,
// and this list is people who uploaded one shot video — not a warm audience
// that has already bought something.
const MARKETING_EMAILS = [
  {
    subject: 'How did your shot analysis go?',
    getText: (to: string) => [
      `You have seen your scores. Here is what to do with them.`,
      ``,
      `Knowing which part of your shot breaks down is the first half. The second`,
      `half is repetition with something that corrects you while you shoot.`,
      ``,
      `That is what we are building, and we will show you as soon as it is ready.`,
      ``,
      `Analyze another shot: ${BASE_URL}/analyze`,
      ``,
      `LearnHoops.com`,
      `Unsubscribe: ${unsubscribeUrl(to)}`,
    ].join('\n'),
    getHtml: (to: string) => `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#000000;padding:24px 32px;">
          <h1 style="color:#F97316;margin:0;font-size:24px;">LearnHoops.com</h1>
        </div>
        <div style="padding:32px;">
          <h2 style="color:#000000;">You've seen your scores. Here's what to do with them.</h2>
          <p style="color:#000000;line-height:1.6;">
            Knowing which part of your shot breaks down is the first half. The second half is
            repetition with something that corrects you while you shoot.
          </p>
          <p style="color:#000000;line-height:1.6;">
            That's what we're building, and we'll show you as soon as it's ready.
          </p>
          <p style="line-height:1.6;">
            <a href="${BASE_URL}/analyze" style="color:#F97316;">Analyze another shot</a>
          </p>
          <hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0;"/>
          <p style="color:#000000;font-size:11px;text-align:center;">
            LearnHoops.com &middot; <a href="${escHtml(unsubscribeUrl(to))}" style="color:#000000;">Unsubscribe</a>
          </p>
        </div>
      </div>
    `,
  },
  {
    subject: 'Train smarter, not just harder',
    getText: (to: string) => [
      `Train smarter, not just harder.`,
      ``,
      `The best shooters alive do not just take thousands of reps. They take reps`,
      `with feedback — something telling them what changed between one and the next.`,
      ``,
      `Closing that gap for everyday players is the whole idea. More soon.`,
      ``,
      `Analyze your shot: ${BASE_URL}/analyze`,
      ``,
      `LearnHoops.com`,
      `Unsubscribe: ${unsubscribeUrl(to)}`,
    ].join('\n'),
    getHtml: (to: string) => `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#000000;padding:24px 32px;">
          <h1 style="color:#F97316;margin:0;font-size:24px;">LearnHoops.com</h1>
        </div>
        <div style="padding:32px;">
          <h2 style="color:#000000;">Train smarter, not just harder.</h2>
          <p style="color:#000000;line-height:1.6;">
            The best shooters alive don't just take thousands of reps. They take reps with
            feedback &mdash; something telling them what changed between one and the next.
          </p>
          <p style="color:#000000;line-height:1.6;">
            Closing that gap for everyday players is the whole idea. More soon.
          </p>
          <p style="line-height:1.6;">
            <a href="${BASE_URL}/analyze" style="color:#F97316;">Analyze your shot</a>
          </p>
          <hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0;"/>
          <p style="color:#000000;font-size:11px;text-align:center;">
            LearnHoops.com &middot; <a href="${escHtml(unsubscribeUrl(to))}" style="color:#000000;">Unsubscribe</a>
          </p>
        </div>
      </div>
    `,
  },
  {
    subject: 'What coaches notice first in a jump shot',
    getText: (to: string) => [
      `The three things a coach sees immediately.`,
      ``,
      `When a coach watches someone shoot, three things register before anything`,
      `else: elbow alignment, release point, and follow-through. They are the`,
      `foundation of a repeatable shot, and the hardest to feel on your own.`,
      ``,
      `They are also the three your LearnHoops analysis scores in the most detail.`,
      ``,
      `Analyze your shot: ${BASE_URL}/analyze`,
      ``,
      `LearnHoops.com`,
      `Unsubscribe: ${unsubscribeUrl(to)}`,
    ].join('\n'),
    getHtml: (to: string) => `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#000000;padding:24px 32px;">
          <h1 style="color:#F97316;margin:0;font-size:24px;">LearnHoops.com</h1>
        </div>
        <div style="padding:32px;">
          <h2 style="color:#000000;">The three things a coach sees immediately.</h2>
          <p style="color:#000000;line-height:1.6;">
            When a coach watches someone shoot, three things register before anything else: elbow
            alignment, release point, and follow-through. They're the foundation of a repeatable
            shot, and the hardest to feel on your own.
          </p>
          <p style="color:#000000;line-height:1.6;">
            They're also the three your LearnHoops analysis scores in the most detail.
          </p>
          <p style="line-height:1.6;">
            <a href="${BASE_URL}/analyze" style="color:#F97316;">Analyze your shot</a>
          </p>
          <hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0;"/>
          <p style="color:#000000;font-size:11px;text-align:center;">
            LearnHoops.com &middot; <a href="${escHtml(unsubscribeUrl(to))}" style="color:#000000;">Unsubscribe</a>
          </p>
        </div>
      </div>
    `,
  },
  {
    subject: 'The LearnHoops Training Ball is available',
    getText: (to: string) => [
      `The ball we have been building is available.`,
      ``,
      `The LearnHoops Training Ball has grip lines marking where your fingers`,
      `belong, so every rep grooves the same hand placement and release. It comes`,
      `in right- and left-handed versions, and every ball includes free AI shot`,
      `analyses.`,
      ``,
      `See the ball: ${BASE_URL}/shop`,
      ``,
      `LearnHoops.com`,
      `Unsubscribe: ${unsubscribeUrl(to)}`,
    ].join('\n'),
    getHtml: (to: string) => `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#000000;padding:24px 32px;">
          <h1 style="color:#F97316;margin:0;font-size:24px;">LearnHoops.com</h1>
        </div>
        <div style="padding:32px;">
          <h2 style="color:#000000;">The ball we've been building is available.</h2>
          <p style="color:#000000;line-height:1.6;">
            The LearnHoops Training Ball has grip lines marking where your fingers belong, so every
            rep grooves the same hand placement and release. It comes in right- and left-handed
            versions, and every ball includes free AI shot analyses.
          </p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${BASE_URL}/shop" style="background:#F97316;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">
              See the ball
            </a>
          </div>
          <hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0;"/>
          <p style="color:#000000;font-size:11px;text-align:center;">
            LearnHoops.com &middot; <a href="${escHtml(unsubscribeUrl(to))}" style="color:#000000;">Unsubscribe</a>
          </p>
        </div>
      </div>
    `,
  },
  {
    subject: 'A last note about the training ball',
    getText: (to: string) => [
      `One last note, then we will leave it.`,
      ``,
      `This is the final email in this series. If the LearnHoops Training Ball is`,
      `something you want, it is on the site — and if it is not, no hard feelings.`,
      ``,
      `Your shot analysis link keeps working either way.`,
      ``,
      `See the ball: ${BASE_URL}/shop`,
      ``,
      `LearnHoops.com`,
      `Unsubscribe: ${unsubscribeUrl(to)}`,
    ].join('\n'),
    getHtml: (to: string) => `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#000000;padding:24px 32px;">
          <h1 style="color:#F97316;margin:0;font-size:24px;">LearnHoops.com</h1>
        </div>
        <div style="padding:32px;">
          <h2 style="color:#000000;">One last note, then we'll leave it.</h2>
          <p style="color:#000000;line-height:1.6;">
            This is the final email in this series. If the LearnHoops Training Ball is something you
            want, it's on the site &mdash; and if it isn't, no hard feelings.
          </p>
          <p style="color:#000000;line-height:1.6;">
            Your shot analysis link keeps working either way.
          </p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${BASE_URL}/shop" style="background:#F97316;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">
              See the ball
            </a>
          </div>
          <hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0;"/>
          <p style="color:#000000;font-size:11px;text-align:center;">
            LearnHoops.com &middot; <a href="${escHtml(unsubscribeUrl(to))}" style="color:#000000;">Unsubscribe</a>
          </p>
        </div>
      </div>
    `,
  },
]

export async function sendCoachInviteEmail(to: string, orgName: string, teamName: string, inviteToken: string) {
  const link = `${BASE_URL}/team/setup?token=${inviteToken}`
  const { data, error } = await getResend().emails.send({
    from: NOTIFICATION_FROM,
    to,
    subject: `You've been added as a coach at ${orgName}`,
    text: [
      `You've been added as head coach of ${teamName} at ${orgName}.`,
      ``,
      `Set up your coach account here:`,
      link,
      ``,
      `This link expires once you've set your password.`,
      ``,
      `LearnHoops.com`,
    ].join('\n'),
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" style="background:#F4F4F5;"><tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:14px;border:1px solid #E4E4E7;">
      <tr><td style="background:#000;padding:22px 32px;">
        <div style="color:#F97316;font-size:20px;font-weight:800;">LearnHoops<span style="color:#71717A;">.com</span></div>
      </td></tr>
      <tr><td style="padding:36px 32px 8px;">
        <h1 style="margin:0 0 10px;color:#111;font-size:22px;font-weight:800;">You've been added as a coach</h1>
        <p style="margin:0;color:#52525B;font-size:15px;line-height:1.55;">
          <strong>${escHtml(orgName)}</strong> has added you as head coach of <strong>${escHtml(teamName)}</strong> on LearnHoops.com.
          Click below to set your password and access your team dashboard.
        </p>
      </td></tr>
      <tr><td style="padding:24px 32px 32px;">
        <a href="${link}" style="display:inline-block;background:#F97316;color:#fff;padding:13px 26px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Set up my coach account</a>
        <p style="margin:18px 0 0;color:#A1A1AA;font-size:13px;line-height:1.5;">
          If the button doesn't work, copy this link into your browser:<br/>
          <a href="${link}" style="color:#71717A;word-break:break-all;">${link}</a>
        </p>
        <p style="margin:10px 0 0;color:#A1A1AA;font-size:13px;line-height:1.5;">If you didn't expect this, you can ignore this email.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`.trim(),
  })
  if (error) {
    console.error('[email] coach invite failed:', error)
    throw new Error(`Coach invite email failed: ${error.message}`)
  }
  console.log('[email] coach invite sent:', data?.id, 'to:', to)
}

// Invites an additional coach to a team — links to the coach signup page.
export async function sendCoachSignupEmail(to: string, teamName: string, inviteToken: string) {
  const link = `${BASE_URL}/team/coach-signup?token=${inviteToken}`
  const { data, error } = await getResend().emails.send({
    from: NOTIFICATION_FROM,
    to,
    subject: `You've been added as a coach of ${teamName}`,
    text: [
      `You've been added as a coach of ${teamName} on LearnHoops.com.`,
      ``,
      `Set up your coach account here:`,
      link,
      ``,
      `This link expires once you've set your password.`,
      ``,
      `LearnHoops.com`,
    ].join('\n'),
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" style="background:#F4F4F5;"><tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:14px;border:1px solid #E4E4E7;">
      <tr><td style="background:#000;padding:22px 32px;">
        <div style="color:#F97316;font-size:20px;font-weight:800;">LearnHoops<span style="color:#71717A;">.com</span></div>
      </td></tr>
      <tr><td style="padding:36px 32px 8px;">
        <h1 style="margin:0 0 10px;color:#111;font-size:22px;font-weight:800;">You've been added as a coach</h1>
        <p style="margin:0;color:#52525B;font-size:15px;line-height:1.55;">
          You've been added as a coach of <strong>${escHtml(teamName)}</strong> on LearnHoops.com.
          Click below to set your password and access the team dashboard.
        </p>
      </td></tr>
      <tr><td style="padding:24px 32px 32px;">
        <a href="${link}" style="display:inline-block;background:#F97316;color:#fff;padding:13px 26px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Set up my coach account</a>
        <p style="margin:18px 0 0;color:#A1A1AA;font-size:13px;line-height:1.5;">
          If the button doesn't work, copy this link into your browser:<br/>
          <a href="${link}" style="color:#71717A;word-break:break-all;">${link}</a>
        </p>
        <p style="margin:10px 0 0;color:#A1A1AA;font-size:13px;line-height:1.5;">If you didn't expect this, you can ignore this email.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`.trim(),
  })
  if (error) {
    console.error('[email] coach signup invite failed:', error)
    throw new Error(`Coach signup email failed: ${error.message}`)
  }
  console.log('[email] coach signup invite sent:', data?.id, 'to:', to)
}

// Sent when a coach or organization adds a player by email. The player/parent
// finishes the account by setting a password at the setup link (14-day token).
// Names the child, who added them and the organization, so a parent knows
// exactly why they got it ("Coach Derek added Harper Smith to U10 Girls").
export async function sendPlayerSetupEmail(
  to: string,
  teamName: string | null,
  setupUrl: string,
  parentName?: string | null,
  opts: { playerName?: string | null; addedBy?: string | null; orgName?: string | null } = {},
) {
  if (playerEmailPaused('player setup email', to)) return
  const player = opts.playerName?.trim() || null
  const addedBy = opts.addedBy?.trim() || null
  const orgName = opts.orgName?.trim() || null
  const who = addedBy ?? 'Your coach'
  const playerText = player ?? 'your player'
  const teamText = teamName ?? 'their team'
  // Don't repeat the org when it is the one doing the adding.
  const orgSuffix = orgName && orgName !== addedBy ? ` at ${orgName}` : ''
  const lead = `${who} added ${playerText} to ${teamText}${orgSuffix} on LearnHoops.com.`
  const leadHtml = `${escHtml(who)} added <strong>${escHtml(playerText)}</strong> to <strong>${escHtml(teamText)}</strong>${orgSuffix ? ` at ${escHtml(orgName!)}` : ''} on LearnHoops.com.`
  const greeting = parentName ? `Hi ${parentName},` : 'Hi there,'
  const subject = player && teamName
    ? `${player} was added to ${teamName} — finish setting up the account`
    : teamName ? `Finish setting up your LearnHoops account for ${teamName}` : 'Finish setting up your LearnHoops account'
  const { data, error } = await getResend().emails.send({
    from: NOTIFICATION_FROM,
    to,
    subject,
    text: [
      greeting,
      ``,
      lead,
      `The profile is ready — finish the account by setting a password:`,
      setupUrl,
      ``,
      `Once it's set up you can see every shot analysis and track progress.`,
      player
        ? `This link works for 14 days and sets up ${player}'s account only — each player on this email gets their own link and password. If you didn't expect this email, you can ignore it.`
        : `This link works for 14 days. If you didn't expect this email, you can ignore it.`,
      ``,
      `LearnHoops.com`,
    ].join('\n'),
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" style="background:#F4F4F5;"><tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:14px;border:1px solid #E4E4E7;">
      <tr><td style="background:#000;padding:22px 32px;">
        <div style="color:#F97316;font-size:20px;font-weight:800;">LearnHoops<span style="color:#71717A;">.com</span></div>
      </td></tr>
      <tr><td style="padding:36px 32px 8px;">
        <h1 style="margin:0 0 10px;color:#111;font-size:22px;font-weight:800;">Finish setting up ${player ? escHtml(player) + '’s' : 'your'} account</h1>
        <p style="margin:0 0 10px;color:#52525B;font-size:15px;line-height:1.55;">
          ${escHtml(greeting)}
        </p>
        <p style="margin:0;color:#52525B;font-size:15px;line-height:1.55;">
          ${leadHtml} The profile is ready to go. Set a password below to finish the account and follow every shot analysis.
        </p>
      </td></tr>
      <tr><td style="padding:24px 32px 8px;">
        <a href="${setupUrl}" style="display:inline-block;background:#F97316;color:#fff;padding:13px 26px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">${player ? `Set ${escHtml(player)}’s password` : 'Set my password'}</a>
      </td></tr>
      <tr><td style="padding:8px 32px 32px;">
        <p style="margin:0 0 10px;color:#A1A1AA;font-size:13px;line-height:1.5;">
          If the button doesn't work, copy this link into your browser:<br/>
          <a href="${setupUrl}" style="color:#71717A;word-break:break-all;">${setupUrl}</a>
        </p>
        <p style="margin:0;color:#A1A1AA;font-size:13px;line-height:1.5;">This link works for 14 days${player ? ` and sets up ${escHtml(player)}’s account only — each player on this email gets their own link and password` : ''}. If you didn't expect this, you can ignore this email.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`.trim(),
  })
  if (error) {
    console.error('[email] player setup invite failed:', error)
    throw new Error(`Player setup email failed: ${error.message}`)
  }
  console.log('[email] player setup invite sent:', data?.id, 'to:', to)
}

/** One player account's line in a family reset email (siblings on one address). */
export interface ResetEmailAccount {
  /** "Liam", or "Liam and Harper" for one shared login; null when unnamed. */
  label: string | null
  shared?: boolean
}

function resetAccountName(a: ResetEmailAccount, i: number): string {
  return a.label?.trim() || `player account ${i + 1}`
}

function resetActionLabel(a: ResetEmailAccount, i: number): string {
  const name = resetAccountName(a, i)
  return a.shared ? `Reset ${name}'s shared password` : `Reset ${name}'s password`
}

// Sends a user a link to reset their account password. When several player
// accounts share the address (siblings), `accounts` carries one link per
// account ("Reset Liam's password" / "Reset Harper's password"); each resets
// only that child. With one account the email is exactly as before.
export async function sendPasswordResetEmail(
  to: string,
  token: string,
  accounts?: Array<ResetEmailAccount & { token: string }>,
) {
  if (accounts && accounts.length > 1) return sendFamilyPasswordResetEmail(to, accounts)
  const link = `${BASE_URL}/reset-password?token=${token}`
  const { data, error } = await getResend().emails.send({
    from: NOTIFICATION_FROM,
    to,
    subject: 'Reset your LearnHoops password',
    text: [
      `Someone asked to reset the password for your LearnHoops account.`,
      ``,
      `Reset it here (the link expires in 1 hour):`,
      link,
      ``,
      `If you didn't request this, you can safely ignore this email — your password won't change.`,
      ``,
      `LearnHoops.com`,
    ].join('\n'),
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" style="background:#F4F4F5;"><tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:14px;border:1px solid #E4E4E7;">
      <tr><td style="background:#000;padding:22px 32px;">
        <div style="color:#F97316;font-size:20px;font-weight:800;">LearnHoops<span style="color:#71717A;">.com</span></div>
      </td></tr>
      <tr><td style="padding:36px 32px 8px;">
        <h1 style="margin:0 0 10px;color:#111;font-size:22px;font-weight:800;">Reset your password</h1>
        <p style="margin:0;color:#52525B;font-size:15px;line-height:1.55;">
          Someone asked to reset the password for your LearnHoops account. Click below to set a new one.
          This link expires in 1 hour.
        </p>
      </td></tr>
      <tr><td style="padding:24px 32px 8px;">
        <a href="${link}" style="display:inline-block;background:#F97316;color:#fff;padding:13px 26px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Reset my password</a>
      </td></tr>
      <tr><td style="padding:6px 32px 32px;">
        <p style="margin:0;color:#A1A1AA;font-size:12px;line-height:1.5;">
          If you didn't request this, ignore this email — your password won't change.
        </p>
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`.trim(),
  })
  if (error) {
    console.error('[email] password reset failed:', error)
    throw new Error(`Password reset email failed: ${error.message}`)
  }
  console.log('[email] password reset sent:', data?.id, 'to:', to)
}

// App variant of the reset email: a 6-digit code typed into the iOS app
// instead of a link, so the whole reset happens without leaving the app.
// Siblings on one address get one code per account in the one email; the app
// sends whichever code was typed and the server finds the account it names.
export async function sendPasswordResetCodeEmail(
  to: string,
  code: string,
  accounts?: Array<ResetEmailAccount & { code: string }>,
) {
  if (accounts && accounts.length > 1) return sendFamilyPasswordResetCodeEmail(to, accounts)
  const { data, error } = await getResend().emails.send({
    from: NOTIFICATION_FROM,
    to,
    subject: `${code} is your LearnHoops reset code`,
    text: [
      `Someone asked to reset the password for your LearnHoops account from the LearnHoops app.`,
      ``,
      `Your reset code (expires in 1 hour):`,
      code,
      ``,
      `Enter it in the app to set a new password.`,
      ``,
      `If you didn't request this, you can safely ignore this email — your password won't change.`,
      ``,
      `LearnHoops.com`,
    ].join('\n'),
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" style="background:#F4F4F5;"><tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:14px;border:1px solid #E4E4E7;">
      <tr><td style="background:#000;padding:22px 32px;">
        <div style="color:#F97316;font-size:20px;font-weight:800;">LearnHoops<span style="color:#71717A;">.com</span></div>
      </td></tr>
      <tr><td style="padding:36px 32px 8px;">
        <h1 style="margin:0 0 10px;color:#111;font-size:22px;font-weight:800;">Your reset code</h1>
        <p style="margin:0;color:#52525B;font-size:15px;line-height:1.55;">
          Enter this code in the LearnHoops app to set a new password.
          It expires in 1 hour.
        </p>
      </td></tr>
      <tr><td style="padding:24px 32px 8px;">
        <div style="display:inline-block;background:#F4F4F5;border:1px solid #E4E4E7;border-radius:10px;padding:14px 26px;font-size:30px;font-weight:800;letter-spacing:8px;color:#111;">${code}</div>
      </td></tr>
      <tr><td style="padding:6px 32px 32px;">
        <p style="margin:0;color:#A1A1AA;font-size:12px;line-height:1.5;">
          If you didn't request this, ignore this email — your password won't change.
        </p>
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`.trim(),
  })
  if (error) {
    console.error('[email] password reset code failed:', error)
    throw new Error(`Password reset code email failed: ${error.message}`)
  }
  console.log('[email] password reset code sent:', data?.id, 'to:', to)
}

const RESET_EMAIL_SHELL = (inner: string) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" style="background:#F4F4F5;"><tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:14px;border:1px solid #E4E4E7;">
      <tr><td style="background:#000;padding:22px 32px;">
        <div style="color:#F97316;font-size:20px;font-weight:800;">LearnHoops<span style="color:#71717A;">.com</span></div>
      </td></tr>
${inner}
    </table>
  </td></tr></table>
</body>
</html>`.trim()

// Family variant of the reset email: one button per player account on the
// address. Names are the family's own children (shown only to the inbox).
async function sendFamilyPasswordResetEmail(to: string, accounts: Array<ResetEmailAccount & { token: string }>) {
  const items = accounts.map((a, i) => ({
    action: resetActionLabel(a, i),
    link: `${BASE_URL}/reset-password?token=${a.token}`,
  }))
  const { data, error } = await getResend().emails.send({
    from: NOTIFICATION_FROM,
    to,
    subject: 'Reset a LearnHoops password',
    text: [
      `Someone asked to reset a password on LearnHoops for this email. More than one player account uses it, so each has its own link — use the one for the player whose password you want to change (the links expire in 1 hour):`,
      ``,
      ...items.flatMap((it) => [`${it.action}:`, it.link, ``]),
      `Each link changes only that player's password. If you didn't request this, you can safely ignore this email — no password will change.`,
      ``,
      `LearnHoops.com`,
    ].join('\n'),
    html: RESET_EMAIL_SHELL(`
      <tr><td style="padding:36px 32px 8px;">
        <h1 style="margin:0 0 10px;color:#111;font-size:22px;font-weight:800;">Reset a password</h1>
        <p style="margin:0;color:#52525B;font-size:15px;line-height:1.55;">
          Someone asked to reset a password on LearnHoops for this email. More than one player account uses it,
          so each has its own button — pick the player whose password you want to change. The links expire in 1 hour.
        </p>
      </td></tr>
      <tr><td style="padding:20px 32px 4px;">
        ${items.map((it) => `<div style="margin:0 0 12px;"><a href="${it.link}" style="display:inline-block;background:#F97316;color:#fff;padding:13px 26px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">${escHtml(it.action)}</a></div>`).join('\n        ')}
      </td></tr>
      <tr><td style="padding:6px 32px 32px;">
        <p style="margin:0;color:#A1A1AA;font-size:12px;line-height:1.5;">
          Each link changes only that player's password. If you didn't request this, ignore this email — no password will change.
        </p>
      </td></tr>`),
  })
  if (error) {
    console.error('[email] family password reset failed:', error)
    throw new Error(`Password reset email failed: ${error.message}`)
  }
  console.log('[email] family password reset sent:', data?.id, 'to:', to, 'accounts:', accounts.length)
}

// Family variant of the app reset-code email: one code per player account.
async function sendFamilyPasswordResetCodeEmail(to: string, accounts: Array<ResetEmailAccount & { code: string }>) {
  const items = accounts.map((a, i) => {
    const name = resetAccountName(a, i)
    return { who: a.shared ? `${name} (shared login)` : name, code: a.code }
  })
  const { data, error } = await getResend().emails.send({
    from: NOTIFICATION_FROM,
    to,
    subject: 'Your LearnHoops reset codes',
    text: [
      `Someone asked to reset a password from the LearnHoops app for this email. More than one player account uses it, so each has its own code — enter the code for the player whose password you want to change (codes expire in 1 hour):`,
      ``,
      ...items.map((it) => `${it.who}: ${it.code}`),
      ``,
      `Each code changes only that player's password. If you didn't request this, you can safely ignore this email — no password will change.`,
      ``,
      `LearnHoops.com`,
    ].join('\n'),
    html: RESET_EMAIL_SHELL(`
      <tr><td style="padding:36px 32px 8px;">
        <h1 style="margin:0 0 10px;color:#111;font-size:22px;font-weight:800;">Your reset codes</h1>
        <p style="margin:0;color:#52525B;font-size:15px;line-height:1.55;">
          More than one player account uses this email, so each has its own code. Enter the code for the
          player whose password you want to change in the LearnHoops app. The codes expire in 1 hour.
        </p>
      </td></tr>
      <tr><td style="padding:20px 32px 4px;">
        ${items.map((it) => `<div style="margin:0 0 14px;"><div style="color:#52525B;font-size:14px;font-weight:700;margin:0 0 6px;">${escHtml(it.who)}</div><div style="display:inline-block;background:#F4F4F5;border:1px solid #E4E4E7;border-radius:10px;padding:12px 22px;font-size:26px;font-weight:800;letter-spacing:7px;color:#111;">${it.code}</div></div>`).join('\n        ')}
      </td></tr>
      <tr><td style="padding:6px 32px 32px;">
        <p style="margin:0;color:#A1A1AA;font-size:12px;line-height:1.5;">
          Each code changes only that player's password. If you didn't request this, ignore this email — no password will change.
        </p>
      </td></tr>`),
  })
  if (error) {
    console.error('[email] family password reset code failed:', error)
    throw new Error(`Password reset code email failed: ${error.message}`)
  }
  console.log('[email] family password reset codes sent:', data?.id, 'to:', to, 'accounts:', accounts.length)
}

// Biweekly promotional email — pitches the LearnHoops ball and the site.
export async function sendPromoEmail(to: string) {
  const unsubscribe = unsubscribeUrl(to)
  const { data, error } = await getResend().emails.send({
    from: MARKETING_FROM,
    to,
    replyTo: SUPPORT_ADDRESS,
    subject: 'Sharpen your shot with LearnHoops',
    headers: {
      'List-Unsubscribe': `<${unsubscribe}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    text: [
      `Your jump shot, broken down by AI.`,
      ``,
      `Upload a video at LearnHoops.com and get your shooting form scored across 18 coaching criteria.`,
      `Analyze your shot: ${BASE_URL}/analyze`,
      ``,
      `Train the right way with the right ball — the LearnHoops basketball has finger placement guides on the surface and comes in right- and left-handed versions, so you groove the correct hand position on every rep.`,
      `Shop the ball: ${BASE_URL}/shop`,
      ``,
      `LearnHoops.com`,
      `Unsubscribe: ${unsubscribe}`,
    ].join('\n'),
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111111;">
  <table role="presentation" width="100%" style="background:#F4F4F5;"><tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #E4E4E7;">
      <tr><td style="background:#000000;padding:22px 32px;">
        <div style="color:#F97316;font-size:20px;font-weight:800;">LearnHoops<span style="color:#71717A;">.com</span></div>
      </td></tr>
      <tr><td style="padding:36px 32px 8px;">
        <h1 style="margin:0 0 10px;color:#111;font-size:23px;line-height:1.25;font-weight:800;">Your jump shot, broken down by AI.</h1>
        <p style="margin:0;color:#52525B;font-size:15px;line-height:1.55;">
          Upload a video and LearnHoops scores your shooting form across 18 coaching criteria — so you know
          exactly what to fix.
        </p>
      </td></tr>
      <tr><td style="padding:20px 32px 4px;">
        <a href="${BASE_URL}/analyze" style="display:inline-block;background:#F97316;color:#fff;padding:13px 26px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Analyze your shot</a>
      </td></tr>
      <tr><td style="padding:24px 32px 8px;">
        <p style="margin:0;color:#52525B;font-size:15px;line-height:1.55;">
          Train the right way with the right ball — the <strong>LearnHoops basketball</strong> has finger
          placement guides on the surface and comes in right- and left-handed versions.
        </p>
      </td></tr>
      <tr><td style="padding:14px 32px 32px;">
        <a href="${BASE_URL}/shop" style="display:inline-block;background:#000;color:#fff;padding:13px 26px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Shop the ball</a>
      </td></tr>
      <tr><td style="padding:18px 32px;background:#FAFAFA;border-top:1px solid #E4E4E7;">
        <p style="margin:0;color:#A1A1AA;font-size:11px;line-height:1.6;">
          You're getting this because you signed up at <a href="${BASE_URL}" style="color:#71717A;text-decoration:none;font-weight:600;">LearnHoops.com</a>.
          &nbsp;·&nbsp;
          <a href="${escHtml(unsubscribe)}" style="color:#71717A;text-decoration:underline;">Unsubscribe</a>
        </p>
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`.trim(),
  })
  if (error) {
    console.error('[email] promo failed:', error)
    throw new Error(`Promo email failed: ${error.message}`)
  }
  console.log('[email] promo sent:', data?.id, 'to:', to)
}

export async function sendCoachAddedEmail(to: string, orgName: string, teamName: string) {
  // Coaches sign in at /team/login (the player /login page can't open a team).
  const link = `${BASE_URL}/team/login`
  await getResend().emails.send({
    from: NOTIFICATION_FROM,
    to,
    subject: `You've been added as coach of ${teamName}`,
    text: `${orgName} has added you as head coach of ${teamName} on LearnHoops.com.\n\nLog in with the coach password you already use:\n${link}\n\nLearnHoops.com`,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"><table role="presentation" width="100%" style="background:#F4F4F5;"><tr><td align="center" style="padding:32px 16px;"><table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:14px;border:1px solid #E4E4E7;"><tr><td style="background:#000;padding:22px 32px;"><div style="color:#F97316;font-size:20px;font-weight:800;">LearnHoops<span style="color:#71717A;">.com</span></div></td></tr><tr><td style="padding:36px 32px 8px;"><h1 style="margin:0 0 10px;color:#111;font-size:22px;font-weight:800;">You've been added as a coach</h1><p style="margin:0;color:#52525B;font-size:15px;line-height:1.55;"><strong>${escHtml(orgName)}</strong> has added you as head coach of <strong>${escHtml(teamName)}</strong>. Log in with the coach password you already use.</p></td></tr><tr><td style="padding:24px 32px 32px;"><a href="${link}" style="display:inline-block;background:#F97316;color:#fff;padding:13px 26px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Log in to my team</a></td></tr></table></td></tr></table></body></html>`,
  })
}

// Sent when a coach who already has a coach password is added to another
// team (as assistant or head coach). No new invite: their existing password
// works for the new team too.
export async function sendCoachAddedToTeamEmail(
  to: string,
  teamName: string,
  opts: { orgName?: string | null; addedBy?: string | null; role?: 'head' | 'assistant' } = {},
) {
  const link = `${BASE_URL}/team/login`
  const role = opts.role === 'head' ? 'head coach' : 'a coach'
  const by = opts.addedBy?.trim() || opts.orgName?.trim() || 'A coach'
  const orgPart = opts.orgName && opts.orgName !== by ? ` at ${opts.orgName}` : ''
  const line = `${by} added you as ${role} of ${teamName}${orgPart} on LearnHoops.com.`
  const lineHtml = `${escHtml(by)} added you as ${role} of <strong>${escHtml(teamName)}</strong>${orgPart ? ` at ${escHtml(opts.orgName!)}` : ''}.`
  const { data, error } = await getResend().emails.send({
    from: NOTIFICATION_FROM,
    to,
    subject: `You've been added to ${teamName}`,
    text: [
      line,
      ``,
      `Log in with the coach password you already use \u2014 you'll be able to pick ${teamName} after you sign in:`,
      link,
      ``,
      `LearnHoops.com`,
    ].join('\n'),
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"><table role="presentation" width="100%" style="background:#F4F4F5;"><tr><td align="center" style="padding:32px 16px;"><table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:14px;border:1px solid #E4E4E7;"><tr><td style="background:#000;padding:22px 32px;"><div style="color:#F97316;font-size:20px;font-weight:800;">LearnHoops<span style="color:#71717A;">.com</span></div></td></tr><tr><td style="padding:36px 32px 8px;"><h1 style="margin:0 0 10px;color:#111;font-size:22px;font-weight:800;">You've been added to ${escHtml(teamName)}</h1><p style="margin:0 0 10px;color:#52525B;font-size:15px;line-height:1.55;">${lineHtml}</p><p style="margin:0;color:#52525B;font-size:15px;line-height:1.55;">Log in with the coach password you already use. You'll be able to pick ${escHtml(teamName)} after you sign in.</p></td></tr><tr><td style="padding:24px 32px 32px;"><a href="${link}" style="display:inline-block;background:#F97316;color:#fff;padding:13px 26px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Log in</a></td></tr></table></td></tr></table></body></html>`,
  })
  if (error) {
    console.error('[email] coach added-to-team notice failed:', error)
    throw new Error(`Coach notice email failed: ${error.message}`)
  }
  console.log('[email] coach added-to-team notice sent:', data?.id, 'to:', to)
}

export async function sendClaimCreditsEmail(
  to: string,
  customerName: string | null,
  tokensToGrant: number,
  claimToken: string,
  // Defaults reproduce the original ball-order email exactly.
  //   choose  — several player accounts share this address, so nothing was
  //             credited automatically: the link lets the family pick one by
  //             logging in to it (the claim lands on whichever account does).
  //   context — 'tokens' for a token purchase that could not be credited to
  //             exactly one account: same claim link, no ball-order wording.
  opts: { choose?: boolean; context?: 'ball' | 'tokens' } = {},
) {
  const name = customerName?.split(' ')[0] || 'there'
  const isTokens = opts.context === 'tokens'
  const choose = !!opts.choose || isTokens
  // Choosing means logging in to an existing account; the login page redeems
  // the claim into whichever account signs in.
  const signupLink = `${BASE_URL}/${choose ? 'login' : 'signup'}?claimToken=${claimToken}&credits=${tokensToGrant}`
  const chooseLine = `More than one player account uses this email address, so we have not added ${tokensToGrant === 1 ? 'it' : 'them'} to any of them yet. Open the link and log in to the player's account that should get ${tokensToGrant === 1 ? 'it' : 'them'}.`
  const { data, error } = await getResend().emails.send({
    from: NOTIFICATION_FROM,
    to,
    subject: isTokens
      ? `Claim your ${tokensToGrant} LearnHoops analysis token${tokensToGrant === 1 ? '' : 's'}`
      : `Your LearnHoops ball ships soon — claim your ${tokensToGrant} free analysis token${tokensToGrant === 1 ? '' : 's'}`,
    text: [
      `Hey ${name},`,
      ``,
      isTokens ? `Thanks for your purchase.` : `Your LearnHoops basketball order is confirmed and will ship shortly.`,
      ``,
      ...(choose
        ? [`Your order includes ${tokensToGrant} ${isTokens ? '' : 'free '}analysis token${tokensToGrant === 1 ? '' : 's'} (one token = one shot analysis). ${chooseLine}`]
        : [
            `Your order includes ${tokensToGrant} free analysis token${tokensToGrant === 1 ? '' : 's'} (one token = one shot analysis), but you need a LearnHoops account to use ${tokensToGrant === 1 ? 'it' : 'them'}.`,
            ``,
            `Create your free account with this email address and your ${tokensToGrant === 1 ? 'token' : 'tokens'} will be added automatically:`,
          ]),
      signupLink,
      ``,
      `LearnHoops.com`,
    ].join('\n'),
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111111;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F4F4F5;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #E4E4E7;">

        <tr><td style="background:#000000;padding:22px 32px;">
          <div style="color:#F97316;font-size:20px;font-weight:800;letter-spacing:-0.3px;line-height:1;">LearnHoops<span style="color:#71717A;">.com</span></div>
          <div style="color:#A1A1AA;font-size:12px;margin-top:5px;">Your shot. Perfected by AI.</div>
        </td></tr>

        <tr><td style="padding:36px 32px 8px;">
          <h1 style="margin:0 0 10px;color:#111111;font-size:24px;line-height:1.25;font-weight:800;">${isTokens ? `You have ${tokensToGrant === 1 ? 'a token' : 'tokens'} waiting.` : `Your order is confirmed, and you have ${tokensToGrant === 1 ? 'a free token' : 'free tokens'} waiting.`}</h1>
          <p style="margin:0;color:#52525B;font-size:15px;line-height:1.55;">
            Hey ${escHtml(name)}, ${isTokens ? 'thanks for your purchase. It includes' : 'your LearnHoops basketball is on its way. Your order also includes'}
            <strong>${tokensToGrant} ${isTokens ? '' : 'free '}analysis token${tokensToGrant === 1 ? '' : 's'}</strong>, ${tokensToGrant === 1 ? 'good for one shot analysis' : 'each good for one shot analysis'}. ${choose ? escHtml(chooseLine) : `Create a free account and ${tokensToGrant === 1 ? 'it' : 'they'}'ll be added instantly.`}
          </p>
        </td></tr>

        <tr><td style="padding:20px 32px 4px;">
          <div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;padding:14px 18px;display:inline-block;">
            <div style="color:#C2410C;font-size:13px;font-weight:600;margin-bottom:2px;">Waiting for you</div>
            <div style="color:#9A3412;font-size:28px;font-weight:900;line-height:1;">${tokensToGrant} free token${tokensToGrant === 1 ? '' : 's'}</div>
          </div>
        </td></tr>

        <tr><td style="padding:20px 32px 8px;">
          <a href="${signupLink}" style="display:inline-block;background:#F97316;color:#ffffff;padding:13px 26px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">
            ${choose ? 'Log in' : 'Create my account'} &amp; claim my ${tokensToGrant === 1 ? 'token' : 'tokens'}
          </a>
        </td></tr>

        <tr><td style="padding:4px 32px 32px;">
          <p style="margin:0;color:#A1A1AA;font-size:12px;line-height:1.5;">
            ${choose ? `Log in to the player's account that should get ${tokensToGrant === 1 ? 'it' : 'them'}` : 'Sign up with this email address'} and your ${tokensToGrant === 1 ? 'token' : 'tokens'} will be added automatically.<br/>
            <a href="${signupLink}" style="color:#A1A1AA;word-break:break-all;text-decoration:underline;">${signupLink}</a>
          </p>
        </td></tr>

        <tr><td style="padding:18px 32px;background:#FAFAFA;border-top:1px solid #E4E4E7;">
          <p style="margin:0;color:#A1A1AA;font-size:11px;line-height:1.6;">
            Questions? <a href="${BASE_URL}/support" style="color:#71717A;text-decoration:none;font-weight:600;">Contact us here</a>.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
    `.trim(),
  })

  if (error) {
    console.error('[email] claim credits email failed:', error)
    throw new Error(`Claim credits email failed: ${error.message}`)
  }
  console.log('[email] claim credits email sent:', data?.id, 'to:', to)
}

export async function sendShippingEmail(
  to: string,
  customerName: string | null,
  shippingLink: string,
) {
  const name = customerName?.split(' ')[0] || 'there'
  const { data, error } = await getResend().emails.send({
    from: NOTIFICATION_FROM,
    to,
    subject: 'Your LearnHoops order has shipped!',
    text: [
      `Hey ${name},`,
      ``,
      `Your LearnHoops order is on its way!`,
      ``,
      `Track your package here:`,
      shippingLink,
      ``,
      `Once your player has had a couple of weeks with it, tell us how it is going —`,
      `email support@learnhoops.com. We read every one, and with your permission we`,
      `would love to quote you on the site.`,
      ``,
      `LearnHoops.com`,
    ].join('\n'),
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111111;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F4F4F5;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #E4E4E7;">

        <tr><td style="background:#000000;padding:22px 32px;">
          <div style="color:#F97316;font-size:20px;font-weight:800;letter-spacing:-0.3px;line-height:1;">LearnHoops<span style="color:#71717A;">.com</span></div>
          <div style="color:#A1A1AA;font-size:12px;margin-top:5px;">Your shot. Perfected by AI.</div>
        </td></tr>

        <tr><td style="padding:36px 32px 8px;">
          <h1 style="margin:0 0 10px;color:#111111;font-size:24px;line-height:1.25;font-weight:800;">Your order is on its way!</h1>
          <p style="margin:0;color:#52525B;font-size:15px;line-height:1.55;">
            Hey ${escHtml(name)}, great news — your LearnHoops basketball has shipped and is headed your way.
            Click the button below to track your package.
          </p>
        </td></tr>

        <tr><td style="padding:24px 32px 32px;">
          <a href="${shippingLink}" style="display:inline-block;background:#F97316;color:#ffffff;padding:13px 26px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">
            Track my package
          </a>
          <p style="margin:12px 0 0;color:#A1A1AA;font-size:12px;word-break:break-all;">
            <a href="${shippingLink}" style="color:#A1A1AA;text-decoration:underline;">${shippingLink}</a>
          </p>
        </td></tr>

        <tr><td style="padding:0 32px 28px;">
          <p style="margin:0;color:#52525B;font-size:14px;line-height:1.55;">
            Once your player has had a couple of weeks with it, tell us how it is going —
            <a href="mailto:support@learnhoops.com" style="color:#F97316;text-decoration:none;font-weight:600;">email us</a>.
            We read every one, and with your permission we would love to quote you on the site.
          </p>
        </td></tr>

        <tr><td style="padding:18px 32px;background:#FAFAFA;border-top:1px solid #E4E4E7;">
          <p style="margin:0;color:#A1A1AA;font-size:11px;line-height:1.6;">
            Questions? <a href="${BASE_URL}/support" style="color:#71717A;text-decoration:none;font-weight:600;">Contact us here</a>.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
    `.trim(),
  })

  if (error) {
    console.error('[email] shipping email failed:', error)
    throw new Error(`Shipping email failed: ${error.message}`)
  }
  console.log('[email] shipping email sent:', data?.id, 'to:', to)
}

/**
 * Apology for an order we can't ship because the size is out of stock. Sends
 * the buyer to a resolve page where they choose a full refund or a swap to an
 * in-stock size. Transactional (NOTIFICATION_FROM), never marketing. Two
 * equal-weight CTAs by design — this is a genuine choice, not a buried refund.
 */
export async function sendOrderHoldEmail(
  to: string,
  customerName: string | null,
  resolveLink: string,
  sizeLabel: string,
) {
  const name = customerName?.split(' ')[0] || 'there'
  const refundLink = `${resolveLink}?choice=refund`
  const swapLink = `${resolveLink}?choice=swap`
  const { data, error } = await getResend().emails.send({
    from: NOTIFICATION_FROM,
    to,
    subject: `Your ${sizeLabel} ball isn't ready to ship yet`,
    text: [
      `Hi ${name},`,
      ``,
      `Straight talk: the ${sizeLabel} training ball from your order is out of stock, and we don't have a restock date yet. We're not going to have you wait on a guess.`,
      ``,
      `Here's how we fix it — pick one:`,
      ``,
      `• Get a full refund to your original payment method: ${refundLink}`,
      `• Swap to an in-stock size (same price, ships today): ${swapLink}`,
      ``,
      `Would rather wait it out, or talk to a person? Just reply to this email.`,
      ``,
      `One more thing: the free shot analyses that came with your order are already on your account. This doesn't touch those.`,
      ``,
      `Sorry for the holdup.`,
      `— LearnHoops.com`,
    ].join('\n'),
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111111;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F4F4F5;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #E4E4E7;">

        <tr><td style="background:#000000;padding:22px 32px;">
          <div style="color:#F97316;font-size:20px;font-weight:800;letter-spacing:-0.3px;line-height:1;">LearnHoops<span style="color:#71717A;">.com</span></div>
          <div style="color:#A1A1AA;font-size:12px;margin-top:5px;">Your shot. Perfected by AI.</div>
        </td></tr>

        <tr><td style="padding:36px 32px 8px;">
          <h1 style="margin:0 0 10px;color:#111111;font-size:24px;line-height:1.25;font-weight:800;">Your ${sizeLabel} ball isn't ready to ship yet</h1>
          <p style="margin:0;color:#52525B;font-size:15px;line-height:1.55;">
            Hi ${escHtml(name)}, straight talk: the ${sizeLabel} training ball from your order is out of stock,
            and we don't have a restock date yet. We're not going to have you wait on a guess. Pick one:
          </p>
        </td></tr>

        <tr><td style="padding:22px 32px 8px;">
          <a href="${refundLink}" style="display:inline-block;background:#F97316;color:#ffffff;padding:13px 26px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">
            Get a full refund
          </a>
          <p style="margin:8px 0 0;color:#71717A;font-size:13px;">We'll refund the full amount to your original payment method.</p>
        </td></tr>

        <tr><td style="padding:10px 32px 28px;">
          <a href="${swapLink}" style="display:inline-block;background:#111111;color:#ffffff;padding:13px 26px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">
            Swap to an in-stock size
          </a>
          <p style="margin:8px 0 0;color:#71717A;font-size:13px;">Move to an in-stock size — same price, ships today.</p>
        </td></tr>

        <tr><td style="padding:0 32px 28px;">
          <p style="margin:0 0 10px;color:#52525B;font-size:14px;line-height:1.55;">
            Would rather wait it out, or just want to talk to a person? Reply to this email — we'll take care of it either way.
          </p>
          <p style="margin:0;color:#52525B;font-size:14px;line-height:1.55;">
            One more thing: the free shot analyses that came with your order are already on your account. This doesn't touch those.
          </p>
          <p style="margin:14px 0 0;color:#A1A1AA;font-size:12px;word-break:break-all;">
            Or open your order here: <a href="${resolveLink}" style="color:#A1A1AA;text-decoration:underline;">${resolveLink}</a>
          </p>
        </td></tr>

        <tr><td style="padding:18px 32px;background:#FAFAFA;border-top:1px solid #E4E4E7;">
          <p style="margin:0;color:#A1A1AA;font-size:11px;line-height:1.6;">
            Sorry for the holdup. Questions? <a href="${BASE_URL}/support" style="color:#71717A;text-decoration:none;font-weight:600;">Contact us here</a>.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
    `.trim(),
  })

  if (error) {
    console.error('[email] order-hold email failed:', error)
    throw new Error(`Order-hold email failed: ${error.message}`)
  }
  console.log('[email] order-hold email sent:', data?.id, 'to:', to)
}

/**
 * Confirms how a held order was resolved — a refund on its way, or a swapped
 * size shipping now. Transactional; best-effort at the call site.
 */
export async function sendOrderResolvedEmail(
  to: string,
  customerName: string | null,
  resolution: 'refunded' | 'swapped',
  detail: string,
) {
  const name = customerName?.split(' ')[0] || 'there'
  const refunded = resolution === 'refunded'
  const subject = refunded ? `Your ${detail} refund is on its way` : `Your ${detail} ball is on its way`
  const heading = refunded ? 'Your refund is on its way' : "You're set"
  const bodyLine = refunded
    ? `Your refund is processed. ${detail} is heading back to your original payment method — typically 5–10 business days, depending on your bank. No further action needed on your end.`
    : `You're set. We're shipping your ${detail} training ball now — same price, no extra charge, no new order to place. Tracking lands in your inbox once it's on the truck.`
  const { data, error } = await getResend().emails.send({
    from: NOTIFICATION_FROM,
    to,
    subject,
    text: [`Hi ${name},`, ``, bodyLine, ``, `— LearnHoops.com`].join('\n'),
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111111;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F4F4F5;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #E4E4E7;">
        <tr><td style="background:#000000;padding:22px 32px;">
          <div style="color:#F97316;font-size:20px;font-weight:800;letter-spacing:-0.3px;line-height:1;">LearnHoops<span style="color:#71717A;">.com</span></div>
          <div style="color:#A1A1AA;font-size:12px;margin-top:5px;">Your shot. Perfected by AI.</div>
        </td></tr>
        <tr><td style="padding:36px 32px 28px;">
          <h1 style="margin:0 0 10px;color:#111111;font-size:24px;line-height:1.25;font-weight:800;">${heading}</h1>
          <p style="margin:0;color:#52525B;font-size:15px;line-height:1.55;">Hi ${escHtml(name)}, ${escHtml(bodyLine)}</p>
        </td></tr>
        <tr><td style="padding:18px 32px;background:#FAFAFA;border-top:1px solid #E4E4E7;">
          <p style="margin:0;color:#A1A1AA;font-size:11px;line-height:1.6;">
            Questions? <a href="${BASE_URL}/support" style="color:#71717A;text-decoration:none;font-weight:600;">Contact us here</a>.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
    `.trim(),
  })
  if (error) {
    console.error('[email] order-resolved email failed:', error)
    throw new Error(`Order-resolved email failed: ${error.message}`)
  }
  console.log('[email] order-resolved email sent:', data?.id, 'to:', to, resolution)
}

export async function sendOrgApprovalEmail(
  to: string,
  orgName: string,
  signupToken: string,
) {
  const signupLink = orgSignupLink(signupToken)
  const { data, error } = await getResend().emails.send({
    from: NOTIFICATION_FROM,
    to,
    subject: 'Your LearnHoops organization application has been approved',
    text: [
      `Hi,`,
      ``,
      `Your application for "${orgName}" has been approved.`,
      ``,
      `Use the link below to set up your organization account:`,
      ``,
      signupLink,
      ``,
      `This link is unique to your application — please don't share it.`,
      ``,
      `Once you're set up you'll be able to create teams, manage players, and purchase class packages.`,
      ``,
      `— The LearnHoops Team`,
    ].join('\n'),
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
        <div style="background:#000;padding:24px 32px;border-radius:12px 12px 0 0;">
          <span style="color:#fff;font-size:22px;font-weight:900;letter-spacing:-0.5px;">LearnHoops</span>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:32px;border-radius:0 0 12px 12px;">
          <h2 style="font-size:20px;font-weight:900;color:#000;margin:0 0 12px;">Application approved</h2>
          <p style="color:#374151;font-size:15px;margin:0 0 8px;">Hi,</p>
          <p style="color:#374151;font-size:15px;margin:0 0 20px;">
            Your application for <strong>${escHtml(orgName)}</strong> has been approved.
            Use the button below to set up your organization account.
          </p>
          <a href="${signupLink}" style="display:inline-block;background:#f97316;color:#fff;font-weight:900;font-size:15px;padding:14px 28px;border-radius:10px;text-decoration:none;margin-bottom:20px;">
            Set up your account →
          </a>
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            This link is unique to your application. If you didn't apply, you can ignore this email.
          </p>
        </div>
      </div>
    `,
  })
  if (error) {
    console.error('[email] org approval email failed:', error)
    throw new Error(`Org approval email failed: ${error.message}`)
  }
  console.log('[email] org approval email sent:', data?.id, 'to:', to)
}

export async function sendNextMarketingEmail(
  to: string,
  emailsSentSoFar: number
): Promise<boolean> {
  if (emailsSentSoFar >= MARKETING_EMAILS.length) return false

  const template = MARKETING_EMAILS[emailsSentSoFar]
  const unsubscribe = unsubscribeUrl(to)

  // The drip is unambiguously marketing, so it leaves as MARKETING_FROM: a
  // complaint here must not touch the reputation that carries password resets.
  // List-Unsubscribe is the header, not the link in the body — providers read
  // the header — and the text part is the template's own, not a stub telling
  // the reader to switch clients.
  await getResend().emails.send({
    from: MARKETING_FROM,
    to,
    replyTo: SUPPORT_ADDRESS,
    subject: template.subject,
    headers: {
      'List-Unsubscribe': `<${unsubscribe}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    text: template.getText(to),
    html: template.getHtml(to),
  })
  return true
}

function escHtml(s: string) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }

export async function sendClassPurchaseConfirmationEmail(
  to: string,
  orgName: string,
  playerCount: number,
  teamAccessCode: string,
  dashboardUrl: string,
) {
  const { data, error } = await getResend().emails.send({
    from: NOTIFICATION_FROM,
    to,
    subject: '10-Week Shooting Class — your program is confirmed',
    text: [
      `Hi ${orgName},`,
      ``,
      `Your 10-Week Shooting Class program is confirmed and ready.`,
      ``,
      `Players enrolled: ${playerCount}`,
      `Team access code: ${teamAccessCode}`,
      ``,
      `Your team "10 Week Shooting Class" has been created on your dashboard. Players can join with the access code above.`,
      ``,
      `Balls will ship to the address you provided. You'll receive a separate shipping confirmation when they're on the way.`,
      ``,
      `Access your dashboard here:`,
      dashboardUrl,
      ``,
      `— The LearnHoops Team`,
    ].join('\n'),
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111111;">
  <table role="presentation" width="100%" style="background:#F4F4F5;"><tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #E4E4E7;">

      <tr><td style="background:#000000;padding:22px 32px;">
        <div style="color:#F97316;font-size:20px;font-weight:800;letter-spacing:-0.3px;">LearnHoops<span style="color:#71717A;">.com</span></div>
        <div style="color:#A1A1AA;font-size:12px;margin-top:5px;">Your shot. Perfected by AI.</div>
      </td></tr>

      <tr><td style="padding:36px 32px 8px;">
        <h1 style="margin:0 0 10px;color:#111111;font-size:24px;line-height:1.25;font-weight:800;">Your 10-Week Shooting Class is confirmed!</h1>
        <p style="margin:0;color:#52525B;font-size:15px;line-height:1.55;">
          Hi <strong>${escHtml(orgName)}</strong> — your program is set up and ready to go. Here's everything you need.
        </p>
      </td></tr>

      <tr><td style="padding:20px 32px 8px;">
        <table role="presentation" width="100%" style="background:#F8FAFC;border:1px solid #E4E4E7;border-radius:10px;padding:0;">
          <tr><td style="padding:16px 20px;">
            <div style="color:#71717A;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Players Enrolled</div>
            <div style="color:#111111;font-size:22px;font-weight:800;">${playerCount}</div>
          </td></tr>
          <tr><td style="padding:0 20px 16px;">
            <div style="color:#71717A;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Team Access Code</div>
            <div style="color:#F97316;font-size:26px;font-weight:900;letter-spacing:2px;">${escHtml(teamAccessCode)}</div>
            <div style="color:#52525B;font-size:12px;margin-top:4px;">Players use this code to join the "10 Week Shooting Class" team</div>
          </td></tr>
        </table>
      </td></tr>

      <tr><td style="padding:16px 32px 8px;">
        <p style="margin:0;color:#52525B;font-size:14px;line-height:1.6;">
          <span style="color:#16A34A;font-weight:700;">&#10003;</span>&nbsp; <strong>Team created</strong> — "10 Week Shooting Class" is live on your dashboard<br/>
          <span style="color:#16A34A;font-weight:700;">&#10003;</span>&nbsp; <strong>Balls shipping</strong> — to the address you entered at checkout<br/>
          <span style="color:#16A34A;font-weight:700;">&#10003;</span>&nbsp; <strong>2 shot analyses per player</strong> — tokens are ready to assign
        </p>
      </td></tr>

      <tr><td style="padding:20px 32px 32px;">
        <a href="${dashboardUrl.startsWith('https://') ? dashboardUrl : 'https://learnhoops.com/org/dashboard'}" style="display:inline-block;background:#F97316;color:#ffffff;padding:13px 26px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">
          Go to my dashboard
        </a>
      </td></tr>

      <tr><td style="padding:18px 32px;background:#FAFAFA;border-top:1px solid #E4E4E7;">
        <p style="margin:0;color:#A1A1AA;font-size:11px;line-height:1.6;">
          Questions? <a href="${BASE_URL}/support" style="color:#71717A;text-decoration:none;font-weight:600;">Contact us here</a>.
        </p>
      </td></tr>

    </table>
  </td></tr></table>
</body>
</html>`.trim(),
  })
  if (error) {
    console.error('[email] class purchase confirmation failed:', error)
    throw new Error(`Class confirmation email failed: ${error instanceof Error ? error.message : String(error)}`)
  }
  console.log('[email] class purchase confirmation sent:', data?.id, 'to:', to)
}

export async function sendTeamCreatedEmail(
  to: string,
  orgName: string,
  teamName: string,
  teamAccessCode: string,
  dashboardUrl: string,
) {
  const { data, error } = await getResend().emails.send({
    from: NOTIFICATION_FROM,
    to,
    subject: `Team created: ${teamName}`,
    text: [
      `Hi ${orgName},`,
      ``,
      `Your team "${teamName}" has been created.`,
      ``,
      `Team access code: ${teamAccessCode}`,
      ``,
      `Players join your team by entering this code on LearnHoops.com.`,
      ``,
      `Manage your team here: ${dashboardUrl}`,
      ``,
      `— The LearnHoops Team`,
    ].join('\n'),
    html: `
<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" style="background:#F4F4F5;"><tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:14px;border:1px solid #E4E4E7;">
      <tr><td style="background:#000;padding:22px 32px;">
        <div style="color:#F97316;font-size:20px;font-weight:800;">LearnHoops<span style="color:#71717A;">.com</span></div>
      </td></tr>
      <tr><td style="padding:36px 32px 8px;">
        <h1 style="margin:0 0 10px;color:#111;font-size:22px;font-weight:800;">Team created!</h1>
        <p style="margin:0;color:#52525B;font-size:15px;line-height:1.55;">
          Hi <strong>${escHtml(orgName)}</strong> — your team <strong>${escHtml(teamName)}</strong> is live.
        </p>
      </td></tr>
      <tr><td style="padding:20px 32px 8px;">
        <div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;padding:16px 20px;">
          <div style="color:#92400E;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Team Access Code</div>
          <div style="color:#F97316;font-size:30px;font-weight:900;letter-spacing:3px;">${escHtml(teamAccessCode)}</div>
          <div style="color:#52525B;font-size:12px;margin-top:6px;">Players enter this code on LearnHoops.com to join the team.</div>
        </div>
      </td></tr>
      <tr><td style="padding:20px 32px 32px;">
        <a href="${dashboardUrl.startsWith('https://') ? dashboardUrl : 'https://learnhoops.com/org/dashboard'}" style="display:inline-block;background:#F97316;color:#fff;padding:13px 26px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Go to dashboard</a>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`.trim(),
  })
  if (error) {
    console.error('[email] team created email failed:', error)
    throw new Error(`Team created email failed: ${error instanceof Error ? error.message : String(error)}`)
  }
  console.log('[email] team created email sent:', data?.id, 'to:', to)
}

export async function sendPasswordChangedEmail(to: string) {
  const { data, error } = await getResend().emails.send({
    from: NOTIFICATION_FROM,
    to,
    subject: 'Your LearnHoops password was changed',
    text: [
      `Your LearnHoops password was just changed.`,
      ``,
      `If you made this change, you can ignore this email.`,
      ``,
      `If you did NOT make this change, contact us right away at ${BASE_URL}/support`,
      ``,
      `— The LearnHoops Team`,
    ].join('\n'),
    html: `
<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" style="background:#F4F4F5;"><tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:14px;border:1px solid #E4E4E7;">
      <tr><td style="background:#000;padding:22px 32px;">
        <div style="color:#F97316;font-size:20px;font-weight:800;">LearnHoops<span style="color:#71717A;">.com</span></div>
      </td></tr>
      <tr><td style="padding:36px 32px 8px;">
        <h1 style="margin:0 0 10px;color:#111;font-size:22px;font-weight:800;">Password changed</h1>
        <p style="margin:0;color:#52525B;font-size:15px;line-height:1.55;">
          Your LearnHoops password was just changed. If this was you, no action needed.
        </p>
      </td></tr>
      <tr><td style="padding:12px 32px 32px;">
        <p style="margin:0;color:#DC2626;font-size:14px;font-weight:600;">
          If you did NOT make this change, <a href="${BASE_URL}/support" style="color:#DC2626;text-decoration:underline;">contact us right away</a>.
        </p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`.trim(),
  })
  if (error) console.error('[email] password changed email failed:', error)
  console.log('[email] password changed email sent:', data?.id, 'to:', to)
}

export async function sendTokenPurchaseConfirmationEmail(
  to: string,
  orgName: string,
  quantity: number,
  dashboardUrl: string,
) {
  const { data, error } = await getResend().emails.send({
    from: NOTIFICATION_FROM,
    to,
    subject: `${quantity} analysis token${quantity !== 1 ? 's' : ''} added to your account`,
    text: [
      `Hi ${orgName},`,
      ``,
      `${quantity} analysis token${quantity !== 1 ? 's' : ''} have been added to your LearnHoops account.`,
      ``,
      `Manage your tokens here: ${dashboardUrl}`,
      ``,
      `— The LearnHoops Team`,
    ].join('\n'),
    html: `
<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" style="background:#F4F4F5;"><tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:14px;border:1px solid #E4E4E7;">
      <tr><td style="background:#000;padding:22px 32px;">
        <div style="color:#F97316;font-size:20px;font-weight:800;">LearnHoops<span style="color:#71717A;">.com</span></div>
      </td></tr>
      <tr><td style="padding:36px 32px 8px;">
        <h1 style="margin:0 0 10px;color:#111;font-size:22px;font-weight:800;">Tokens added!</h1>
        <p style="margin:0;color:#52525B;font-size:15px;line-height:1.55;">
          Hi <strong>${escHtml(orgName)}</strong> — <strong>${quantity} analysis token${quantity !== 1 ? 's' : ''}</strong> have been added to your account.
        </p>
      </td></tr>
      <tr><td style="padding:20px 32px 32px;">
        <a href="${dashboardUrl.startsWith('https://') ? dashboardUrl : 'https://learnhoops.com/org/dashboard'}" style="display:inline-block;background:#F97316;color:#fff;padding:13px 26px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Go to dashboard</a>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`.trim(),
  })
  if (error) console.error('[email] token purchase email failed:', error)
  console.log('[email] token purchase email sent:', data?.id, 'to:', to)
}

export async function sendAccountDeletedEmail(to: string) {
  const { data, error } = await getResend().emails.send({
    from: NOTIFICATION_FROM,
    to,
    subject: 'Your LearnHoops account has been deleted',
    text: [
      `Your LearnHoops account has been permanently deleted.`,
      `All your data, submissions, and tokens have been removed.`,
      ``,
      `If you did NOT request this, contact us right away at ${BASE_URL}/support`,
      ``,
      `— The LearnHoops Team`,
    ].join('\n'),
    html: `
<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" style="background:#F4F4F5;"><tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:14px;border:1px solid #E4E4E7;">
      <tr><td style="background:#000;padding:22px 32px;">
        <div style="color:#F97316;font-size:20px;font-weight:800;">LearnHoops<span style="color:#71717A;">.com</span></div>
      </td></tr>
      <tr><td style="padding:36px 32px 8px;">
        <h1 style="margin:0 0 10px;color:#111;font-size:22px;font-weight:800;">Account deleted</h1>
        <p style="margin:0;color:#52525B;font-size:15px;line-height:1.55;">
          Your LearnHoops account has been permanently deleted. All your data, submissions, and tokens have been removed.
        </p>
      </td></tr>
      <tr><td style="padding:12px 32px 32px;">
        <p style="margin:0;color:#DC2626;font-size:14px;font-weight:600;">
          If you did NOT request this deletion, <a href="${BASE_URL}/support" style="color:#DC2626;text-decoration:underline;">contact us right away</a>.
        </p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`.trim(),
  })
  if (error) console.error('[email] account deleted email failed:', error)
  console.log('[email] account deleted email sent:', data?.id, 'to:', to)
}

export async function sendLeftTeamEmail(to: string, teamName: string) {
  const { data, error } = await getResend().emails.send({
    from: NOTIFICATION_FROM,
    to,
    subject: `You've left ${teamName}`,
    text: [
      `You have left the team "${teamName}" on LearnHoops.`,
      ``,
      `If you did not do this, contact us at ${BASE_URL}/support`,
      ``,
      `— The LearnHoops Team`,
    ].join('\n'),
    html: `
<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" style="background:#F4F4F5;"><tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:14px;border:1px solid #E4E4E7;">
      <tr><td style="background:#000;padding:22px 32px;">
        <div style="color:#F97316;font-size:20px;font-weight:800;">LearnHoops<span style="color:#71717A;">.com</span></div>
      </td></tr>
      <tr><td style="padding:36px 32px 32px;">
        <h1 style="margin:0 0 10px;color:#111;font-size:22px;font-weight:800;">You've left ${escHtml(teamName)}</h1>
        <p style="margin:0;color:#52525B;font-size:15px;line-height:1.55;">
          You have been removed from <strong>${escHtml(teamName)}</strong> on LearnHoops. If you did not do this, <a href="${BASE_URL}/support" style="color:#F97316;text-decoration:underline;">contact us</a>.
        </p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`.trim(),
  })
  if (error) console.error('[email] left team email failed:', error)
  console.log('[email] left team email sent:', data?.id, 'to:', to)
}

// A /support form submission, forwarded to the support inbox. Reply-to is
// the visitor's address so replying in Gmail goes straight back to them.
export async function sendSupportRequestEmail(req: {
  topic: string
  name: string
  email: string
  message: string
}) {
  const firstName = req.name.split(/\s+/)[0] || req.name

  // Pre-written reply for the "Reply to X" button: greeting and sign-off
  // around an empty middle, with the original message quoted below — the
  // support person only types the answer. Quoted text is capped so the
  // mailto: URL stays within client limits.
  const quoted = req.message.length > 500 ? req.message.slice(0, 500) + '…' : req.message
  const replyBody = [
    `Hi ${firstName},`,
    '',
    '',
    '',
    'Best,',
    'The LearnHoops Team',
    'learnhoops.com',
    '',
    '----------------------------------------',
    `${req.name} wrote:`,
    ...quoted.split('\n').map((l) => `> ${l}`),
  ].join('\n')
  const replyHref = `mailto:${req.email}?subject=${encodeURIComponent('Re: your LearnHoops support request')}&body=${encodeURIComponent(replyBody)}`

  const { data, error } = await getResend().emails.send({
    // Distinct sender name so the inbox can recognize and filter these.
    from: `LearnHoops Support Form <${SUPPORT_ADDRESS}>`,
    to: INTERNAL_INBOX,
    replyTo: req.email,
    subject: `Support request from ${req.name} — ${req.topic}`,
    text: [
      `New message from the LearnHoops support form`,
      ``,
      `From:  ${req.name}`,
      `Email: ${req.email}`,
      `Topic: ${req.topic}`,
      ``,
      `Message:`,
      req.message,
      ``,
      `—`,
      `Reply to this email to answer ${firstName} directly.`,
      `Sent from the contact form at ${BASE_URL}/support`,
    ].join('\n'),
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111111;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F4F4F5;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #E4E4E7;">

        <!-- Brand bar -->
        <tr><td style="background:#000000;padding:22px 32px;">
          <div style="color:#F97316;font-size:20px;font-weight:800;letter-spacing:-0.3px;line-height:1;">LearnHoops<span style="color:#71717A;">.com</span></div>
          <div style="color:#A1A1AA;font-size:12px;margin-top:5px;">New support request</div>
        </td></tr>

        <!-- Heading -->
        <tr><td style="padding:32px 32px 20px;">
          <h1 style="margin:0;color:#111111;font-size:22px;line-height:1.3;font-weight:800;">${escHtml(req.name)} sent a message</h1>
          <p style="margin:6px 0 0;color:#52525B;font-size:14px;line-height:1.55;">
            From the contact form at learnhoops.com/support
          </p>
        </td></tr>

        <!-- Details -->
        <tr><td style="padding:0 32px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #E4E4E7;border-radius:10px;">
            <tr>
              <td style="padding:12px 16px;border-bottom:1px solid #E4E4E7;width:90px;color:#A1A1AA;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Topic</td>
              <td style="padding:12px 16px;border-bottom:1px solid #E4E4E7;color:#111111;font-size:14px;font-weight:600;">${escHtml(req.topic)}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;border-bottom:1px solid #E4E4E7;color:#A1A1AA;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Name</td>
              <td style="padding:12px 16px;border-bottom:1px solid #E4E4E7;color:#111111;font-size:14px;font-weight:600;">${escHtml(req.name)}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;color:#A1A1AA;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Email</td>
              <td style="padding:12px 16px;color:#111111;font-size:14px;font-weight:600;"><a href="mailto:${escHtml(req.email)}" style="color:#F97316;text-decoration:none;">${escHtml(req.email)}</a></td>
            </tr>
          </table>
        </td></tr>

        <!-- Message -->
        <tr><td style="padding:20px 32px 0;">
          <p style="margin:0 0 8px;color:#A1A1AA;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Message</p>
          <div style="background:#FAFAFA;border:1px solid #E4E4E7;border-radius:10px;padding:16px 18px;color:#3F3F46;font-size:15px;line-height:1.65;white-space:pre-wrap;">${escHtml(req.message)}</div>
        </td></tr>

        <!-- Reply CTA -->
        <tr><td style="padding:24px 32px 32px;">
          <a href="${escHtml(replyHref)}" style="display:inline-block;background:#F97316;color:#ffffff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;">
            Reply to ${escHtml(firstName)}
          </a>
          <p style="margin:10px 0 0;color:#A1A1AA;font-size:12px;">Opens a pre-written reply — greeting and sign-off included, just type your answer in the middle.</p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:18px 32px;background:#FAFAFA;border-top:1px solid #E4E4E7;">
          <p style="margin:0;color:#A1A1AA;font-size:11px;line-height:1.6;">
            Sent automatically by the support form at
            <a href="${BASE_URL}/support" style="color:#71717A;text-decoration:underline;">learnhoops.com/support</a>.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`.trim(),
  })
  if (error) {
    console.error('[email] support request email failed:', error)
    throw new Error('Support notification failed to send')
  }
  console.log('[email] support request email sent:', data?.id, 'from visitor:', req.email)
}

// Abandoned-checkout recovery: sent once when a Stripe checkout session
// expires unpaid (the buyer entered their email at Stripe but never paid).
// The recovery URL reopens their exact cart.
export async function sendAbandonedCheckoutEmail(
  to: string,
  name: string | null,
  recoveryUrl: string,
) {
  const unsubscribe = unsubscribeUrl(to)
  const firstName = name ? name.split(' ')[0] : null
  const greeting = firstName ? `Hey ${firstName},` : 'Hey,'

  const { data, error } = await getResend().emails.send({
    from: MARKETING_FROM,
    to,
    replyTo: SUPPORT_ADDRESS,
    subject: 'Your LearnHoops training ball is still waiting',
    headers: {
      'List-Unsubscribe': `<${unsubscribe}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    text: [
      greeting,
      ``,
      `You were one step away from the LearnHoops Training Ball — the ball with hand-placement guides that build consistent shooting form, plus free AI shot analyses included with every ball.`,
      ``,
      `Your cart is saved. Pick up right where you left off:`,
      recoveryUrl,
      ``,
      `LearnHoops.com`,
      `Unsubscribe: ${unsubscribe}`,
    ].join('\n'),
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111111;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F4F4F5;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #E4E4E7;">

        <!-- Brand bar -->
        <tr><td style="background:#000000;padding:22px 32px;">
          <div style="color:#F97316;font-size:20px;font-weight:800;letter-spacing:-0.3px;line-height:1;">LearnHoops<span style="color:#71717A;">.com</span></div>
          <div style="color:#A1A1AA;font-size:12px;margin-top:5px;">Your shot. Perfected by AI.</div>
        </td></tr>

        <!-- Hero -->
        <tr><td style="padding:36px 32px 8px;">
          <h1 style="margin:0 0 10px;color:#111111;font-size:24px;line-height:1.25;font-weight:800;">Your training ball is still waiting.</h1>
          <p style="margin:0;color:#52525B;font-size:15px;line-height:1.55;">
            ${escHtml(greeting)} you were one step away from the LearnHoops Training Ball —
            hand-placement guides that build consistent shooting form, with free AI
            shot analyses included with every ball. Your cart is saved.
          </p>
        </td></tr>

        <!-- Primary CTA -->
        <tr><td style="padding:24px 32px 8px;">
          <a href="${recoveryUrl}" style="display:inline-block;background:#F97316;color:#ffffff;padding:13px 26px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">
            Finish my order
          </a>
        </td></tr>

        <!-- Plain-text link fallback -->
        <tr><td style="padding:6px 32px 32px;">
          <p style="margin:0;color:#A1A1AA;font-size:12px;line-height:1.5;">
            Or paste this link into your browser:<br/>
            <a href="${recoveryUrl}" style="color:#A1A1AA;word-break:break-all;text-decoration:underline;">${recoveryUrl}</a>
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:18px 32px;background:#FAFAFA;border-top:1px solid #E4E4E7;">
          <p style="margin:0;color:#A1A1AA;font-size:11px;line-height:1.6;">
            You're getting this because you started an order at <a href="${BASE_URL}" style="color:#71717A;text-decoration:none;font-weight:600;">LearnHoops.com</a>.
            &nbsp;·&nbsp;
            <a href="${escHtml(unsubscribe)}" style="color:#71717A;text-decoration:underline;">Unsubscribe</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
    `.trim(),
  })

  if (error) {
    console.error('[email] abandoned-checkout email failed:', error, 'to:', to)
    throw new Error(`Resend send failed: ${error.message || JSON.stringify(error)}`)
  }
  console.log('[email] sent abandoned-checkout email:', data?.id, 'to:', to)
}

/**
 * Sent once, after someone's first analysis finishes: how to film so the next
 * one grades accurately.
 *
 * It exists because of a specific, common mistake — filming from behind the
 * shooter, which hides the elbow and the hands, the two things the grader
 * leans on hardest. The advice mirrors the filming FAQ at /support#filming;
 * if that guidance changes, change it here too.
 */
export async function sendFilmingTipsEmail(to: string) {
  const guide = `${BASE_URL}/support#filming`
  const unsubscribe = unsubscribeUrl(to)

  const { data, error } = await getResend().emails.send({
    from: SUPPORT_FROM,
    to,
    // Plain and descriptive on purpose. A benefit-promise subject ("get a
    // better score…") is a Promotions-tab signal; naming what the email
    // contains reads as the follow-up to an action they just took.
    subject: 'How to film your next shot for an accurate analysis',
    text: [
      `Thanks for your first upload. One thing makes a bigger difference to your score than anything else: where you put the camera.`,
      ``,
      `1. FILM FROM THE FRONT.`,
      `Stand under or just behind the basket, looking back at the shooter. Straight on works, and so does standing a little off to one side - if you angle it, go toward the side the guide hand is on.`,
      `That view shows whether the elbow flares out, whether the guide hand stays passive, and whether the feet and shoulders are square. Filming from behind the shooter hides all three.`,
      ``,
      `2. GET THE WHOLE BODY IN FRAME.`,
      `Head to feet, the whole way through the shot. Stance, knee bend and foot position are all graded, and a clip cropped at the waist loses them. Not from across the gym either - that far away the elbow and hands are too small to read.`,
      ``,
      `3. ONE SHOT PER CLIP.`,
      `Just the shot, a few seconds long. One person, one attempt.`,
      ``,
      `Want arc and ball rotation graded too? Those two are the exception - filmed head-on the ball flies straight at the camera. For them, film a second clip from the side with the whole flight path and the rim in frame.`,
      ``,
      `Full guide: ${guide}`,
      ``,
      `LearnHoops.com`,
      `Unsubscribe: ${unsubscribe}`,
    ].join('\n'),
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111111;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F4F4F5;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #E4E4E7;">

        <tr><td style="background:#000000;padding:22px 32px;">
          <div style="color:#F97316;font-size:20px;font-weight:800;letter-spacing:-0.3px;line-height:1;">LearnHoops<span style="color:#71717A;">.com</span></div>
          <div style="color:#A1A1AA;font-size:12px;margin-top:5px;">Your shot. Perfected by AI.</div>
        </td></tr>

        <tr><td style="padding:36px 32px 4px;">
          <h1 style="margin:0 0 10px;color:#111111;font-size:22px;font-weight:800;line-height:1.25;">Where you put the camera changes your score</h1>
          <p style="margin:0;color:#52525B;font-size:15px;line-height:1.6;">
            Thanks for your first upload. One thing affects how accurate your analysis is more than anything else, so it is worth 30 seconds before your next one.
          </p>
        </td></tr>

        <tr><td style="padding:24px 32px 0;">
          <table role="presentation" width="100%" style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:12px;">
            <tr><td style="padding:18px 20px;">
              <div style="color:#9A3412;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;">1 &middot; Film from the front</div>
              <p style="margin:8px 0 0;color:#7C2D12;font-size:14px;line-height:1.6;">
                Stand under or just behind the basket, looking back at the shooter. Straight on works, and so does standing a little off to one side &mdash; if you angle it, go toward the side the <strong>guide hand</strong> is on.
              </p>
              <p style="margin:10px 0 0;color:#7C2D12;font-size:14px;line-height:1.6;">
                That view shows whether the elbow flares out, whether the guide hand stays passive, and whether the feet and shoulders are square. <strong>Filming from behind the shooter hides all three.</strong>
              </p>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:14px 32px 0;">
          <table role="presentation" width="100%" style="background:#FAFAFA;border:1px solid #E4E4E7;border-radius:12px;">
            <tr><td style="padding:18px 20px;">
              <div style="color:#3F3F46;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;">2 &middot; Whole body in frame</div>
              <p style="margin:8px 0 0;color:#52525B;font-size:14px;line-height:1.6;">
                Head to feet, the whole way through the shot. Stance, knee bend and foot position are all graded, and a clip cropped at the waist loses them. Not from across the gym either &mdash; that far away the elbow and hands are too small to read.
              </p>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:14px 32px 0;">
          <table role="presentation" width="100%" style="background:#FAFAFA;border:1px solid #E4E4E7;border-radius:12px;">
            <tr><td style="padding:18px 20px;">
              <div style="color:#3F3F46;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;">3 &middot; One shot per clip</div>
              <p style="margin:8px 0 0;color:#52525B;font-size:14px;line-height:1.6;">
                Just the shot, a few seconds long. One person, one attempt.
              </p>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:20px 32px 0;">
          <p style="margin:0;color:#52525B;font-size:14px;line-height:1.6;">
            <strong style="color:#111111;">Want arc and ball rotation graded too?</strong> Those two are the exception &mdash; filmed head-on the ball flies straight at the camera. For them, film a second clip from the side with the whole flight path and the rim in frame.
          </p>
        </td></tr>

        <tr><td align="center" style="padding:26px 32px 32px;">
          <a href="${guide}" style="display:inline-block;background:#F97316;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:13px 28px;border-radius:10px;">Read the full filming guide</a>
        </td></tr>

        <tr><td style="background:#FAFAFA;border-top:1px solid #E4E4E7;padding:18px 32px;">
          <p style="margin:0;color:#A1A1AA;font-size:12px;line-height:1.6;">
            You are getting this once, after your first analysis.
            <a href="${escHtml(unsubscribe)}" style="color:#A1A1AA;text-decoration:underline;">Unsubscribe</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`.trim(),
  })

  if (error) {
    console.error('[email] filming tips email failed:', error, 'to:', to)
    return
  }
  console.log('[email] sent filming tips email:', data?.id, 'to:', to)
}

// ---------------------------------------------------------------------------
// Org results delivery + offer purchases
// ---------------------------------------------------------------------------

function gradeLetter(score: number): { letter: string; label: string } {
  if (score >= 9) return { letter: 'A+', label: 'Elite Form' }
  if (score >= 8) return { letter: 'A', label: 'Excellent Form' }
  if (score > 7) return { letter: 'B+', label: 'Good Form' }
  if (score >= 6) return { letter: 'B', label: 'Okay Form' }
  if (score >= 5) return { letter: 'C', label: 'Below Average' }
  if (score >= 4) return { letter: 'D', label: 'Needs Work' }
  return { letter: 'F', label: 'Major Issues' }
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export interface OrgResultsEmailOffer {
  title: string
  description: string | null
  priceCents: number
  regularPriceCents: number
}

export interface OrgResultsEmailInput {
  playerName: string | null
  orgName: string
  teamName: string
  score: number
  token: string
  /** The org's purchasable offers (empty when selling is off). Max 4 rendered. */
  offers: OrgResultsEmailOffer[]
  recipientEmail: string
}

// ---------------------------------------------------------------------------
// Player emails: one template for everything a coach or org sends a player
// (results, programs, basketballs, plain messages). The org results email
// below delegates here, so there is exactly one look and one footer.
// ---------------------------------------------------------------------------

export interface PlayerEmailResultsBlock {
  score: number
  /** The link always opens the full report (team uploads are never paywalled). */
  token: string
}

export interface PlayerEmailOffersBlock {
  /** Block title, e.g. "Available from Northside". */
  heading: string
  /** Max 4 rendered. */
  items: OrgResultsEmailOffer[]
  /** Where to buy. Omit when the results button above is the place to buy. */
  href?: string | null
  cta?: string | null
  /** Small print under the block. */
  note?: string | null
}

export interface PlayerEmailRenderInput {
  recipientEmail: string
  /** Final subject (tokens already replaced). CR/LF are stripped again here. */
  subject: string
  /** Final plain-text message (tokens already replaced). Blank line = new paragraph. */
  message: string
  /** Optional large heading above the message. */
  heading?: string | null
  orgName: string | null
  teamName: string
  sender: {
    kind: 'org' | 'coach'
    /** Coach display name or the org name. */
    name: string
    /** True when `name` is a generic fallback ("Your coach"). */
    generic?: boolean
  }
  results?: PlayerEmailResultsBlock | null
  offers?: PlayerEmailOffersBlock | null
  /** A button to the LearnHoops basketball shop. */
  shopLink?: boolean
}

/** Removes anything that could end a header line, and trims. */
export function cleanSubject(subject: string): string {
  return subject
    .replace(/[\r\n\u2028\u2029]+/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}

function paragraphsOf(message: string): string[] {
  return message
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((p) => p.replace(/^\n+|\n+$/g, '').trimEnd())
    .filter((p) => p.trim().length > 0)
}

/**
 * Renders a player email. Every string that came from a person (subject,
 * message, names, org/team names, offer text) is HTML-escaped here, so
 * callers pass raw text.
 */
export function renderPlayerEmail(input: PlayerEmailRenderInput): {
  subject: string
  text: string
  html: string
} {
  const subject = cleanSubject(input.subject)
  const unsubscribe = unsubscribeUrl(input.recipientEmail)
  const org = input.orgName?.trim() || null
  const team = input.teamName.trim()
  const senderName = input.sender.name.trim() || (input.sender.kind === 'org' ? org ?? team : 'Your coach')
  const generic = !!input.sender.generic
  const reachName = generic ? senderName.charAt(0).toLowerCase() + senderName.slice(1) : senderName

  const fromLine =
    input.sender.kind === 'org'
      ? ['From ' + (org ?? senderName), team].join(' · ')
      : ['From ' + (generic ? reachName : senderName), team, org].filter(Boolean).join(' · ')
  const headerSub = [org, team].filter(Boolean).join(' · ')
  const footerWhy = `You're getting this because you're on ${team}${org ? ` with ${org}` : ''}.`
  const footerWho = `${senderName} sent it through LearnHoops. Reply to this email to reach ${reachName}.`

  const paragraphs = paragraphsOf(input.message)
  const results = input.results ?? null
  const resultsLink = results ? `${BASE_URL}/results/${results.token}` : null
  const grade = results ? gradeLetter(results.score) : null
  const scoreText = results ? results.score.toFixed(1) : ''
  const offers = input.offers && input.offers.items.length ? { ...input.offers, items: input.offers.items.slice(0, 4) } : null
  const shopUrl = `${BASE_URL}/shop`

  const text = [
    fromLine,
    ``,
    ...(input.heading ? [input.heading, ``] : []),
    ...paragraphs.flatMap((p) => [p, ``]),
    ...(results && grade
      ? [
          `Overall score: ${scoreText} / 10  (${grade.letter}, ${grade.label})`,
          `See your results: ${resultsLink}`,
          ``,
        ]
      : []),
    ...(offers
      ? [
          `${offers.heading}:`,
          ...offers.items.map(
            (o) =>
              `- ${o.title}: ${money(o.priceCents)}${o.priceCents < o.regularPriceCents ? ` (regular ${money(o.regularPriceCents)})` : ''}`
          ),
          ...(offers.href ? [`${offers.cta || 'See the details'}: ${offers.href}`] : []),
          ...(offers.note ? [offers.note] : []),
          ``,
        ]
      : []),
    ...(input.shopLink ? [`Shop LearnHoops basketballs: ${shopUrl}`, ``] : []),
    `--`,
    footerWhy,
    footerWho,
    `Unsubscribe: ${unsubscribe}`,
  ].join('\n')

  const paragraphHtml = paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 14px;color:#27272A;font-size:15px;line-height:1.6;">${escHtml(p).replace(/\n/g, '<br/>')}</p>`
    )
    .join('')

  const offerRows = offers
    ? offers.items
        .map(
          (o) => `
        <tr><td style="padding:0 0 10px;">
          <table role="presentation" width="100%" style="border:1px solid #E4E4E7;border-radius:10px;">
            <tr>
              <td style="padding:14px 16px;">
                <div style="color:#111;font-size:15px;font-weight:800;">${escHtml(o.title)}</div>
                ${o.description ? `<div style="color:#52525B;font-size:13px;line-height:1.5;margin-top:3px;">${escHtml(o.description)}</div>` : ''}
              </td>
              <td align="right" style="padding:14px 16px;white-space:nowrap;vertical-align:top;">
                ${o.priceCents < o.regularPriceCents ? `<div style="color:#A1A1AA;font-size:12px;text-decoration:line-through;">${money(o.regularPriceCents)}</div>` : ''}
                <div style="color:#111;font-size:18px;font-weight:900;">${money(o.priceCents)}</div>
              </td>
            </tr>
          </table>
        </td></tr>`
        )
        .join('')
    : ''

  const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;">
  <table role="presentation" width="100%" style="background:#F4F4F5;"><tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #E4E4E7;">
      <tr><td style="background:#000;padding:22px 32px;">
        <div style="color:#FF5C1A;font-size:20px;font-weight:800;letter-spacing:-0.3px;line-height:1;">LearnHoops<span style="color:#71717A;">.com</span></div>
        <div style="color:#A1A1AA;font-size:12px;margin-top:5px;">${escHtml(headerSub)}</div>
      </td></tr>
      <tr><td style="padding:24px 32px 0;">
        <div style="color:#71717A;font-size:13px;line-height:1.5;">${escHtml(fromLine)}</div>
      </td></tr>
      <tr><td style="padding:16px 32px 4px;">
        ${input.heading ? `<h1 style="margin:0 0 12px;color:#111;font-size:24px;line-height:1.25;font-weight:800;">${escHtml(input.heading)}</h1>` : ''}
        ${paragraphHtml}
      </td></tr>
      ${
        results && grade
          ? `<tr><td align="center" style="padding:16px 32px 8px;">
        <table role="presentation" style="border-collapse:separate;">
          <tr><td align="center" style="width:132px;height:132px;padding:0;border-radius:50%;border:3px solid #FF5C1A;background:#FAFAFA;">
            <div style="color:#111;font-size:42px;font-weight:900;line-height:1;">${scoreText}</div>
            <div style="color:#52525B;font-size:12px;margin-top:4px;">out of 10</div>
          </td></tr>
        </table>
        <div style="color:#111;font-size:26px;font-weight:900;margin-top:12px;">${grade.letter}</div>
        <div style="color:#52525B;font-size:14px;">${escHtml(grade.label)}</div>
      </td></tr>
      <tr><td align="center" style="padding:20px 32px 8px;">
        <a href="${resultsLink}" style="display:inline-block;background:#FF5C1A;color:#111;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:800;font-size:15px;">See your results</a>
      </td></tr>`
          : ''
      }
      ${
        offers
          ? `<tr><td style="padding:24px 32px 8px;">
        <div style="color:#111;font-size:16px;font-weight:800;margin-bottom:12px;">${escHtml(offers.heading)}</div>
        <table role="presentation" width="100%">${offerRows}</table>
        ${offers.href ? `<div style="padding:6px 0 4px;"><a href="${escHtml(offers.href)}" style="display:inline-block;background:#FF5C1A;color:#111;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:800;font-size:14px;">${escHtml(offers.cta || 'See the details')}</a></div>` : ''}
        ${offers.note ? `<div style="color:#71717A;font-size:12px;margin-top:6px;">${escHtml(offers.note)}</div>` : ''}
      </td></tr>`
          : ''
      }
      ${
        input.shopLink
          ? `<tr><td align="center" style="padding:20px 32px 8px;">
        <a href="${shopUrl}" style="display:inline-block;background:#111;color:#fff;padding:13px 24px;border-radius:10px;text-decoration:none;font-weight:800;font-size:14px;">Shop LearnHoops basketballs</a>
      </td></tr>`
          : ''
      }
      <tr><td style="padding:24px 32px 32px;">
        <p style="margin:0;border-top:1px solid #E4E4E7;padding-top:16px;color:#71717A;font-size:12px;line-height:1.6;">
          ${escHtml(footerWhy)} ${escHtml(footerWho)}<br/>
          ${results ? 'Your results link is private to you. ' : ''}<a href="${escHtml(unsubscribe)}" style="color:#71717A;">Unsubscribe</a>
        </p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`.trim()

  return { subject, text, html }
}

/**
 * Sends a rendered player email on behalf of a coach or organization:
 * `"<name> via LearnHoops" <noreply@...>`, Reply-To the actual sender.
 * Resend 6 returns `{ error }` instead of throwing, so an error is thrown
 * here and callers only need a try/catch.
 */
export async function sendPlayerEmail(args: {
  to: string
  fromName: string
  replyTo: string
  subject: string
  text: string
  html: string
}): Promise<string | null> {
  if (playerEmailPaused('player email', args.to)) return null
  const unsubscribe = unsubscribeUrl(args.to)
  const { data, error } = await getResend().emails.send({
    from: onBehalfFrom(args.fromName),
    to: args.to,
    replyTo: args.replyTo,
    subject: cleanSubject(args.subject),
    text: args.text,
    html: args.html,
    headers: {
      'List-Unsubscribe': `<${unsubscribe}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  })
  if (error) {
    throw new Error(`Player email failed: ${typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : String(error)}`)
  }
  return data?.id ?? null
}

/**
 * The score email an organization sends its players from the legacy Results
 * send route. Rendered separately from sending so the Results tab can show an
 * exact preview. Delegates to renderPlayerEmail so there is one template.
 *
 * Transactional in shape (your score, your link) but it carries the org's
 * offers, so it follows the bulk rules: List-Unsubscribe pair, suppression
 * honored by the caller, text twin always present.
 */
export function renderOrgResultsEmail(input: OrgResultsEmailInput): {
  subject: string
  text: string
  html: string
} {
  const first = input.playerName?.trim() || 'there'
  const scoreText = input.score.toFixed(1)
  const offers = input.offers.slice(0, 4)
  const subject = `${first === 'there' ? 'Your' : `${first}, your`} shot score from ${input.orgName}: ${scoreText}/10`
  const rendered = renderPlayerEmail({
    recipientEmail: input.recipientEmail,
    subject,
    heading: `Hi ${first}, your shot has been graded.`,
    message: `Your latest shot with ${input.teamName} has been graded by LearnHoops. Your overall score is below, and your full report shows what to work on next.`,
    orgName: input.orgName,
    teamName: input.teamName,
    sender: { kind: 'org', name: input.orgName },
    results: {
      score: input.score,
      token: input.token,
    },
    offers: offers.length
      ? {
          heading: `Available from ${input.orgName}`,
          items: offers,
          note: 'Buy any of these from your results page, using the button above.',
        }
      : null,
  })
  return rendered
}

export async function sendOrgResultsEmail(
  input: OrgResultsEmailInput,
  replyTo: string
): Promise<void> {
  if (playerEmailPaused('org results email', input.recipientEmail)) return
  const { subject, text, html } = renderOrgResultsEmail(input)
  const unsubscribe = unsubscribeUrl(input.recipientEmail)
  const { error } = await getResend().emails.send({
    from: NOTIFICATION_FROM,
    to: input.recipientEmail,
    replyTo,
    subject,
    text,
    html,
    headers: {
      'List-Unsubscribe': `<${unsubscribe}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  })
  if (error) {
    console.error('[email] org results email failed:', error)
    throw new Error(`Org results email failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export interface OfferPurchaseEmailInput {
  buyerEmail: string
  buyerName: string | null
  orgName: string
  orgAdminEmail: string
  offerTitle: string
  amountCents: number
  currency: string
  /** Results link the purchase came from (null for a standalone class purchase). */
  resultsToken: string | null
  includesBreakdown: boolean
  includesBall: boolean
  includesCourse: boolean
  /** Team join code when the offer enrolls the buyer onto a roster. */
  joinTeamCode: string | null
  orgShareCents: number
  platformShareCents: number
}

/** Receipt to the family after an offer purchase. Best-effort; never throw. */
export async function sendOfferPurchaseConfirmationEmail(input: OfferPurchaseEmailInput): Promise<void> {
  const link = input.resultsToken ? `${BASE_URL}/results/${input.resultsToken}` : null
  const joinLink = input.joinTeamCode ? `${BASE_URL}/signup?teamCode=${encodeURIComponent(input.joinTeamCode)}` : null
  const amount = `${money(input.amountCents)} ${input.currency.toUpperCase()}`
  const first = input.buyerName?.trim() || 'there'
  const lines: string[] = []
  if (input.includesBreakdown && link) lines.push(`Your full shot breakdown is unlocked: ${link}`)
  if (input.includesBall) lines.push(`Your LearnHoops ball ships to the address you gave at checkout. We'll email tracking when it's on its way.`)
  if (input.includesCourse) lines.push(`You're registered for ${input.orgName}'s Shooting Class. ${input.orgName} will be in touch with the schedule and details.`)
  if (joinLink) lines.push(`Join the team roster on LearnHoops so your coach can track your progress: ${joinLink}`)

  try {
    const { error } = await getResend().emails.send({
      from: NOTIFICATION_FROM,
      to: input.buyerEmail,
      replyTo: input.orgAdminEmail,
      subject: `Receipt: ${input.offerTitle} — ${input.orgName}`,
      text: [
        `Hi ${first},`,
        ``,
        `Thanks for your purchase from ${input.orgName}.`,
        ``,
        `${input.offerTitle} — ${amount}`,
        ``,
        ...lines,
        ``,
        `Questions? Reply to this email to reach ${input.orgName}.`,
        ``,
        `LearnHoops.com`,
      ].join('\n'),
      html: `
<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;">
  <table role="presentation" width="100%" style="background:#F4F4F5;"><tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:14px;border:1px solid #E4E4E7;">
      <tr><td style="background:#000;padding:22px 32px;">
        <div style="color:#FF5C1A;font-size:20px;font-weight:800;">LearnHoops<span style="color:#71717A;">.com</span></div>
        <div style="color:#A1A1AA;font-size:12px;margin-top:5px;">${escHtml(input.orgName)}</div>
      </td></tr>
      <tr><td style="padding:36px 32px 8px;">
        <h1 style="margin:0 0 10px;color:#111;font-size:22px;font-weight:800;">Thanks, ${escHtml(first)}!</h1>
        <p style="margin:0;color:#52525B;font-size:15px;line-height:1.55;">Your purchase from <strong>${escHtml(input.orgName)}</strong> is confirmed.</p>
      </td></tr>
      <tr><td style="padding:20px 32px 8px;">
        <div style="background:#FAFAFA;border:1px solid #E4E4E7;border-radius:10px;padding:16px 20px;">
          <div style="color:#111;font-size:16px;font-weight:800;">${escHtml(input.offerTitle)}</div>
          <div style="color:#111;font-size:22px;font-weight:900;margin-top:4px;">${amount}</div>
        </div>
      </td></tr>
      <tr><td style="padding:16px 32px 8px;">
        ${lines.map((l) => `<p style="margin:0 0 10px;color:#52525B;font-size:14px;line-height:1.55;">${escHtml(l).replace(/(https?:\/\/\S+)/g, '<a href="$1" style="color:#E8430A;font-weight:700;">$1</a>')}</p>`).join('')}
      </td></tr>
      <tr><td style="padding:16px 32px 32px;">
        <p style="margin:0;color:#71717A;font-size:12px;line-height:1.6;">Questions? Reply to this email to reach ${escHtml(input.orgName)}.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`.trim(),
    })
    if (error) console.error('[email] offer purchase confirmation failed:', error)
  } catch (err) {
    console.error('[email] offer purchase confirmation failed:', err)
  }
}

/** Heads-up to the org admin that a family bought something. Best-effort. */
export async function sendOfferSaleNotificationEmail(input: OfferPurchaseEmailInput): Promise<void> {
  const amount = `${money(input.amountCents)} ${input.currency.toUpperCase()}`
  const share = `${money(input.orgShareCents)} ${input.currency.toUpperCase()}`
  const dashboard = `${BASE_URL}/org/dashboard#offers`
  try {
    const { error } = await getResend().emails.send({
      from: NOTIFICATION_FROM,
      to: input.orgAdminEmail,
      subject: `New sale: ${input.offerTitle} — ${amount}`,
      text: [
        `${input.buyerName?.trim() || input.buyerEmail} just bought ${input.offerTitle} from ${input.orgName}.`,
        ``,
        `Paid: ${amount}`,
        `Your share: ${share}`,
        `LearnHoops share: ${money(input.platformShareCents)} ${input.currency.toUpperCase()}`,
        input.includesCourse ? `This is a Shooting Class registration — see your Sales list to manage it.` : ``,
        input.includesBall ? `Includes a LearnHoops ball — LearnHoops ships it; nothing for you to do.` : ``,
        ``,
        `Sales & earnings: ${dashboard}`,
      ]
        .filter(Boolean)
        .join('\n'),
      html: `
<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;">
  <table role="presentation" width="100%" style="background:#F4F4F5;"><tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:14px;border:1px solid #E4E4E7;">
      <tr><td style="background:#000;padding:22px 32px;">
        <div style="color:#FF5C1A;font-size:20px;font-weight:800;">LearnHoops<span style="color:#71717A;">.com</span></div>
      </td></tr>
      <tr><td style="padding:36px 32px 8px;">
        <h1 style="margin:0 0 10px;color:#111;font-size:22px;font-weight:800;">New sale</h1>
        <p style="margin:0;color:#52525B;font-size:15px;line-height:1.55;">
          <strong>${escHtml(input.buyerName?.trim() || input.buyerEmail)}</strong> bought <strong>${escHtml(input.offerTitle)}</strong>.
        </p>
      </td></tr>
      <tr><td style="padding:20px 32px 8px;">
        <table role="presentation" width="100%" style="background:#FAFAFA;border:1px solid #E4E4E7;border-radius:10px;">
          <tr><td style="padding:12px 20px;color:#52525B;font-size:13px;">Paid</td><td align="right" style="padding:12px 20px;color:#111;font-weight:800;">${amount}</td></tr>
          <tr><td style="padding:12px 20px;color:#52525B;font-size:13px;border-top:1px solid #E4E4E7;">Your share</td><td align="right" style="padding:12px 20px;color:#111;font-weight:900;border-top:1px solid #E4E4E7;">${share}</td></tr>
          <tr><td style="padding:12px 20px;color:#52525B;font-size:13px;border-top:1px solid #E4E4E7;">LearnHoops share</td><td align="right" style="padding:12px 20px;color:#52525B;font-weight:700;border-top:1px solid #E4E4E7;">${money(input.platformShareCents)} ${input.currency.toUpperCase()}</td></tr>
        </table>
        ${input.includesCourse ? `<p style="margin:12px 0 0;color:#52525B;font-size:13px;">This is a Shooting Class registration — it's in your Sales list.</p>` : ''}
        ${input.includesBall ? `<p style="margin:12px 0 0;color:#52525B;font-size:13px;">Includes a LearnHoops ball. LearnHoops ships it — nothing for you to do.</p>` : ''}
      </td></tr>
      <tr><td style="padding:20px 32px 32px;">
        <a href="${dashboard}" style="display:inline-block;background:#FF5C1A;color:#111;padding:13px 26px;border-radius:10px;text-decoration:none;font-weight:800;font-size:15px;">Sales &amp; earnings</a>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`.trim(),
    })
    if (error) console.error('[email] offer sale notification failed:', error)
  } catch (err) {
    console.error('[email] offer sale notification failed:', err)
  }
}

/** Internal heads-up: an org asked to enable selling; admin quotes the split. */
export async function sendOffersRequestedEmail(orgName: string, adminEmail: string, orgId: string): Promise<void> {
  try {
    await getResend().emails.send({
      from: NOTIFICATION_FROM,
      to: INTERNAL_INBOX,
      subject: `Selling access requested: ${orgName}`,
      text: [
        `${orgName} (${adminEmail}) requested selling access for results offers.`,
        ``,
        `Set their revenue split in the admin dashboard to enable it:`,
        `${BASE_URL}/admin/org-revenue`,
        ``,
        `Org id: ${orgId}`,
      ].join('\n'),
    })
  } catch (err) {
    console.error('[email] offers requested notification failed:', err)
  }
}

// A complimentary membership (or other email-keyed entitlement) only lands on
// an account whose inbox is proven, so the entitlement email IS the proof: the
// button carries a signed, single-purpose link. Three shapes:
//   'confirm' — an account exists; the link confirms the address and activates
//   'setup'   — a password-less account exists; the link sets a password (and
//               in doing so confirms the address and activates)
//   'signup'  — no account yet; the link opens signup bound to this address
// Transactional, so no unsubscribe footer. Every interpolated value is escaped.
export async function sendEntitlementConfirmEmail(
  to: string,
  actionUrl: string,
  mode: 'confirm' | 'setup' | 'signup' | 'choose' = 'confirm',
  // mode 'choose' only: several player accounts share this address, so the
  // email carries one confirm link per account and the family picks which
  // account gets the membership. `actionUrl` is then unused.
  choices: Array<{ label: string; url: string }> = [],
) {
  const copy = {
    confirm: {
      subject: 'Confirm your email to activate your free membership',
      heading: 'Confirm your email to activate your free membership',
      body: 'You have been given a complimentary LearnHoops membership. Confirm this email address and it will be switched on for your account right away.',
      note: 'If you are not signed in to LearnHoops on this device, the button asks you to set your password first. Someone may have created this account with your email. Set your password to take control and activate your free membership.',
      button: 'Confirm and activate',
      expiry: 'This link works for 7 days.',
    },
    setup: {
      subject: 'Set your password to activate your free membership',
      heading: 'Set your password to activate your free membership',
      body: 'You have been given a complimentary LearnHoops membership. Your account has no password yet: set one below and the membership will be switched on straight away.',
      note: '',
      button: 'Set my password',
      expiry: 'This link works for 24 hours. You can ask for a new one from the login page with “Forgot password”.',
    },
    choose: {
      subject: 'Choose which account gets your free membership',
      heading: 'Choose which account gets your free membership',
      body: 'You have been given a complimentary LearnHoops membership. More than one player account uses this email address, so pick the one it should go to. It goes to one account only.',
      note: 'If you are not signed in to that account on this device, the button asks you to set its password first.',
      button: '',
      expiry: 'These links work for 7 days.',
    },
    signup: {
      subject: 'You have a free LearnHoops membership',
      heading: 'You have a free LearnHoops membership',
      body: 'You have been given a complimentary LearnHoops membership with unlimited shot analysis. Create your account with this email address to activate it.',
      note: '',
      button: 'Create my account',
      expiry: 'This link works for 30 days. After that, sign up with this email address and we will send a fresh confirmation link.',
    },
  }[mode]
  const url = escHtml(actionUrl)
  const isChoose = mode === 'choose' && choices.length > 0

  const { data, error } = await getResend().emails.send({
    from: NOTIFICATION_FROM,
    to,
    subject: copy.subject,
    text: [
      copy.heading,
      ``,
      copy.body,
      ...(copy.note ? [``, copy.note] : []),
      ``,
      ...(isChoose ? choices.flatMap((c) => [`${c.label}:`, c.url, ``]) : [actionUrl, ``]),
      copy.expiry,
      `If you didn't expect this email, you can ignore it — nothing changes unless the link is used.`,
      ``,
      `LearnHoops.com`,
    ].join('\n'),
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" style="background:#F4F4F5;"><tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:14px;border:1px solid #E4E4E7;">
      <tr><td style="background:#000;padding:22px 32px;">
        <div style="color:#F97316;font-size:20px;font-weight:800;">LearnHoops<span style="color:#71717A;">.com</span></div>
      </td></tr>
      <tr><td style="padding:36px 32px 8px;">
        <h1 style="margin:0 0 10px;color:#111;font-size:22px;font-weight:800;">${escHtml(copy.heading)}</h1>
        <p style="margin:0;color:#52525B;font-size:15px;line-height:1.55;">${escHtml(copy.body)}</p>
        ${copy.note ? `<p style="margin:12px 0 0;color:#52525B;font-size:14px;line-height:1.55;">${escHtml(copy.note)}</p>` : ''}
      </td></tr>
      <tr><td style="padding:24px 32px 8px;">
        ${isChoose
          ? choices.map((c) => `<div style="margin:0 0 10px;"><a href="${escHtml(c.url)}" style="display:inline-block;background:#F97316;color:#fff;padding:13px 26px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">${escHtml(c.label)}</a></div>`).join('')
          : `<a href="${url}" style="display:inline-block;background:#F97316;color:#fff;padding:13px 26px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">${escHtml(copy.button)}</a>`}
      </td></tr>
      <tr><td style="padding:8px 32px 32px;">
        ${isChoose ? '' : `<p style="margin:0 0 10px;color:#A1A1AA;font-size:13px;line-height:1.5;">
          If the button doesn't work, copy this link into your browser:<br/>
          <a href="${url}" style="color:#71717A;word-break:break-all;">${url}</a>
        </p>`}
        <p style="margin:0;color:#A1A1AA;font-size:13px;line-height:1.5;">${escHtml(copy.expiry)} If you didn't expect this email, you can ignore it — nothing changes unless the link is used.</p>
      </td></tr>
      <tr><td style="padding:18px 32px;background:#FAFAFA;border-top:1px solid #E4E4E7;border-radius:0 0 14px 14px;">
        <p style="margin:0;color:#A1A1AA;font-size:11px;line-height:1.6;">
          Questions? <a href="${escHtml(BASE_URL)}/support" style="color:#71717A;text-decoration:none;font-weight:600;">Contact us here</a>.
        </p>
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`.trim(),
  })
  if (error) {
    console.error('[email] entitlement confirmation failed:', error)
    throw new Error(`Entitlement confirmation email failed: ${error.message}`)
  }
  console.log('[email] entitlement confirmation sent:', data?.id, 'mode:', mode, 'to:', to)
}

// Invites an email to become a full-access admin of an organization
// (lib/org-admins.ts) — links to the admin setup page where they choose a
// password. Transactional: no unsubscribe footer.
export async function sendOrgAdminInviteEmail(to: string, orgName: string, inviteToken: string) {
  const link = `${BASE_URL}/org/admin-setup?token=${inviteToken}`
  const { data, error } = await getResend().emails.send({
    from: NOTIFICATION_FROM,
    to,
    subject: `You've been made an admin of ${orgName} on LearnHoops`,
    text: [
      `${orgName} has given you a full-access organization admin account on LearnHoops.`,
      ``,
      `As an admin you can open every team in the organization, send tokens, email results and manage settings — everything the organization owner can do.`,
      ``,
      `Set your password here:`,
      link,
      ``,
      `Afterwards, sign in at ${BASE_URL}/login with this email address and that password.`,
      ``,
      `LearnHoops.com`,
    ].join('\n'),
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" style="background:#F4F4F5;"><tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:14px;border:1px solid #E4E4E7;">
      <tr><td style="background:#000;padding:22px 32px;">
        <div style="color:#F97316;font-size:20px;font-weight:800;">LearnHoops<span style="color:#71717A;">.com</span></div>
      </td></tr>
      <tr><td style="padding:36px 32px 8px;">
        <h1 style="margin:0 0 10px;color:#111;font-size:22px;font-weight:800;">You're now an organization admin</h1>
        <p style="margin:0 0 12px;color:#52525B;font-size:15px;line-height:1.55;">
          <strong>${escHtml(orgName)}</strong> has given you a full-access organization admin account on LearnHoops.com.
        </p>
        <p style="margin:0;color:#52525B;font-size:15px;line-height:1.55;">
          As an admin you can open every team in the organization, send tokens, email results and manage settings &mdash; everything the organization owner can do. Choose a password below to get started.
        </p>
      </td></tr>
      <tr><td style="padding:24px 32px 32px;">
        <a href="${link}" style="display:inline-block;background:#F97316;color:#fff;padding:13px 26px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Set up my admin account</a>
        <p style="margin:18px 0 0;color:#A1A1AA;font-size:13px;line-height:1.5;">
          If the button doesn't work, copy this link into your browser:<br/>
          <a href="${link}" style="color:#71717A;word-break:break-all;">${link}</a>
        </p>
        <p style="margin:10px 0 0;color:#A1A1AA;font-size:13px;line-height:1.5;">Afterwards, sign in at ${BASE_URL}/login with this email address and your new password. If you didn't expect this, you can ignore this email.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`.trim(),
  })
  if (error) {
    console.error('[email] org admin invite failed:', error)
    throw new Error(`Org admin invite email failed: ${error.message}`)
  }
  console.log('[email] org admin invite sent:', data?.id, 'to:', to)
}

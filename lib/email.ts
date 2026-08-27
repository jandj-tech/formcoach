import { Resend } from 'resend'
import { resolveBaseUrl } from './base-url'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY!)
}

// Sender addresses live in one place — see lib/email-senders.ts for why
// transactional and marketing must not share a From address. The sending
// domain must be verified in the Resend dashboard before an address will
// deliver; until then, set EMAIL_FROM to `onboarding@resend.dev`.
import { FROM, MARKETING_FROM, REPLY_TO } from './email-senders'

export const BASE_URL = resolveBaseUrl()

export function orgSignupLink(signupToken: string) {
  return `${BASE_URL}/org/signup?token=${signupToken}`
}

export async function sendResultsEmail(to: string, token: string) {
  const link = `${BASE_URL}/results/${token}`
  const unsubscribe = `${BASE_URL}/unsubscribe?email=${encodeURIComponent(to)}`

  const { data, error } = await getResend().emails.send({
    from: FROM,
    to,
    replyTo: REPLY_TO,
    subject: 'Your shot analysis is ready',
    headers: {
      'List-Unsubscribe': `<${unsubscribe}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    // Plain-text alternative is a strong "this is transactional" signal to
    // Gmail and other clients — emails with no text body skew toward Promotions.
    text: [
      `Your shot analysis is ready.`,
      ``,
      `We studied 12 frames across 18 coaching criteria. View your full breakdown here:`,
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
            We studied 12 frames of your shot across 18 coaching criteria.
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
            <a href="${unsubscribe}" style="color:#71717A;text-decoration:underline;">Unsubscribe</a>
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
    console.error('[email] Resend rejected send:', error, 'from:', FROM, 'to:', to)
    throw new Error(
      `Resend send failed: ${error.message || JSON.stringify(error)}. ` +
        `Check the EMAIL_FROM env var and verify the sending domain in Resend.`,
    )
  }
  console.log('[email] sent results email:', data?.id, 'to:', to, 'from:', FROM)
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
      `Unsubscribe: ${BASE_URL}/unsubscribe?email=${encodeURIComponent(to)}`,
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
            LearnHoops.com &middot; <a href="${BASE_URL}/unsubscribe?email=${encodeURIComponent(to)}" style="color:#000000;">Unsubscribe</a>
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
      `Unsubscribe: ${BASE_URL}/unsubscribe?email=${encodeURIComponent(to)}`,
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
            LearnHoops.com &middot; <a href="${BASE_URL}/unsubscribe?email=${encodeURIComponent(to)}" style="color:#000000;">Unsubscribe</a>
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
      `Unsubscribe: ${BASE_URL}/unsubscribe?email=${encodeURIComponent(to)}`,
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
            LearnHoops.com &middot; <a href="${BASE_URL}/unsubscribe?email=${encodeURIComponent(to)}" style="color:#000000;">Unsubscribe</a>
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
      `Unsubscribe: ${BASE_URL}/unsubscribe?email=${encodeURIComponent(to)}`,
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
            LearnHoops.com &middot; <a href="${BASE_URL}/unsubscribe?email=${encodeURIComponent(to)}" style="color:#000000;">Unsubscribe</a>
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
      `Unsubscribe: ${BASE_URL}/unsubscribe?email=${encodeURIComponent(to)}`,
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
            LearnHoops.com &middot; <a href="${BASE_URL}/unsubscribe?email=${encodeURIComponent(to)}" style="color:#000000;">Unsubscribe</a>
          </p>
        </div>
      </div>
    `,
  },
]

export async function sendCoachInviteEmail(to: string, orgName: string, teamName: string, inviteToken: string) {
  const link = `${BASE_URL}/team/setup?token=${inviteToken}`
  const { data, error } = await getResend().emails.send({
    from: FROM,
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
        <h1 style="margin:0 0 10px;color:#111;font-size:22px;font-weight:800;">You've been added as a coach.</h1>
        <p style="margin:0;color:#52525B;font-size:15px;line-height:1.55;">
          <strong>${orgName}</strong> has added you as head coach of <strong>${teamName}</strong> on LearnHoops.com.
          Click below to set your password and access your team dashboard.
        </p>
      </td></tr>
      <tr><td style="padding:24px 32px 32px;">
        <a href="${link}" style="display:inline-block;background:#F97316;color:#fff;padding:13px 26px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Set up my coach account</a>
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
    from: FROM,
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
        <h1 style="margin:0 0 10px;color:#111;font-size:22px;font-weight:800;">You've been added as a coach.</h1>
        <p style="margin:0;color:#52525B;font-size:15px;line-height:1.55;">
          You've been added as a coach of <strong>${teamName}</strong> on LearnHoops.com.
          Click below to set your password and access the team dashboard.
        </p>
      </td></tr>
      <tr><td style="padding:24px 32px 32px;">
        <a href="${link}" style="display:inline-block;background:#F97316;color:#fff;padding:13px 26px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Set up my coach account</a>
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

// Sends a user a link to reset their account password.
export async function sendPasswordResetEmail(to: string, token: string) {
  const link = `${BASE_URL}/reset-password?token=${token}`
  const { data, error } = await getResend().emails.send({
    from: FROM,
    to,
    replyTo: REPLY_TO,
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

// Biweekly promotional email — pitches the LearnHoops ball and the site.
export async function sendPromoEmail(to: string) {
  const unsubscribe = `${BASE_URL}/unsubscribe?email=${encodeURIComponent(to)}`
  const { data, error } = await getResend().emails.send({
    from: MARKETING_FROM,
    to,
    replyTo: REPLY_TO,
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
          <a href="${unsubscribe}" style="color:#71717A;text-decoration:underline;">Unsubscribe</a>
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
  const link = `${BASE_URL}/login`
  await getResend().emails.send({
    from: FROM,
    to,
    subject: `You've been added as coach of ${teamName}`,
    text: `${orgName} has added you as head coach of ${teamName} on LearnHoops.com.\n\nLog in to manage your team:\n${link}\n\nLearnHoops.com`,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"><table role="presentation" width="100%" style="background:#F4F4F5;"><tr><td align="center" style="padding:32px 16px;"><table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:14px;border:1px solid #E4E4E7;"><tr><td style="background:#000;padding:22px 32px;"><div style="color:#F97316;font-size:20px;font-weight:800;">LearnHoops<span style="color:#71717A;">.com</span></div></td></tr><tr><td style="padding:36px 32px 8px;"><h1 style="margin:0 0 10px;color:#111;font-size:22px;font-weight:800;">You've been added as a coach.</h1><p style="margin:0;color:#52525B;font-size:15px;line-height:1.55;"><strong>${orgName}</strong> has added you as head coach of <strong>${teamName}</strong>.</p></td></tr><tr><td style="padding:24px 32px 32px;"><a href="${link}" style="display:inline-block;background:#F97316;color:#fff;padding:13px 26px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Go to my team dashboard</a></td></tr></table></td></tr></table></body></html>`,
  })
}

export async function sendClaimCreditsEmail(
  to: string,
  customerName: string | null,
  tokensToGrant: number,
  claimToken: string,
) {
  const name = customerName?.split(' ')[0] || 'there'
  const signupLink = `${BASE_URL}/signup?claimToken=${claimToken}&credits=${tokensToGrant}`
  const { data, error } = await getResend().emails.send({
    from: FROM,
    to,
    replyTo: REPLY_TO,
    subject: `Your LearnHoops ball ships soon — claim your ${tokensToGrant} free shot ${tokensToGrant === 1 ? 'analysis' : 'analyses'}`,
    text: [
      `Hey ${name},`,
      ``,
      `Your LearnHoops basketball order is confirmed and will ship shortly.`,
      ``,
      `Your order includes ${tokensToGrant} free shot ${tokensToGrant === 1 ? 'analysis' : 'analyses'} — but you need a LearnHoops account to use them.`,
      ``,
      `Create your free account here and the credits will be added automatically:`,
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
          <h1 style="margin:0 0 10px;color:#111111;font-size:24px;line-height:1.25;font-weight:800;">Your order is confirmed — and you have free credits waiting.</h1>
          <p style="margin:0;color:#52525B;font-size:15px;line-height:1.55;">
            Hey ${name}, your LearnHoops basketball is on its way. Your order also includes
            <strong>${tokensToGrant} free shot ${tokensToGrant === 1 ? 'analysis' : 'analyses'}</strong> — create a free account and they'll be added instantly.
          </p>
        </td></tr>

        <tr><td style="padding:20px 32px 4px;">
          <div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;padding:14px 18px;display:inline-block;">
            <div style="color:#C2410C;font-size:13px;font-weight:600;margin-bottom:2px;">Waiting for you</div>
            <div style="color:#9A3412;font-size:28px;font-weight:900;line-height:1;">${tokensToGrant} free shot ${tokensToGrant === 1 ? 'analysis' : 'analyses'}</div>
          </div>
        </td></tr>

        <tr><td style="padding:20px 32px 8px;">
          <a href="${signupLink}" style="display:inline-block;background:#F97316;color:#ffffff;padding:13px 26px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">
            Create my account &amp; claim credits
          </a>
        </td></tr>

        <tr><td style="padding:4px 32px 32px;">
          <p style="margin:0;color:#A1A1AA;font-size:12px;line-height:1.5;">
            Sign up with this email address and your credits will be applied automatically.<br/>
            <a href="${signupLink}" style="color:#A1A1AA;word-break:break-all;text-decoration:underline;">${signupLink}</a>
          </p>
        </td></tr>

        <tr><td style="padding:18px 32px;background:#FAFAFA;border-top:1px solid #E4E4E7;">
          <p style="margin:0;color:#A1A1AA;font-size:11px;line-height:1.6;">
            Questions? Reply to this email or visit <a href="${BASE_URL}" style="color:#71717A;text-decoration:none;font-weight:600;">LearnHoops.com</a>.
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
    from: FROM,
    to,
    replyTo: REPLY_TO,
    subject: 'Your LearnHoops order has shipped!',
    text: [
      `Hey ${name},`,
      ``,
      `Your LearnHoops order is on its way!`,
      ``,
      `Track your package here:`,
      shippingLink,
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
            Hey ${name}, great news — your LearnHoops basketball has shipped and is headed your way.
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

        <tr><td style="padding:18px 32px;background:#FAFAFA;border-top:1px solid #E4E4E7;">
          <p style="margin:0;color:#A1A1AA;font-size:11px;line-height:1.6;">
            Questions? Reply to this email or visit <a href="${BASE_URL}" style="color:#71717A;text-decoration:none;font-weight:600;">LearnHoops.com</a>.
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

export async function sendOrgApprovalEmail(
  to: string,
  orgName: string,
  signupToken: string,
) {
  const signupLink = orgSignupLink(signupToken)
  const { data, error } = await getResend().emails.send({
    from: FROM,
    to,
    replyTo: REPLY_TO,
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
          <h2 style="font-size:20px;font-weight:900;color:#000;margin:0 0 12px;">Application approved 🎉</h2>
          <p style="color:#374151;font-size:15px;margin:0 0 8px;">Hi,</p>
          <p style="color:#374151;font-size:15px;margin:0 0 20px;">
            Your application for <strong>${orgName}</strong> has been approved.
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
  const unsubscribe = `${BASE_URL}/unsubscribe?email=${encodeURIComponent(to)}`

  // The drip is unambiguously marketing, so it leaves as MARKETING_FROM: a
  // complaint here must not touch the reputation that carries password resets.
  // List-Unsubscribe is the header, not the link in the body — providers read
  // the header — and the text part is the template's own, not a stub telling
  // the reader to switch clients.
  await getResend().emails.send({
    from: MARKETING_FROM,
    to,
    replyTo: REPLY_TO,
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
    from: FROM,
    to,
    replyTo: REPLY_TO,
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
          ✅ <strong>Team created</strong> — "10 Week Shooting Class" is live on your dashboard<br/>
          ✅ <strong>Balls shipping</strong> — to the address you entered at checkout<br/>
          ✅ <strong>2 shot analyses per player</strong> — tokens are ready to assign
        </p>
      </td></tr>

      <tr><td style="padding:20px 32px 32px;">
        <a href="${dashboardUrl.startsWith('https://') ? dashboardUrl : 'https://learnhoops.com/org/dashboard'}" style="display:inline-block;background:#F97316;color:#ffffff;padding:13px 26px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">
          Go to my dashboard
        </a>
      </td></tr>

      <tr><td style="padding:18px 32px;background:#FAFAFA;border-top:1px solid #E4E4E7;">
        <p style="margin:0;color:#A1A1AA;font-size:11px;line-height:1.6;">
          Questions? Reply to this email or visit <a href="${BASE_URL}" style="color:#71717A;text-decoration:none;font-weight:600;">LearnHoops.com</a>.
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
    from: FROM,
    to,
    replyTo: REPLY_TO,
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
    from: FROM,
    to,
    replyTo: REPLY_TO,
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
    from: FROM,
    to,
    replyTo: REPLY_TO,
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
    from: FROM,
    to,
    replyTo: REPLY_TO,
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
    from: FROM,
    to,
    replyTo: REPLY_TO,
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
    from: `LearnHoops Support Form <${REPLY_TO}>`,
    to: REPLY_TO,
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
  const unsubscribe = `${BASE_URL}/unsubscribe?email=${encodeURIComponent(to)}`
  const firstName = name ? name.split(' ')[0] : null
  const greeting = firstName ? `Hey ${firstName},` : 'Hey,'

  const { data, error } = await getResend().emails.send({
    from: FROM,
    to,
    replyTo: REPLY_TO,
    subject: 'Your LearnHoops training ball is still waiting 🏀',
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
            ${greeting} you were one step away from the LearnHoops Training Ball —
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
            <a href="${unsubscribe}" style="color:#71717A;text-decoration:underline;">Unsubscribe</a>
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
  const unsubscribe = `${BASE_URL}/unsubscribe?email=${encodeURIComponent(to)}`

  const { data, error } = await getResend().emails.send({
    from: FROM,
    to,
    replyTo: REPLY_TO,
    // Plain and descriptive on purpose. A benefit-promise subject ("get a
    // better score…") is a Promotions-tab signal; naming what the email
    // contains reads as the follow-up to an action they just took.
    subject: 'How to film your next shot for an accurate analysis',
    headers: {
      'List-Unsubscribe': `<${unsubscribe}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
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
            <a href="${unsubscribe}" style="color:#A1A1AA;text-decoration:underline;">Unsubscribe</a>
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

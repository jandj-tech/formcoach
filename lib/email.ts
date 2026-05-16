import { Resend } from 'resend'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY!)
}

// Override via Vercel env var EMAIL_FROM. Default is the verified-domain
// noreply address. The sending domain (learnhoops.com) must be verified in
// the Resend dashboard before this address will deliver — until then, fall
// back to `onboarding@resend.dev` by setting EMAIL_FROM to it.
const FROM = process.env.EMAIL_FROM || 'LearnHoops <noreply@learnhoops.com>'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL && process.env.NEXT_PUBLIC_BASE_URL !== 'http://localhost:3000'
  ? process.env.NEXT_PUBLIC_BASE_URL
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'

export async function sendResultsEmail(to: string, token: string) {
  const link = `${BASE_URL}/results/${token}`
  const unsubscribe = `${BASE_URL}/unsubscribe?email=${encodeURIComponent(to)}`

  const { data, error } = await getResend().emails.send({
    from: FROM,
    to,
    replyTo: 'noreply@learnhoops.com',
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
      `We studied 12 frames across 17 coaching criteria. View your full breakdown here:`,
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
            We studied 12 frames of your shot across 17 coaching criteria.
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

const MARKETING_EMAILS = [
  {
    subject: 'How did your shot analysis go? Here\'s how to level up',
    getHtml: (to: string) => `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#000000;padding:24px 32px;">
          <h1 style="color:#F97316;margin:0;font-size:24px;">LearnHoops.com</h1>
        </div>
        <div style="padding:32px;">
          <h2 style="color:#000000;">You've seen your scores. Now it's time to fix them.</h2>
          <p style="color:#000000;line-height:1.6;">
            Knowing your weaknesses is half the battle. The other half is having the right gear to train with.
            We're building something that will help serious players like you improve faster — and we'd love for you to be first to know.
          </p>
          <p style="color:#000000;line-height:1.6;">Stay tuned. Something exciting is coming.</p>
          <hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0;"/>
          <p style="color:#000000;font-size:11px;text-align:center;">
            LearnHoops.com · <a href="${BASE_URL}/unsubscribe?email=${encodeURIComponent(to)}" style="color:#000000;">Unsubscribe</a>
          </p>
        </div>
      </div>
    `,
  },
  {
    subject: 'The training tool serious players are using right now',
    getHtml: (to: string) => `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#000000;padding:24px 32px;">
          <h1 style="color:#F97316;margin:0;font-size:24px;">LearnHoops.com</h1>
        </div>
        <div style="padding:32px;">
          <h2 style="color:#000000;">Train smarter. Not just harder.</h2>
          <p style="color:#000000;line-height:1.6;">
            The best players in the world don't just shoot thousands of reps. They train with purpose — with feedback, with the right equipment, and with intention.
          </p>
          <p style="color:#000000;line-height:1.6;">
            We're working on something that gives everyday players access to that same level of training. You'll hear more soon.
          </p>
          <hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0;"/>
          <p style="color:#000000;font-size:11px;text-align:center;">
            LearnHoops.com · <a href="${BASE_URL}/unsubscribe?email=${encodeURIComponent(to)}" style="color:#000000;">Unsubscribe</a>
          </p>
        </div>
      </div>
    `,
  },
  {
    subject: 'What elite coaches look for in a perfect shot',
    getHtml: (to: string) => `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#000000;padding:24px 32px;">
          <h1 style="color:#F97316;margin:0;font-size:24px;">LearnHoops.com</h1>
        </div>
        <div style="padding:32px;">
          <h2 style="color:#000000;">The 3 things coaches notice immediately</h2>
          <p style="color:#000000;line-height:1.6;">
            When a coach watches a player shoot, three things stand out before anything else: elbow alignment, release point, and follow-through.
            These are the foundation of a consistent shot — and the hardest to correct without the right tools.
          </p>
          <p style="color:#000000;line-height:1.6;">
            Our upcoming product was designed with exactly these fundamentals in mind. You'll be hearing more about it very soon.
          </p>
          <hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0;"/>
          <p style="color:#000000;font-size:11px;text-align:center;">
            LearnHoops.com · <a href="${BASE_URL}/unsubscribe?email=${encodeURIComponent(to)}" style="color:#000000;">Unsubscribe</a>
          </p>
        </div>
      </div>
    `,
  },
  {
    subject: '🏀 It\'s here — introducing [Product Name]',
    getHtml: (to: string) => `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#000000;padding:24px 32px;">
          <h1 style="color:#F97316;margin:0;font-size:24px;">LearnHoops.com</h1>
        </div>
        <div style="padding:32px;">
          <h2 style="color:#000000;">The product we've been building is live.</h2>
          <p style="color:#000000;line-height:1.6;">
            [Describe your product here — what it is, what it does, why it helps players improve their shot.]
          </p>
          <p style="color:#000000;line-height:1.6;">
            As a LearnHoops.com user, you get exclusive early access pricing. This offer is limited to our first 100 customers.
          </p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${BASE_URL}" style="background:#F97316;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">
              Get Early Access
            </a>
          </div>
          <hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0;"/>
          <p style="color:#000000;font-size:11px;text-align:center;">
            LearnHoops.com · <a href="${BASE_URL}/unsubscribe?email=${encodeURIComponent(to)}" style="color:#000000;">Unsubscribe</a>
          </p>
        </div>
      </div>
    `,
  },
  {
    subject: 'Last chance — early access pricing ends soon',
    getHtml: (to: string) => `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#000000;padding:24px 32px;">
          <h1 style="color:#F97316;margin:0;font-size:24px;">LearnHoops.com</h1>
        </div>
        <div style="padding:32px;">
          <h2 style="color:#000000;">This is your last chance at early access pricing.</h2>
          <p style="color:#000000;line-height:1.6;">
            Our early access offer for [Product Name] closes soon. After that, the price goes up and availability drops.
          </p>
          <p style="color:#000000;line-height:1.6;">
            You've already taken the first step by analyzing your shot. Don't let this be where you stop.
          </p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${BASE_URL}" style="background:#DC2626;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">
              Claim Your Spot
            </a>
          </div>
          <hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0;"/>
          <p style="color:#000000;font-size:11px;text-align:center;">
            LearnHoops.com · <a href="${BASE_URL}/unsubscribe?email=${encodeURIComponent(to)}" style="color:#000000;">Unsubscribe</a>
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

export async function sendCoachAddedEmail(to: string, orgName: string, teamName: string) {
  const link = `${BASE_URL}/team/login`
  await getResend().emails.send({
    from: FROM,
    to,
    subject: `You've been added as coach of ${teamName}`,
    text: `${orgName} has added you as head coach of ${teamName} on LearnHoops.com.\n\nLog in to manage your team:\n${link}\n\nLearnHoops.com`,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"><table role="presentation" width="100%" style="background:#F4F4F5;"><tr><td align="center" style="padding:32px 16px;"><table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:14px;border:1px solid #E4E4E7;"><tr><td style="background:#000;padding:22px 32px;"><div style="color:#F97316;font-size:20px;font-weight:800;">LearnHoops<span style="color:#71717A;">.com</span></div></td></tr><tr><td style="padding:36px 32px 8px;"><h1 style="margin:0 0 10px;color:#111;font-size:22px;font-weight:800;">You've been added as a coach.</h1><p style="margin:0;color:#52525B;font-size:15px;line-height:1.55;"><strong>${orgName}</strong> has added you as head coach of <strong>${teamName}</strong>.</p></td></tr><tr><td style="padding:24px 32px 32px;"><a href="${link}" style="display:inline-block;background:#F97316;color:#fff;padding:13px 26px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Go to my team dashboard</a></td></tr></table></td></tr></table></body></html>`,
  })
}

export async function sendNextMarketingEmail(
  to: string,
  emailsSentSoFar: number
): Promise<boolean> {
  if (emailsSentSoFar >= MARKETING_EMAILS.length) return false

  const template = MARKETING_EMAILS[emailsSentSoFar]
  await getResend().emails.send({
    from: FROM,
    to,
    subject: template.subject,
    html: template.getHtml(to),
  })
  return true
}

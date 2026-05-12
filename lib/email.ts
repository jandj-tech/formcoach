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
  const shopLink = `${BASE_URL}/shop`

  const { data, error } = await getResend().emails.send({
    from: FROM,
    to,
    replyTo: 'noreply@learnhoops.com',
    subject: '🏀 Your shot is graded — see where you stand',
    headers: {
      'List-Unsubscribe': `<${unsubscribe}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F4F4F5;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #E4E4E7;">

        <!-- Brand bar -->
        <tr><td style="background:#000000;padding:24px 32px;">
          <div style="color:#F97316;font-size:22px;font-weight:900;letter-spacing:-0.5px;">🏀 LearnHoops<span style="color:#71717A;">.com</span></div>
          <div style="color:#A1A1AA;font-size:12px;margin-top:4px;">Your shot. Perfected by AI.</div>
        </td></tr>

        <!-- Hero -->
        <tr><td style="padding:40px 32px 24px;text-align:center;">
          <div style="display:inline-block;background:#FFEDD5;color:#9A3412;padding:6px 14px;border-radius:9999px;font-size:11px;font-weight:700;letter-spacing:1px;margin-bottom:18px;">SHOT ANALYSIS READY</div>
          <h1 style="margin:0 0 12px;color:#000000;font-size:30px;line-height:1.15;font-weight:900;">Your form, broken down.</h1>
          <p style="margin:0;color:#52525B;font-size:15px;line-height:1.6;">
            We studied 12 frames across 17 coaching criteria.<br/>
            Tap below to see what your shot does well — and exactly what to fix.
          </p>
        </td></tr>

        <!-- Primary CTA -->
        <tr><td align="center" style="padding:8px 32px 40px;">
          <a href="${link}" style="display:inline-block;background:#F97316;color:#ffffff;padding:16px 40px;border-radius:12px;text-decoration:none;font-weight:800;font-size:16px;box-shadow:0 4px 0 #C2410C;">
            View My Shot Analysis →
          </a>
          <div style="margin-top:14px;color:#A1A1AA;font-size:12px;">Your private link — bookmark it, it'll always work.</div>
        </td></tr>

        <!-- Section divider -->
        <tr><td style="padding:0 32px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="border-top:1px solid #E4E4E7;font-size:0;line-height:0;">&nbsp;</td>
              <td style="padding:0 14px;color:#71717A;font-size:11px;font-weight:700;letter-spacing:1.5px;white-space:nowrap;">FIX IT FASTER</td>
              <td style="border-top:1px solid #E4E4E7;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
          </table>
        </td></tr>

        <!-- Shop promo -->
        <tr><td style="padding:28px 32px 32px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:14px;">
            <tr><td style="padding:28px;text-align:center;">
              <div style="font-size:42px;line-height:1;margin-bottom:6px;">🏀</div>
              <h2 style="margin:0 0 10px;color:#7C2D12;font-size:22px;font-weight:900;">Train with the LearnHoops Ball</h2>
              <p style="margin:0 0 22px;color:#9A3412;font-size:14px;line-height:1.55;max-width:380px;margin-left:auto;margin-right:auto;">
                Finger guides printed on the leather. Game weight and feel.
                Right- or left-handed.<br/><strong>The fastest way to fix the form your analysis just exposed.</strong>
              </p>
              <a href="${shopLink}" style="display:inline-block;background:#000000;color:#ffffff;padding:13px 32px;border-radius:10px;text-decoration:none;font-weight:800;font-size:14px;">
                Shop the Ball →
              </a>
            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 32px;background:#FAFAFA;border-top:1px solid #E4E4E7;text-align:center;">
          <p style="margin:0 0 6px;color:#71717A;font-size:11px;line-height:1.5;">
            You're getting this because you submitted a shot at LearnHoops.com.
          </p>
          <p style="margin:0;color:#A1A1AA;font-size:11px;">
            <a href="${BASE_URL}" style="color:#71717A;text-decoration:none;font-weight:700;">LearnHoops.com</a>
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

import { Resend } from 'resend'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY!)
}
const FROM = 'LearnHoops.com <onboarding@resend.dev>'
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL && process.env.NEXT_PUBLIC_BASE_URL !== 'http://localhost:3000'
  ? process.env.NEXT_PUBLIC_BASE_URL
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'

export async function sendResultsEmail(to: string, token: string) {
  const link = `${BASE_URL}/results/${token}`
  await getResend().emails.send({
    from: FROM,
    to,
    subject: 'Your LearnHoops.com Shot Analysis is Ready',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;">
        <div style="background:#000000;padding:24px 32px;">
          <h1 style="color:#F97316;margin:0;font-size:24px;">LearnHoops.com</h1>
          <p style="color:#FFFFFF;margin:4px 0 0;font-size:13px;">Your shot. Perfected by AI.</p>
        </div>
        <div style="padding:32px;">
          <h2 style="color:#000000;margin-top:0;">Your shot analysis is ready!</h2>
          <p style="color:#000000;line-height:1.6;">
            We've analyzed your basketball shot across 18 key criteria and generated a detailed breakdown of your form.
          </p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${link}" style="background:#F97316;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">
              View My Shot Analysis
            </a>
          </div>
          <p style="color:#000000;font-size:12px;">
            This link is private and unique to your submission. It will always be accessible.
          </p>
          <hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0;"/>
          <p style="color:#000000;font-size:11px;text-align:center;">
            LearnHoops.com · <a href="${BASE_URL}/unsubscribe?email=${encodeURIComponent(to)}" style="color:#000000;">Unsubscribe</a>
          </p>
        </div>
      </div>
    `,
  })
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

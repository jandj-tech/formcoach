import { Resend } from 'resend'

// One-off broadcast emails composed in the admin (admin/emails → Send Email).
// Renders the branded template and sends via Resend's batch API in chunks of
// 100 so even a large list finishes within a serverless timeout.

const FROM = process.env.EMAIL_FROM || 'LearnHoops <noreply@learnhoops.com>'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL && process.env.NEXT_PUBLIC_BASE_URL !== 'http://localhost:3000'
  ? process.env.NEXT_PUBLIC_BASE_URL
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'

export interface BroadcastContent {
  subject: string
  headline: string
  // Plain text; blank-line-separated paragraphs.
  body: string
  ctaText?: string
  ctaUrl?: string
}

function escHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function renderBroadcastHtml(content: BroadcastContent, to: string): string {
  const unsubscribe = `${BASE_URL}/unsubscribe?email=${encodeURIComponent(to)}`
  const paragraphs = content.body
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p style="margin:0 0 14px;color:#52525B;font-size:15px;line-height:1.6;">${escHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('\n')

  const cta = content.ctaText && content.ctaUrl
    ? `<tr><td style="padding:10px 32px 8px;">
        <a href="${escHtml(content.ctaUrl)}" style="display:inline-block;background:#F97316;color:#ffffff;padding:13px 26px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">${escHtml(content.ctaText)}</a>
      </td></tr>`
    : ''

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111111;">
  <table role="presentation" width="100%" style="background:#F4F4F5;"><tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #E4E4E7;">
      <tr><td style="background:#000000;padding:22px 32px;">
        <div style="color:#F97316;font-size:20px;font-weight:800;letter-spacing:-0.3px;">LearnHoops<span style="color:#71717A;">.com</span></div>
        <div style="color:#A1A1AA;font-size:12px;margin-top:5px;">Your shot. Perfected by AI.</div>
      </td></tr>
      <tr><td style="padding:36px 32px 8px;">
        <h1 style="margin:0 0 14px;color:#111111;font-size:23px;line-height:1.25;font-weight:800;">${escHtml(content.headline)}</h1>
        ${paragraphs}
      </td></tr>
      ${cta}
      <tr><td style="padding:18px 32px 24px;"></td></tr>
      <tr><td style="padding:18px 32px;background:#FAFAFA;border-top:1px solid #E4E4E7;">
        <p style="margin:0;color:#A1A1AA;font-size:11px;line-height:1.6;">
          You're getting this because you have an account at <a href="${BASE_URL}" style="color:#71717A;text-decoration:none;font-weight:600;">LearnHoops.com</a>.
          &nbsp;·&nbsp;
          <a href="${unsubscribe}" style="color:#71717A;text-decoration:underline;">Unsubscribe</a>
        </p>
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`.trim()
}

export function renderBroadcastText(content: BroadcastContent, to: string): string {
  const unsubscribe = `${BASE_URL}/unsubscribe?email=${encodeURIComponent(to)}`
  return [
    content.headline,
    '',
    content.body,
    ...(content.ctaText && content.ctaUrl ? ['', `${content.ctaText}: ${content.ctaUrl}`] : []),
    '',
    'LearnHoops.com',
    `Unsubscribe: ${unsubscribe}`,
  ].join('\n')
}

export interface BroadcastResult {
  sent: number
  failed: number
  errors: string[]
}

export async function sendBroadcast(content: BroadcastContent, recipients: string[]): Promise<BroadcastResult> {
  const resend = new Resend(process.env.RESEND_API_KEY!)
  const result: BroadcastResult = { sent: 0, failed: 0, errors: [] }

  // Resend's batch endpoint accepts up to 100 emails per call.
  for (let i = 0; i < recipients.length; i += 100) {
    const chunk = recipients.slice(i, i + 100)
    const payloads = chunk.map(to => ({
      from: FROM,
      to,
      replyTo: 'noreply@learnhoops.com',
      subject: content.subject,
      headers: {
        'List-Unsubscribe': `<${BASE_URL}/unsubscribe?email=${encodeURIComponent(to)}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      text: renderBroadcastText(content, to),
      html: renderBroadcastHtml(content, to),
    }))
    try {
      const { data, error } = await resend.batch.send(payloads)
      if (error) {
        result.failed += chunk.length
        result.errors.push(error.message || String(error))
        console.error('[broadcast] batch send failed:', error)
      } else {
        result.sent += data?.data?.length ?? chunk.length
      }
    } catch (err) {
      result.failed += chunk.length
      result.errors.push(err instanceof Error ? err.message : String(err))
      console.error('[broadcast] batch send threw:', err)
    }
  }

  return result
}

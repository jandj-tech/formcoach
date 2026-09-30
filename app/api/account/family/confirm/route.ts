import { NextRequest } from 'next/server'
import { confirmShareLink, inspectShareLink, type ShareLinkState } from '@/lib/account-family'

/**
 * The link in "Confirm a shared login for Harper and Liam".
 *
 * GET only shows what would happen, with a Confirm button: mail scanners and
 * link previews fetch every URL in an email, and this one changes a password.
 * The button POSTs the same token back; that performs the join. Neither step
 * signs anyone in — the family signs in with the shared password afterwards.
 */

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function page(title: string, body: string, status = 200): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex"/>
<title>${esc(title)} | LearnHoops</title>
<style>
  :root { --bg:#F4F4F5; --card:#fff; --line:#E4E4E7; --ink:#111; --dim:#52525B; --faint:#A1A1AA; }
  @media (prefers-color-scheme: dark) { :root { --bg:#09090B; --card:#18181B; --line:#27272A; --ink:#FAFAFA; --dim:#A1A1AA; --faint:#71717A; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; }
  main { max-width:520px; margin:48px auto; padding:0 16px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:16px; overflow:hidden; }
  .brand { background:#000; padding:18px 24px; color:#F97316; font-weight:800; font-size:18px; }
  .brand span { color:#71717A; }
  .body { padding:28px 24px; }
  h1 { margin:0 0 10px; font-size:21px; }
  p, li { color:var(--dim); font-size:15px; line-height:1.55; }
  ul { padding-left:20px; margin:10px 0 0; }
  .btn { display:inline-block; margin-top:20px; background:#F97316; color:#fff; border:0; padding:12px 22px; border-radius:10px; font-weight:700; font-size:15px; text-decoration:none; cursor:pointer; }
  .note { color:var(--faint); font-size:13px; margin-top:16px; }
</style>
</head>
<body><main><div class="card"><div class="brand">LearnHoops<span>.com</span></div><div class="body">${body}</div></div></main></body>
</html>`
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
  })
}

function notUsable(state: Extract<ShareLinkState, { ok: false }>): Response {
  if (state.reason === 'already_shared') {
    return page(
      'Already shared',
      `<h1>Already shared</h1><p>${esc(state.from ?? '')} and ${esc(state.to ?? '')} already share one login. Nothing else to do.</p>
       <a class="btn" href="/login">Sign in</a>`,
    )
  }
  return page(
    'Link expired',
    `<h1>This link no longer works</h1>
     <p>It may have expired (links last 7 days), or one of the passwords changed since it was sent. Nothing was changed.</p>
     <p>To try again, sign in and use Settings &rsaquo; Family.</p>
     <a class="btn" href="/login">Sign in</a>`,
    400,
  )
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? ''
  try {
    const state = await inspectShareLink(token)
    if (!state.ok) return notUsable(state)
    const from = esc(state.from)
    const to = esc(state.to)
    return page(
      'Confirm a shared login',
      `<h1>Share one login for ${from} and ${to}?</h1>
       <ul>
         <li>${from}&rsquo;s password will open both accounts. ${to}&rsquo;s old password stops working.</li>
         <li>After signing in, you pick which player to use.</li>
         <li>Each player keeps their own shots, tokens and memberships.</li>
         <li>You can stop sharing any time in Settings &rsaquo; Family.</li>
       </ul>
       <form method="post" action="/api/account/family/confirm">
         <input type="hidden" name="token" value="${esc(token)}"/>
         <button class="btn" type="submit">Confirm shared login</button>
       </form>
       <p class="note">Didn't ask for this? Close this page. Nothing changes.</p>`,
    )
  } catch (err) {
    console.error('[family/confirm] GET failed:', err instanceof Error ? err.message : err)
    return page('Something went wrong', '<h1>Something went wrong</h1><p>Please try the link again in a minute.</p>', 500)
  }
}

export async function POST(req: NextRequest) {
  let token = ''
  try {
    const form = await req.formData()
    token = String(form.get('token') ?? '')
  } catch {
    token = ''
  }
  try {
    const state = await confirmShareLink(token)
    if (!state.ok) return notUsable(state)
    return page(
      'Login shared',
      `<h1>Done</h1>
       <p>${esc(state.from)} and ${esc(state.to)} now share one login. Sign in with ${esc(state.from)}&rsquo;s password, then pick the player.</p>
       <a class="btn" href="/login">Sign in</a>`,
    )
  } catch (err) {
    console.error('[family/confirm] POST failed:', err instanceof Error ? err.message : err)
    return page('Something went wrong', '<h1>Something went wrong</h1><p>Nothing was changed. Please try the link again.</p>', 500)
  }
}

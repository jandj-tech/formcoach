import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { signTeamSession, teamSessionCookieOptions } from '@/lib/team-auth'

// Stripe success URL for class-package checkouts. Runs as a Route Handler
// (NOT a page) so we can write the team-session cookie before redirecting.
//
// Flow:
//   1. Find the package by stripe_session_id (the path param).
//   2. Find the auto-created team via teams.class_package_id.
//   3. If team exists, sign a team session and redirect to /team/dashboard.
//   4. If not yet (webhook lagging), render a holding screen that meta-refreshes
//      back here every few seconds.
export async function GET(req: NextRequest, ctx: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctx.params
  const baseUrl = req.nextUrl.origin

  const orgSession = await getOrgSessionFromRequest(req)
  if (!orgSession) {
    return NextResponse.redirect(`${baseUrl}/login?next=/org/class-success/${encodeURIComponent(sessionId)}`)
  }

  const [pkg] = (await db`
    SELECT id, org_id
    FROM org_class_packages
    WHERE stripe_session_id = ${sessionId} AND org_id = ${orgSession.orgId}
  `) as unknown as Array<{ id: string; org_id: string }>

  const [team] = pkg
    ? ((await db`
        SELECT id FROM teams
        WHERE class_package_id = ${pkg.id} AND organization_id = ${orgSession.orgId}
        ORDER BY created_at ASC
        LIMIT 1
      `) as unknown as Array<{ id: string }>)
    : []

  if (pkg && team) {
    const token = await signTeamSession({ teamId: team.id, adminEmail: orgSession.adminEmail })
    const res = NextResponse.redirect(`${baseUrl}/team/dashboard`)
    res.cookies.set(teamSessionCookieOptions(token))
    return res
  }

  // Holding screen — webhook hasn't fully processed the purchase yet.
  // Auto-refresh back to this same URL.
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="refresh" content="3" />
    <title>Setting up your class…</title>
    <style>
      :root { color-scheme: light; }
      html, body { height: 100%; margin: 0; }
      body {
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        background: #fff; color: #111;
        display: flex; align-items: center; justify-content: center; padding: 24px;
      }
      .card { max-width: 420px; text-align: center; }
      .emoji { font-size: 56px; line-height: 1; }
      h1 { font-size: 22px; font-weight: 900; margin: 16px 0 8px; }
      p { color: #6b7280; margin: 8px 0; font-size: 14px; line-height: 1.5; }
      code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 11px; }
      a { color: #f97316; font-weight: 700; text-decoration: none; font-size: 14px; }
      a:hover { color: #ea580c; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="emoji">🏀</div>
      <h1>Setting up your class…</h1>
      <p>We're creating your team and crediting your class tokens. This usually takes a few seconds — this page will refresh automatically.</p>
      <p><code>${sessionId.replace(/[<>&"]/g, '')}</code></p>
      <p><a href="/org/dashboard">Back to dashboard →</a></p>
    </div>
  </body>
</html>`

  return new NextResponse(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

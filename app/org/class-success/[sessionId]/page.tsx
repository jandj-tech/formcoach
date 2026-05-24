import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/db'
import { getOrgSession } from '@/lib/org-auth'
import { signTeamSession, teamSessionCookieOptions } from '@/lib/team-auth'

interface Props {
  params: Promise<{ sessionId: string }>
}

// Landing page after a successful Stripe class-package checkout.
// Looks up the package by stripe_session_id, finds the auto-created team
// (linked via teams.class_package_id), signs a team session, and forwards
// to /team/dashboard. If the webhook hasn't fired yet, shows a holding
// screen that auto-refreshes.
export default async function ClassSuccessPage({ params }: Props) {
  const { sessionId } = await params

  const orgSession = await getOrgSession()
  if (!orgSession) {
    redirect(`/login?next=/org/class-success/${encodeURIComponent(sessionId)}`)
  }

  const [pkg] = (await db`
    SELECT p.id, p.org_id, p.player_count
    FROM org_class_packages p
    WHERE p.stripe_session_id = ${sessionId} AND p.org_id = ${orgSession.orgId}
  `) as unknown as Array<{ id: string; org_id: string; player_count: number }>

  const [team] = pkg
    ? ((await db`
        SELECT id FROM teams
        WHERE class_package_id = ${pkg.id} AND organization_id = ${orgSession.orgId}
        ORDER BY created_at ASC
        LIMIT 1
      `) as unknown as Array<{ id: string }>)
    : []

  // Webhook hasn't fully fired yet — show a holding screen that refreshes.
  if (!pkg || !team) {
    return (
      <main className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <meta httpEquiv="refresh" content="3" />
        <div className="max-w-md w-full text-center space-y-4">
          <div className="text-6xl">🏀</div>
          <h1 className="text-2xl font-black text-black">Setting up your class…</h1>
          <p className="text-gray-500">
            We&apos;re creating your team and crediting your class tokens. This usually takes a few
            seconds — this page will refresh automatically.
          </p>
          <p className="text-xs text-gray-400">
            Reference: <span className="font-mono">{sessionId}</span>
          </p>
          <Link
            href="/org/dashboard"
            className="inline-block text-sm font-bold text-orange-500 hover:text-orange-400"
          >
            Back to dashboard
          </Link>
        </div>
      </main>
    )
  }

  // Team is ready — issue a team session cookie scoped to the org owner,
  // then forward to the team coach dashboard.
  const token = await signTeamSession({ teamId: team.id, adminEmail: orgSession.adminEmail })
  const store = await cookies()
  store.set(teamSessionCookieOptions(token))
  redirect('/team/dashboard')
}

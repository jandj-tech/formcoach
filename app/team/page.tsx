import type { Metadata } from 'next'
import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import Link from 'next/link'
import { isInAppRequest } from '@/lib/in-app'
import { getSession } from '@/lib/auth'
import { getTeamSession } from '@/lib/team-auth'
import { getOrgSession } from '@/lib/org-auth'
import { db } from '@/lib/db'
import TeamHubClient, { type HubTeam } from './TeamHubClient'
import { ArrowRightIcon, GraduationCapIcon, TargetIcon, TrendingUpIcon, TrophyIcon } from 'lucide-react'
import { TEAM_TOKEN_PRICE_CENTS, ORG_BULK_MIN_QTY, REGULAR_ANALYSIS_PRICE_CENTS, PLUS_VOLUME_TIERS, percentLabel, usd, type VolumeTier } from '@/lib/team-pricing'

// The deepest tier a team can reach, read off the ladder rather than typed.
const bestTeamDiscount = PLUS_VOLUME_TIERS.reduce(
  (top: number, tier: VolumeTier) => Math.max(top, tier.percentOff),
  0,
)

export const metadata: Metadata = {
  title: 'Basketball Team & Organization Shot Analysis | LearnHoops',
  description:
    'AI basketball shot analysis for teams and organizations — coach dashboards, rosters, player rankings, improvement tracking, and bulk analysis tokens at $2.49 each when buying 10 or more on the website.',
  alternates: { canonical: '/team' },
}

export default async function TeamLandingPage() {
  const inApp = await isInAppRequest()

  // Signed-in visitors see THEIR team here — this page is the "Teams" home,
  // not just the org sales pitch.
  const session = await getSession()
  let myTeams: Array<{ id: string; name: string; access_code: string; admin_email: string }> = []
  if (session) {
    try {
      myTeams = (await db`
        SELECT t.id, t.name, t.access_code, t.admin_email
        FROM team_memberships tm JOIN teams t ON t.id = tm.team_id
        WHERE tm.user_id = ${session.userId}
        ORDER BY tm.joined_at DESC
      `) as unknown as typeof myTeams
    } catch {}
  }

  // Roster + coach names for the hub (server-rendered; the schedule and chat
  // are client-fetched). Any per-team query failing degrades to an empty list
  // instead of breaking the page.
  const hubTeams: HubTeam[] = []
  for (const t of myTeams) {
    let coaches: string[] = []
    try {
      const [head] = (await db`
        SELECT coach_nickname FROM teams WHERE id = ${t.id}
      `) as unknown as [{ coach_nickname: string | null } | undefined]
      coaches = [head?.coach_nickname || t.admin_email]
    } catch {
      coaches = [t.admin_email]
    }
    try {
      const extra = (await db`
        SELECT email, nickname FROM team_coaches WHERE team_id = ${t.id} ORDER BY created_at ASC
      `) as unknown as Array<{ email: string; nickname: string | null }>
      coaches.push(...extra.map(c => c.nickname || c.email))
    } catch {}

    let players: string[] = []
    try {
      const roster = (await db`
        SELECT COALESCE(NULLIF(tm.first_name, ''), u.email) AS first_name,
               COALESCE(tm.last_name_initial, '') AS last_initial
        FROM team_memberships tm JOIN users u ON u.id = tm.user_id
        WHERE tm.team_id = ${t.id}
        ORDER BY tm.first_name ASC NULLS LAST
      `) as unknown as Array<{ first_name: string; last_initial: string }>
      players = roster.map(r => {
        const f = (r.first_name || '').trim()
        const l = (r.last_initial || '').trim()
        if (!l) return f
        return l.length === 1 ? `${f} ${l}.` : `${f} ${l}`
      })
    } catch {}

    hubTeams.push({
      id: t.id,
      name: t.name,
      accessCode: t.access_code,
      memberCount: players.length,
      coaches,
      players,
    })
  }
  const teamSession = myTeams.length === 0 ? await getTeamSession() : null
  const orgSession = myTeams.length === 0 && !teamSession ? await getOrgSession() : null

  return (
    <main className="min-h-screen bg-ink-950 text-chalk flex flex-col">
      <TopNav />

      {/* Coach / org: jump straight to the admin dashboard */}
      {(teamSession || orgSession) && (
        <div className="bg-ink-900 border-b border-courtline px-6 py-4 flex items-center justify-center gap-4 flex-wrap">
          <p className="text-chalk-dim text-sm">You&apos;re signed in as a {orgSession ? 'organization' : 'coach'} —</p>
          <Link
            href={orgSession ? '/org/dashboard' : '/team/dashboard'}
            className="inline-flex items-center gap-1.5 bg-ember-500 hover:bg-ember-400 text-ink-950 font-bold px-5 py-2 rounded-full text-sm transition-colors"
          >
            Open your dashboard
            <ArrowRightIcon aria-hidden className="w-4 h-4" />
          </Link>
        </div>
      )}

      {/* Player: the team hub — big team name, schedule with one-tap RSVP,
          roster, leaderboard link, and chat behind a dropdown that expands
          large. Schedule is the everyday section; chat is a destination. */}
      {myTeams.length > 0 && (
        <div className="px-6 pt-10 pb-4 max-w-3xl mx-auto w-full space-y-6">
          <TeamHubClient teams={hubTeams} />
          <p className="text-chalk-dim text-xs text-center pb-6">
            Shot history and account settings live on your{' '}
            <Link href="/dashboard" className="text-ember-400 underline">dashboard</Link>.
          </p>
        </div>
      )}

      {/* Org marketing — only for visitors not on a team */}
      {myTeams.length === 0 && (<>
      {/* Hero */}
      <div className="hero-glow grain relative flex flex-col items-center text-center px-6 pt-16 pb-14 space-y-10">
        <div className="space-y-5 max-w-2xl">
          <p className="eyebrow text-ember-400 select-none">For clubs, schools &amp; academies</p>
          <h1 className="font-display font-black uppercase text-[clamp(2.2rem,6vw,4.5rem)] leading-[0.95]">
            LearnHoops <span className="text-gradient-ember">Team Plan</span>
          </h1>
          <p className="text-chalk-dim text-lg">
            Get your whole team analyzed. AI grades every player&apos;s shot form — see who&apos;s ranked best and who&apos;s improving the most.
          </p>
          <div className="pt-2">
            <Link
              href="/org/signup"
              className="inline-block bg-ember-500 hover:bg-ember-400 active:scale-[0.98] text-ink-950 font-bold px-8 py-4 rounded-full transition-all shadow-[0_0_40px_-8px_rgba(255,92,26,0.55)]"
            >
              Get started today
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl w-full text-left">
          <div className="card-lift bg-ink-900 border border-courtline rounded-2xl p-6 space-y-2">
            {inApp ? (
              <>
                <TargetIcon aria-hidden className="w-8 h-8 text-ember-500" />
                <div className="font-display font-bold uppercase text-chalk">Pay as you go</div>
                <div className="text-chalk-dim text-sm">Use analysis credits whenever your team needs them.</div>
              </>
            ) : (
              <>
                <div className="font-numeric text-3xl text-ember-500">{usd(TEAM_TOKEN_PRICE_CENTS)}</div>
                <div className="font-display font-bold uppercase text-chalk">Per upload in bulk</div>
                {/* The bulk rate has a hard minimum and is website-only — say
                    both here, where the number is, so the price can never read
                    as the single-token price. All figures derive from
                    lib/team-pricing so they cannot outlive a ladder change. */}
                <div className="text-chalk-dim text-sm">
                  Organization rate when buying {ORG_BULK_MIN_QTY}+ analysis tokens on the website.
                  Smaller orders use standard pricing.
                </div>
                <div className="pt-3 mt-1 border-t border-courtline">
                  <div className="font-display font-black uppercase text-ember-500 text-xl leading-none">
                    Up to {percentLabel(bestTeamDiscount)}% off
                  </div>
                  <div className="text-chalk-dim text-sm mt-1">the {usd(REGULAR_ANALYSIS_PRICE_CENTS)} single-analysis price.</div>
                </div>
              </>
            )}
          </div>
          <div className="card-lift bg-ink-900 border border-courtline rounded-2xl p-6 space-y-2">
            <TrophyIcon className="w-7 h-7 text-ember-400" aria-hidden />
            <div className="font-display font-bold uppercase text-chalk">Player rankings</div>
            <div className="text-chalk-dim text-sm">Every player ranked by their best shot score so you always know where everyone stands.</div>
          </div>
          <div className="card-lift bg-ink-900 border border-courtline rounded-2xl p-6 space-y-2">
            <TrendingUpIcon className="w-7 h-7 text-ember-400" aria-hidden />
            <div className="font-display font-bold uppercase text-chalk">Most improved</div>
            <div className="text-chalk-dim text-sm">Track who&apos;s putting in the work with automatic improvement tracking.</div>
          </div>
        </div>
      </div>

      {/* CTA band */}
      <div className="bg-ink-900 border-y border-courtline w-full py-10 flex flex-col items-center gap-6 text-center px-6">
        <p className="font-display font-black uppercase text-xl sm:text-2xl max-w-md leading-tight">
          Ready to take your organization to the next level?
        </p>
        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md sm:w-auto">
          <Link
            href="/org/signup"
            className="bg-ember-500 hover:bg-ember-400 active:scale-[0.98] text-ink-950 font-bold px-8 py-4 rounded-full transition-all shadow-[0_0_40px_-8px_rgba(255,92,26,0.55)]"
          >
            Get started today
          </Link>
          {!session && !teamSession && !orgSession && (
            <Link
              href="/login"
              className="border border-courtline hover:border-chalk-dim active:scale-[0.98] text-chalk font-bold px-8 py-4 rounded-full transition-all"
            >
              Log In
            </Link>
          )}
        </div>
      </div>

      {/* How it works */}
      <div className="flex flex-col px-6 pt-16 pb-20 max-w-5xl mx-auto w-full space-y-10">
        <div>
          <p className="eyebrow text-ember-400 mb-3 select-none">How it works</p>
          <h2 className="font-display font-black uppercase text-[clamp(1.7rem,4vw,3rem)] leading-[0.95]">
            Three steps to launch
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full text-left">
          <div className="fade-up card-lift bg-ink-900 border border-courtline rounded-2xl p-6 space-y-2">
            <div className="font-numeric text-ember-500 text-lg select-none">01</div>
            <div className="font-display font-bold uppercase text-chalk">Register your organization</div>
            <div className="text-chalk-dim text-sm">Create your org account. Get your organization code to link all your teams together.</div>
          </div>
          <div className="fade-up card-lift bg-ink-900 border border-courtline rounded-2xl p-6 space-y-2">
            <div className="font-numeric text-ember-500 text-lg select-none">02</div>
            <div className="font-display font-bold uppercase text-chalk">Add teams &amp; invite coaches</div>
            <div className="text-chalk-dim text-sm">Add each team with its age group and coach email. Coaches get a setup link automatically.</div>
          </div>
          <div className="fade-up card-lift bg-ink-900 border border-courtline rounded-2xl p-6 space-y-2">
            <div className="font-numeric text-ember-500 text-lg select-none">03</div>
            <div className="font-display font-bold uppercase text-chalk">Players upload, you track everything</div>
            <div className="text-chalk-dim text-sm">{inApp ? <>Watch the leaderboard fill up and see who&apos;s improving across every team.</> : <>Buy credits for players, watch the leaderboard fill up, and see who&apos;s improving across every team.</>}</div>
          </div>
        </div>

        {!inApp && (
        <Link
          href="/org/signup"
          className="card-lift w-full bg-ember-500 hover:bg-ember-400 rounded-2xl px-6 py-5 flex items-center gap-4 text-ink-950 transition-colors"
        >
          <GraduationCapIcon className="w-8 h-8 shrink-0" aria-hidden />
          <div className="text-left flex-1">
            <p className="font-display font-black uppercase text-base leading-tight">10-Week Shooting Class — for organizations</p>
            <p className="text-ink-950/80 text-sm mt-1">Each player gets a ball, 2 shot analyses, and a certificate of completion that shows their improvement. Starting at $40/player.</p>
          </div>
          <ArrowRightIcon aria-hidden className="w-5 h-5 shrink-0" />
        </Link>
        )}
      </div>

      </>)}

      <div className="flex-1" />
      <SiteFooter />
    </main>
  )
}

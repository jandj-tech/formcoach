import type { Metadata } from 'next'
import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import Link from 'next/link'
import { isInAppRequest } from '@/lib/in-app'
import { getSession } from '@/lib/auth'
import { getTeamSession } from '@/lib/team-auth'
import { getOrgSession } from '@/lib/org-auth'
import { db } from '@/lib/db'
import TeamChatPanel from '@/components/TeamChatPanel'
import { GraduationCapIcon, TrendingUpIcon, TrophyIcon } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Organizations — LearnHoops.com',
  description:
    'LearnHoops Team Plan: AI shot analysis for whole organizations — player rankings, improvement tracking, and credits from $1.49 per upload.',
}

export default async function TeamLandingPage() {
  const inApp = await isInAppRequest()

  // Signed-in visitors see THEIR team here — this page is the "Teams" home,
  // not just the org sales pitch.
  const session = await getSession()
  let myTeams: Array<{ id: string; name: string; access_code: string }> = []
  if (session) {
    try {
      myTeams = (await db`
        SELECT t.id, t.name, t.access_code
        FROM team_memberships tm JOIN teams t ON t.id = tm.team_id
        WHERE tm.user_id = ${session.userId}
        ORDER BY tm.joined_at DESC
      `) as unknown as typeof myTeams
    } catch {}
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
            className="bg-ember-500 hover:bg-ember-400 text-ink-950 font-bold px-5 py-2 rounded-full text-sm transition-colors"
          >
            Open your dashboard →
          </Link>
        </div>
      )}

      {/* Player: your teams live right here */}
      {myTeams.length > 0 && (
        <div className="px-6 pt-12 pb-4 max-w-3xl mx-auto w-full space-y-6">
          <div>
            <p className="eyebrow text-ember-400 select-none">Your teams</p>
            <h1 className="font-display font-black uppercase text-[clamp(1.8rem,4vw,3rem)] leading-[0.95] mt-1">
              My <span className="text-gradient-ember">Teams</span>
            </h1>
          </div>
          {myTeams.map(t => (
            <div key={t.id} className="bg-ink-900 border border-courtline rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-display font-bold uppercase text-chalk text-lg">{t.name}</p>
                  <p className="text-chalk-dim text-xs mt-0.5">Team code: <span className="font-mono">{t.access_code}</span></p>
                </div>
                <Link
                  href={`/dashboard/leaderboard?team=${t.id}`}
                  className="text-ember-400 hover:text-ember-300 text-sm font-semibold transition-colors"
                >
                  Leaderboard →
                </Link>
              </div>
              <div className="bg-white rounded-xl p-4">
                <TeamChatPanel teamId={t.id} />
              </div>
            </div>
          ))}
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
              Register Organization
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl w-full text-left">
          <div className="card-lift bg-ink-900 border border-courtline rounded-2xl p-6 space-y-2">
            {inApp ? (
              <>
                <div className="font-numeric text-3xl text-ember-500">🎯</div>
                <div className="font-display font-bold uppercase text-chalk">Pay as you go</div>
                <div className="text-chalk-dim text-sm">Use analysis credits whenever your team needs them.</div>
              </>
            ) : (
              <>
                <div className="font-numeric text-3xl text-ember-500">$1.49</div>
                <div className="font-display font-bold uppercase text-chalk">Per upload</div>
                <div className="text-chalk-dim text-sm">Buy credits and use them when you need them.</div>
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
            Register Organization
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
          <span className="shrink-0 font-bold text-lg select-none" aria-hidden>→</span>
        </Link>
        )}
      </div>

      </>)}

      <div className="flex-1" />
      <SiteFooter />
    </main>
  )
}

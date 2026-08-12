import type { Metadata } from 'next'
import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import VideoUploader from '@/components/VideoUploader'
import CoachSelfUploader from '@/components/CoachSelfUploader'
import PremiumCTA from '@/components/PremiumCTA'
import { getSession } from '@/lib/auth'
import { getTeamSession } from '@/lib/team-auth'
import { getOrgSession } from '@/lib/org-auth'
import { getTeamTokenState, userHasInitiatedTeam, orgHasInitiatedTeam } from '@/lib/team-tokens'
import { db } from '@/lib/db'

export const metadata: Metadata = {
  title: 'Analyze — LearnHoops.com',
  description: 'Upload a video of your shot and get scored across 18 coaching criteria.',
}

export default async function AnalyzePage() {
  // Anyone can analyze here. Players use analysis tokens; coaches and org
  // owners use their own credit balance.
  const playerSession = await getSession()
  const teamSession = playerSession ? null : await getTeamSession()
  const orgSession = playerSession || teamSession ? null : await getOrgSession()

  const coachEmail = teamSession?.adminEmail ?? orgSession?.adminEmail ?? null
  let coachSelf: { credits: number; initiated: boolean } | null = null
  const playerInitiated = playerSession ? await userHasInitiatedTeam(playerSession.userId) : false

  if (coachEmail) {
    let initiated = false
    try {
      if (teamSession) {
        // A team coach only gets $0.99 if their own team is initiated.
        const state = await getTeamTokenState(teamSession.teamId)
        initiated = !!state?.initiated
      } else if (orgSession) {
        // An org owner gets $0.99 once any of their teams is initiated.
        initiated = await orgHasInitiatedTeam(orgSession.orgId)
      }
    } catch {
      // team-membership query failed pre-migration — treat as not initiated
    }
    let credits = 0
    try {
      if (orgSession) {
        // An org owner spends from the organization's own token balance.
        const [o] = (await db`
          SELECT COALESCE(token_balance, 0)::int AS token_balance
          FROM organizations WHERE id = ${orgSession.orgId}
        `) as unknown as [{ token_balance: number } | undefined]
        credits = o?.token_balance ?? 0
      } else {
        const [c] = (await db`
          SELECT credits FROM coach_credits WHERE email = ${coachEmail}
        `) as unknown as [{ credits: number } | undefined]
        credits = c?.credits ?? 0
      }
    } catch {
      // coach_credits / token_balance column missing pre-migration
    }
    coachSelf = { credits, initiated }
  }

  return (
    <main className="flex flex-col min-h-screen bg-ink-950 text-chalk">
      <TopNav />

      <section className="hero-glow grain relative flex flex-col items-center text-center px-4 pt-14 pb-8 sm:pt-20">
        <p className="eyebrow text-ember-400 mb-3 select-none">AI Shot Analysis</p>
        <h1 className="font-display font-black uppercase text-[clamp(2.2rem,6vw,4.5rem)] leading-[0.95] max-w-2xl">
          Analyze <span className="text-gradient-ember">your shot</span>
        </h1>
        <p className="text-chalk-dim text-sm sm:text-base mt-4 max-w-md">
          Upload a video and our AI will score your form across 18 coaching criteria.
        </p>
        {!playerSession && !coachSelf && (
          <p className="inline-flex items-center gap-2 mt-4 bg-ember-500/10 border border-ember-500/30 rounded-full px-4 py-1.5 text-ember-400 text-sm font-bold select-none">
            <span className="w-1.5 h-1.5 rounded-full bg-ember-500 animate-pulse" aria-hidden />
            Your first analysis is free — sign up below
          </p>
        )}
      </section>

      <section className="flex-1 flex flex-col items-center px-4 pb-20">
        {/* The upload flow keeps its light panel so every state stays readable. */}
        <div className="w-full max-w-xl bg-white rounded-3xl p-3 sm:p-5 shadow-[0_0_60px_-20px_rgba(255,92,26,0.35)]">
          {coachSelf ? (
            <CoachSelfUploader credits={coachSelf.credits} initiated={coachSelf.initiated} />
          ) : (
            <VideoUploader />
          )}
        </div>
        {!coachSelf && (
          <div className="w-full max-w-xl mt-4 px-2">
            <PremiumCTA dark initiated={playerInitiated} />
          </div>
        )}
        <p className="text-chalk-dim text-xs mt-5 text-center max-w-sm px-4">
          Your video is never stored long-term. Frames are analyzed and then used only to generate your report.
        </p>
        <a
          href="/support#filming"
          className="mt-6 text-sm text-chalk-dim hover:text-chalk underline underline-offset-2 transition-colors py-2"
        >
          How to take a video to get the most accurate results
        </a>
      </section>

      <SiteFooter />
    </main>
  )
}

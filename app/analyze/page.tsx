import TopNav from '@/components/TopNav'
import VideoUploader from '@/components/VideoUploader'
import CoachSelfUploader from '@/components/CoachSelfUploader'
import PremiumCTA from '@/components/PremiumCTA'
import { getSession } from '@/lib/auth'
import { getTeamSession } from '@/lib/team-auth'
import { getOrgSession } from '@/lib/org-auth'
import { getTeamTokenState } from '@/lib/team-tokens'
import { db } from '@/lib/db'

export default async function AnalyzePage() {
  // Anyone can analyze here. Players use analysis tokens; coaches and org
  // owners use their own credit balance.
  const playerSession = await getSession()
  const teamSession = playerSession ? null : await getTeamSession()
  const orgSession = playerSession || teamSession ? null : await getOrgSession()

  const coachEmail = teamSession?.adminEmail ?? orgSession?.adminEmail ?? null
  let coachSelf: { credits: number; initiated: boolean } | null = null

  if (coachEmail) {
    let initiated = false
    try {
      if (teamSession) {
        const state = await getTeamTokenState(teamSession.teamId)
        initiated = !!state?.initiated
      } else if (orgSession) {
        const rows = (await db`
          SELECT 1 FROM teams
          WHERE organization_id = ${orgSession.orgId} AND initiated_at IS NOT NULL
          LIMIT 1
        `) as unknown as unknown[]
        initiated = rows.length > 0
      }
    } catch {
      // initiated_at column missing pre-migration — treat as not initiated
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
    <main className="flex flex-col min-h-screen bg-white">
      <TopNav />

      <section className="flex flex-col items-center text-center px-4 pt-10 pb-6">
        <h1 className="text-3xl sm:text-4xl font-black text-black leading-tight max-w-2xl">
          Analyze your <span className="text-orange-500">shot</span>
        </h1>
        <p className="text-black text-sm sm:text-base mt-3 max-w-md">
          Upload a video and our AI will score your form across 17 coaching criteria.
        </p>
      </section>

      <section className="flex-1 flex flex-col items-center px-4 pb-16">
        {coachSelf ? (
          <CoachSelfUploader credits={coachSelf.credits} initiated={coachSelf.initiated} />
        ) : (
          <>
            <VideoUploader />
            <div className="w-full max-w-lg mt-4 px-2">
              <PremiumCTA />
            </div>
          </>
        )}
        <p className="text-black text-xs mt-3 text-center max-w-sm px-4">
          Your video is never stored long-term. Frames are analyzed and then used only to generate your report.
        </p>
        <a
          href="/support"
          className="mt-6 text-sm text-gray-500 hover:text-black underline underline-offset-2 transition-colors"
        >
          How to take a video to get most accurate results
        </a>
      </section>

      <footer className="py-5 border-t border-gray-200 text-center text-black text-xs">
        © {new Date().getFullYear()} LearnHoops.com. All rights reserved.
      </footer>
    </main>
  )
}

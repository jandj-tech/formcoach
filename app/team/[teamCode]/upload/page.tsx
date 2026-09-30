import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { provenTeamCoachCreditsEmail } from '@/lib/team-auth'
import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import TeamUploadClient from './TeamUploadClient'

export default async function TeamUploadPage({
  params,
}: {
  params: Promise<{ teamCode: string }>
}) {
  const { teamCode } = await params

  const [team] = await db`
    SELECT id, name, access_code, admin_email, credits
    FROM teams WHERE access_code = ${teamCode.toUpperCase()}
  ` as unknown as [{ id: string; name: string; access_code: string; admin_email: string; credits: number } | undefined]

  if (!team) return notFound()

  // Team uploads spend the head coach's personal credits first (only when the
  // head-coach row provably holds that email — provenTeamCoachCreditsEmail),
  // then the legacy team budget — show the combined total so the count
  // matches what's usable.
  const headCreditsEmail = await provenTeamCoachCreditsEmail(team.id)
  const [cc] = headCreditsEmail
    ? await db`
        SELECT COALESCE(credits, 0)::int AS credits FROM coach_credits WHERE LOWER(email) = ${headCreditsEmail}
      ` as unknown as [{ credits: number } | undefined]
    : [undefined]
  const availableCredits = (cc?.credits ?? 0) + team.credits

  return (
    <main className="min-h-screen bg-white flex flex-col">
      <TopNav />
      <TeamUploadClient
        teamName={team.name}
        teamCode={team.access_code}
        initialCredits={availableCredits}
      />
      <SiteFooter />
    </main>
  )
}

import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import TopNav from '@/components/TopNav'
import TeamUploadClient from './TeamUploadClient'

export default async function TeamUploadPage({
  params,
}: {
  params: Promise<{ teamCode: string }>
}) {
  const { teamCode } = await params

  const [team] = await db`
    SELECT name, access_code, admin_email, credits
    FROM teams WHERE access_code = ${teamCode.toUpperCase()}
  ` as unknown as [{ name: string; access_code: string; admin_email: string; credits: number } | undefined]

  if (!team) return notFound()

  // Team uploads spend the coach's personal credits first, then the legacy
  // team budget — show the combined total so the count matches what's usable.
  const [cc] = await db`
    SELECT COALESCE(credits, 0)::int AS credits FROM coach_credits WHERE LOWER(email) = ${team.admin_email.toLowerCase()}
  ` as unknown as [{ credits: number } | undefined]
  const availableCredits = (cc?.credits ?? 0) + team.credits

  return (
    <main className="min-h-screen bg-white flex flex-col">
      <TopNav />
      <TeamUploadClient
        teamName={team.name}
        teamCode={team.access_code}
        initialCredits={availableCredits}
      />
    </main>
  )
}

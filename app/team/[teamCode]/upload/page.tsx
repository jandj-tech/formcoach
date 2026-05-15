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
    SELECT name, access_code, credits
    FROM teams WHERE access_code = ${teamCode.toUpperCase()}
  ` as unknown as [{ name: string; access_code: string; credits: number } | undefined]

  if (!team) return notFound()

  return (
    <main className="min-h-screen bg-white flex flex-col">
      <TopNav />
      <TeamUploadClient
        teamName={team.name}
        teamCode={team.access_code}
        initialCredits={team.credits}
      />
    </main>
  )
}

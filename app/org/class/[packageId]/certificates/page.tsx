import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/db'
import PrintButton from '@/components/PrintButton'
import CertificateBlock from '@/components/CertificateBlock'
import { getOrgSession } from '@/lib/org-auth'
import { getTeamSession } from '@/lib/team-auth'

interface Props {
  params: Promise<{ packageId: string }>
}

export default async function BatchCertificatesPage({ params }: Props) {
  const { packageId } = await params

  // Printable by the owning org or by the coach of the class team.
  const [orgSession, teamSession] = await Promise.all([getOrgSession(), getTeamSession()])
  if (!orgSession && !teamSession) {
    redirect(`/login?next=/org/class/${encodeURIComponent(packageId)}/certificates`)
  }

  const [pkg] = (orgSession
    ? await db`
        SELECT p.id, p.player_count
        FROM org_class_packages p
        WHERE p.id = ${packageId} AND p.org_id = ${orgSession.orgId}
      `
    : await db`
        SELECT p.id, p.player_count
        FROM org_class_packages p
        JOIN teams t ON t.class_package_id = p.id
        WHERE p.id = ${packageId} AND t.id = ${teamSession!.teamId}
      `) as unknown as Array<{ id: string; player_count: number }>
  if (!pkg) notFound()

  // Only enrollments with a completed final analysis.
  const rows = (await db`
    SELECT id, first_name, last_name_initial, first_score, final_score, display_final_score
    FROM org_class_enrollments
    WHERE package_id = ${packageId}
      AND final_submission_id IS NOT NULL
    ORDER BY created_at ASC
  `) as unknown as Array<{
    id: string
    first_name: string | null
    last_name_initial: string | null
    first_score: number | null
    final_score: number | null
    display_final_score: number | null
  }>

  // Mark all not-yet-issued certs as issued (best-effort).
  if (rows.length > 0) {
    await db`
      UPDATE org_class_enrollments
      SET certificate_issued_at = COALESCE(certificate_issued_at, NOW())
      WHERE package_id = ${packageId}
        AND final_submission_id IS NOT NULL
    `
  }

  return (
    <main className="min-h-screen bg-zinc-900 flex flex-col items-center p-4 sm:p-8 space-y-6">
      {/* Page-scoped print rules: each cert prints on its own landscape sheet. */}
      <style>{`@page { size: landscape; margin: 0; }`}</style>

      <div className="w-full max-w-5xl flex items-center justify-between gap-4 print:hidden">
        <div className="text-white">
          <p className="text-xs font-bold uppercase tracking-widest text-orange-400">{pkg.player_count}-Player Class</p>
          <h1 className="text-2xl font-black">Completion Certificates</h1>
          <p className="text-sm text-zinc-400 mt-1">
            {rows.length} of {pkg.player_count} player{pkg.player_count !== 1 ? 's have' : ' has'} completed both analyses.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Link
            href="/org/dashboard"
            className="text-sm font-semibold text-zinc-400 hover:text-white transition-colors"
          >
            ← Back
          </Link>
          {rows.length > 0 && <PrintButton label={`Print all ${rows.length} certificate${rows.length !== 1 ? 's' : ''}`} />}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="w-full max-w-5xl bg-zinc-800 border border-zinc-700 rounded-2xl p-10 text-center print:hidden">
          <p className="text-white font-bold text-lg">No certificates yet</p>
          <p className="text-zinc-400 text-sm mt-1">
            Players need both their first and final analyses uploaded before a certificate is issued.
          </p>
        </div>
      ) : (
        <div className="w-full flex flex-col items-center gap-6">
          {rows.map((r) => {
            const firstName = r.first_name || 'Player'
            const lastName = r.last_name_initial ? ` ${r.last_name_initial}.` : ''
            const playerName = `${firstName}${lastName}`
            const finalScore = r.display_final_score ?? r.final_score
            return (
              <div key={r.id} className="cert-page w-full flex justify-center">
                <CertificateBlock
                  playerName={playerName}
                  firstScore={r.first_score}
                  finalScore={finalScore}
                />
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}

import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import PrintButton from '@/components/PrintButton'
import CertificateBlock from '@/components/CertificateBlock'

interface Props {
  params: Promise<{ enrollmentId: string }>
}

export default async function CertificatePage({ params }: Props) {
  const { enrollmentId } = await params

  const [row] = await db`
    SELECT
      e.id, e.first_name, e.last_name_initial,
      e.first_score, e.display_final_score, e.final_score,
      e.certificate_issued_at
    FROM org_class_enrollments e
    WHERE e.id = ${enrollmentId}
      AND e.final_submission_id IS NOT NULL
  ` as unknown as [{
    id: string
    first_name: string | null
    last_name_initial: string | null
    first_score: number | null
    display_final_score: number | null
    final_score: number | null
    certificate_issued_at: string | null
  } | undefined]

  if (!row) notFound()

  const firstName = row.first_name || 'Player'
  const lastName = row.last_name_initial ? ` ${row.last_name_initial}.` : ''
  const playerName = `${firstName}${lastName}`
  const finalScore = row.display_final_score ?? row.final_score

  if (!row.certificate_issued_at) {
    await db`
      UPDATE org_class_enrollments SET certificate_issued_at = NOW()
      WHERE id = ${enrollmentId}
    `
  }

  return (
    <main className="min-h-screen bg-zinc-900 flex flex-col items-center justify-center p-4 sm:p-8">
      <style>{`@page { size: landscape; margin: 0; }`}</style>

      <div className="mb-5 print:hidden">
        <PrintButton label="Print Certificate" />
      </div>

      <CertificateBlock
        playerName={playerName}
        firstScore={row.first_score}
        finalScore={finalScore}
      />
    </main>
  )
}

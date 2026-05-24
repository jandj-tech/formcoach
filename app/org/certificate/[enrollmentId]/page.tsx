import Image from 'next/image'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import PrintButton from '@/components/PrintButton'

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

  const startNum = Number(row.first_score ?? 0)
  const finalNum = Number(row.display_final_score ?? row.final_score ?? 0)
  const startScore = startNum.toFixed(1)
  const finalScore = finalNum.toFixed(1)
  const diff = finalNum - startNum
  const improvement = `${diff >= 0 ? '+' : '−'}${Math.abs(diff).toFixed(1)}`

  if (!row.certificate_issued_at) {
    await db`
      UPDATE org_class_enrollments SET certificate_issued_at = NOW()
      WHERE id = ${enrollmentId}
    `
  }

  return (
    <main className="min-h-screen bg-zinc-900 flex flex-col items-center justify-center p-4 sm:p-8">
      {/* Page-scoped: landscape, no margins, only when printing this route. */}
      <style>{`@page { size: landscape; margin: 0; }`}</style>

      <div className="mb-5 print:hidden">
        <PrintButton label="Print Certificate" />
      </div>

      {/* certificate-print = print-mode targeting class (see globals.css).
          container-type=inline-size so children can size with cqw. */}
      <div
        className="certificate-print relative w-full max-w-5xl"
        style={{ aspectRatio: '1491 / 1055', containerType: 'inline-size' }}
      >
        <Image
          src="/certificate-template.png"
          alt="LearnHoops Certificate of Completion"
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 1024px"
          className="object-contain select-none pointer-events-none"
        />

        {/* Player name — text sits just above the "Presented to:" underline. */}
        <div
          className="absolute font-black text-black"
          style={{ left: '22%', right: '5%', top: '54.5%', fontSize: '2.6cqw', lineHeight: 1 }}
        >
          {playerName}
        </div>

        {/* First Analysis Score — centered over the first blank. */}
        <div
          className="absolute font-black text-black text-center"
          style={{ left: '22.5%', width: '14%', top: '63%', fontSize: '1.9cqw', lineHeight: 1 }}
        >
          {startScore}
        </div>

        {/* Final Analysis Score — centered over the second blank. */}
        <div
          className="absolute font-black text-black text-center"
          style={{ left: '52%', width: '12%', top: '63%', fontSize: '1.9cqw', lineHeight: 1 }}
        >
          {finalScore}
        </div>

        {/* Improvement — signed raw difference (green if up, red if down).
            The Keep Hooping badge crowds this slot, so the box is narrow,
            placed clear to the LEFT of the badge with a smaller font. */}
        <div
          className="absolute font-black text-center whitespace-nowrap"
          style={{
            left: '79%',
            width: '7%',
            top: '63.2%',
            fontSize: '1.5cqw',
            color: diff >= 0 ? '#16a34a' : '#dc2626',
            lineHeight: 1,
          }}
        >
          {improvement}
        </div>

        {/* DATE + COACH SIGNATURE — intentionally left blank for the coach to fill in */}
      </div>
    </main>
  )
}

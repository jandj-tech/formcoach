import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getOrgSession } from '@/lib/org-auth'

interface Props {
  params: Promise<{ enrollmentId: string }>
}

export default async function CertificatePage({ params }: Props) {
  const { enrollmentId } = await params
  const session = await getOrgSession()
  if (!session) redirect('/org/login')

  const [row] = await db`
    SELECT
      e.id, e.first_name, e.last_name_initial,
      e.first_score, e.display_final_score, e.final_score,
      e.is_first_class, e.certificate_issued_at,
      o.name AS org_name
    FROM org_class_enrollments e
    JOIN org_class_packages p ON p.id = e.package_id
    JOIN organizations o ON o.id = p.org_id
    WHERE e.id = ${enrollmentId}
      AND p.org_id = ${session.orgId}
      AND e.final_submission_id IS NOT NULL
  ` as unknown as [{ id: string; first_name: string | null; last_name_initial: string | null; first_score: number | null; display_final_score: number | null; final_score: number | null; is_first_class: boolean; certificate_issued_at: string | null; org_name: string } | undefined]

  if (!row) redirect('/org/dashboard')

  const firstName = row.first_name || 'Player'
  const lastName = row.last_name_initial ? ` ${row.last_name_initial}.` : ''
  const playerName = `${firstName}${lastName}`
  const startScore = Number(row.first_score ?? 0).toFixed(1)
  const finalScore = Number(row.display_final_score ?? row.final_score ?? 0).toFixed(1)
  const startNum = Number(row.first_score ?? 0)
  const finalNum = Number(row.display_final_score ?? row.final_score ?? 0)
  const improvementPct = startNum > 0 ? (((finalNum - startNum) / startNum) * 100).toFixed(1) : '0.0'
  const improved = finalNum > startNum
  const passes = finalNum >= startNum

  // Mark certificate as issued if not yet
  if (!row.certificate_issued_at) {
    await db`
      UPDATE org_class_enrollments SET certificate_issued_at = NOW()
      WHERE id = ${enrollmentId}
    `
  }

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-6">
      {/* Print button — hidden when printing */}
      <div className="mb-6 print:hidden">
        <button
          onClick={undefined}
          className="bg-orange-500 hover:bg-orange-400 text-white font-bold px-6 py-3 rounded-xl text-sm transition-colors"
          id="print-btn"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `document.getElementById('print-btn').textContent='Print Certificate';document.getElementById('print-btn').onclick=()=>window.print();`,
          }}
        />
      </div>

      {/* Certificate */}
      <div
        className="bg-white w-full max-w-2xl rounded-3xl overflow-hidden"
        style={{ boxShadow: '0 4px 40px rgba(0,0,0,0.15)', border: '8px solid #f97316' }}
      >
        {/* Header stripe */}
        <div className="bg-orange-500 px-10 py-6 text-center">
          <p className="text-orange-100 text-sm font-bold uppercase tracking-widest">LearnHoops.com</p>
          <h1 className="text-white text-3xl font-black mt-1">Certificate of Completion</h1>
        </div>

        <div className="px-10 py-8 text-center space-y-6">
          <div>
            <p className="text-gray-500 text-sm uppercase tracking-widest font-semibold">This certifies that</p>
            <p className="text-5xl font-black text-black mt-2">{playerName}</p>
          </div>

          <p className="text-gray-600 text-base leading-relaxed max-w-md mx-auto">
            has successfully completed the{' '}
            <span className="font-bold text-black">10-Week Basketball Shooting Class</span>
            {' '}presented by{' '}
            <span className="font-bold text-orange-600">{row.org_name}</span>
          </p>

          {/* Score comparison */}
          <div className="flex items-center justify-center gap-6 py-4">
            <div className="text-center">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Starting Score</p>
              <p className="text-4xl font-black text-gray-400 mt-1">{startScore}</p>
              <p className="text-xs text-gray-300 mt-0.5">/ 10.0</p>
            </div>
            <div className="text-center px-4">
              <div
                className={`text-3xl font-black ${improved ? 'text-green-500' : 'text-gray-400'}`}
              >
                {improved ? `+${improvementPct}%` : `${improvementPct}%`}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">improvement</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Final Score</p>
              <p className="text-4xl font-black text-orange-500 mt-1">{finalScore}</p>
              <p className="text-xs text-gray-300 mt-0.5">/ 10.0</p>
            </div>
          </div>

          {/* Pass / Fail badge */}
          <div className={`inline-block px-8 py-3 rounded-full font-black text-xl ${passes ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
            {passes ? 'PASSED' : 'COMPLETED'}
          </div>

          <div className="border-t border-gray-100 pt-5 text-sm text-gray-400 space-y-1">
            <p>Issued on {today}</p>
            <p className="text-xs">LearnHoops 10-Week Shooting Class · learnhoops.com</p>
          </div>
        </div>
      </div>
    </div>
  )
}

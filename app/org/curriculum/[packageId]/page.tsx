import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { getOrgSession } from '@/lib/org-auth'
import PrintButton from './PrintButton'

interface Props {
  params: Promise<{ packageId: string }>
}

export default async function CurriculumPage({ params }: Props) {
  const { packageId } = await params

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(packageId)) {
    redirect('/org/dashboard')
  }

  const session = await getOrgSession()
  if (!session) redirect('/org/login')

  const rows = await db`
    SELECT p.id, p.player_count, p.created_at, o.name AS org_name
    FROM org_class_packages p
    JOIN organizations o ON o.id = p.org_id
    WHERE p.id = ${packageId} AND p.org_id = ${session.orgId}
  ` as unknown as { id: string; player_count: number; created_at: string; org_name: string }[]

  if (!rows[0]) redirect('/org/dashboard')
  const pkg = rows[0]

  const sessions = [
    { n: 1,  title: 'Initial Shot Analysis',        focus: 'Baseline video submission. Analyze grip, stance, elbow alignment, and release. Identify each player\'s top 2–3 areas to improve.' },
    { n: 2,  title: 'Grip & Hand Placement',         focus: 'Finger pad position on seams, shooting hand vs. balance hand separation. Repetition drills with the LearnHoops ball.' },
    { n: 3,  title: 'Stance & Balance',              focus: 'Feet shoulder-width apart, slight stagger toward basket. Weight distribution, knee bend, and balance at release.' },
    { n: 4,  title: 'Elbow Alignment',               focus: 'Elbow under the ball at set point. L-shape drill, wall drill. Shadow shooting without the ball.' },
    { n: 5,  title: 'Shot Pocket & Load',            focus: 'Consistent catch-and-load position. Catching from different angles, reducing load time for game-speed reps.' },
    { n: 6,  title: 'Upward Force & Legs',           focus: 'Driving from legs through hips into the shot. Jump timing and landing on balance. Form shooting progressing to game range.' },
    { n: 7,  title: 'Release & Wrist Snap',          focus: 'Follow-through with fingers pointing down at target. Backspin consistency. Partner checking each other\'s follow-through.' },
    { n: 8,  title: 'Arc & Trajectory',              focus: 'High arc form shots, progressive distance. Bank shots. Understanding angle-to-basket and adjusting based on feedback.' },
    { n: 9,  title: 'Game Speed & Decision Making',  focus: 'Catch-and-shoot off screens. Shooting off the dribble. Pull-up jumpers. Keeping form under simulated game pressure.' },
    { n: 10, title: 'Final Evaluation + Certificate',focus: 'Final video submission for AI analysis. Review scores vs. Session 1 baseline. Certificate of completion issued for each player.' },
  ]

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .page-break { page-break-before: always; }
        }
      `}</style>

      <div className="min-h-screen bg-gray-50 py-10 px-4">
        <div className="max-w-3xl mx-auto">

          {/* Print button */}
          <div className="no-print flex justify-end mb-6">
            <PrintButton />
          </div>

          {/* Header */}
          <div className="bg-black rounded-2xl p-8 mb-8 text-white">
            <div className="text-orange-500 font-black text-2xl tracking-tight mb-1">LearnHoops.com</div>
            <h1 className="text-3xl font-black leading-tight mb-2">10-Week Shooting Class</h1>
            <p className="text-gray-400 text-sm">
              {pkg.org_name} &nbsp;·&nbsp; {pkg.player_count} Players &nbsp;·&nbsp; Optional Session Guide
            </p>
          </div>

          {/* Intro */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h2 className="font-black text-lg mb-2">How to use this guide</h2>
            <p className="text-gray-600 text-sm leading-relaxed">
              This is an optional session plan — one session per week over 10 weeks.
              Each session has a focus area and suggested drills. You know your players best, so adapt freely.
              The only required elements are the <strong>Session 1 video submission</strong> (baseline) and
              the <strong>Session 10 video submission</strong> (final), which the AI will analyze and compare
              to generate each player&apos;s certificate of improvement.
            </p>
          </div>

          {/* Session cards */}
          <div className="space-y-4">
            {sessions.map((s) => (
              <div key={s.n} className="bg-white rounded-xl border border-gray-200 p-5 flex gap-5">
                <div className="shrink-0 w-12 h-12 rounded-full bg-orange-500 text-ink-950 flex items-center justify-center font-black text-lg">
                  {s.n}
                </div>
                <div>
                  <div className="font-black text-base mb-1">Week {s.n} — {s.title}</div>
                  <p className="text-gray-600 text-sm leading-relaxed">{s.focus}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="mt-10 text-center text-gray-400 text-xs no-print">
            LearnHoops.com &nbsp;·&nbsp; Generated for {pkg.org_name}
          </div>

        </div>
      </div>

    </>
  )
}

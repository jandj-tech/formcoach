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
    {
      n: 1,
      title: 'Initial Shot Analysis',
      required: true,
      focus:
        'Establish each player’s starting point. Every player submits a baseline video for AI analysis so you know exactly what to work on. Review the report together and pick the top 2–3 priorities for the weeks ahead.',
      drills: [
        'Baseline video: 5 free-throw-line jumpers, filmed from the side',
        'Whiteboard the AI report as a group — name the common themes',
        'Each player writes down their personal top 2 focus areas',
      ],
      cue: 'Film from the side, hip height, so grip, elbow, and release are all visible.',
      checkpoint: 'Every player has a submitted baseline score and 2–3 written goals.',
    },
    {
      n: 2,
      title: 'Grip & Hand Placement',
      focus:
        'A repeatable shot starts with a repeatable grip. Set the shooting hand on the seams with finger pads (not palm) on the ball, and separate the guide hand so it only steadies — never pushes.',
      drills: [
        'One-hand form shots from 3 ft — no guide hand at all',
        'Seams check: spin the ball up, catch it in shooting-hand grip',
        'Air gap drill — hold the ball with a visible gap under the palm',
      ],
      cue: 'Fingertips do the work. If your palm touches the ball, you’ll push it flat.',
      checkpoint: 'Player can set the same grip 5 times in a row without looking.',
    },
    {
      n: 3,
      title: 'Stance & Base',
      focus:
        'Balance is the foundation of a consistent shot. Feet shoulder-width apart with a slight stagger of the shooting-side foot toward the rim, knees loaded, weight centered and ready to rise straight up.',
      drills: [
        'Feet-set catches — partner passes, player lands in shooting stance',
        'Balance holds — shoot and freeze the landing for 2 seconds',
        '10-toe drill — both feet point at the rim before the shot',
      ],
      cue: 'Rise and land in the same footprints. Drifting means the base is off.',
      checkpoint: 'Player lands balanced in the same spot on 8 of 10 shots.',
    },
    {
      n: 4,
      title: 'Elbow Alignment & Set Point',
      focus:
        'Get the ball on a straight path to the rim. Shooting elbow tucked under the ball (not flared out), forearm vertical at the set point, ball loaded on the shooting side of the forehead.',
      drills: [
        'Wall drill — shoot into a wall 2 ft away, ball returns straight back',
        'L-shape check — partner confirms a 90° elbow at set point',
        'Shadow shooting — full motion, no ball, eyes on elbow path',
      ],
      cue: 'Elbow under the ball, pointed at the rim — not out to the side.',
      checkpoint: 'Ball comes straight back to the player in the wall drill 8 of 10 times.',
    },
    {
      n: 5,
      title: 'Shot Pocket & Load',
      focus:
        'The shot pocket is where every shot begins — same spot, every time. Build a consistent catch-and-load so the ball travels the same path from catch to release, then shorten the load time toward game speed.',
      drills: [
        'Catch-and-load reps — freeze the pocket, then shoot',
        'Catches from 3 angles — wing, top, corner — same pocket each time',
        'Quick-load count — catch-to-release in one beat',
      ],
      cue: 'Same pocket, same path. The catch should flow straight into the shot.',
      checkpoint: 'Player finds an identical shot pocket regardless of pass angle.',
    },
    {
      n: 6,
      title: 'Legs & Upward Force',
      focus:
        'Range and consistency come from the legs, not the arm. Drive up from the knees and hips into the shot, releasing on the way up so the arm stays relaxed. Introduce game range only once form holds.',
      drills: [
        'Dip-and-rise — load the legs, release as you extend',
        'Form ladder — make 5, step back, repeat to game range',
        'Silent-landing drill — soft, balanced landings every rep',
      ],
      cue: 'Legs power the shot; the arm just guides it. Tired arm = you’re arm-shooting.',
      checkpoint: 'Player reaches game range without changing upper-body form.',
    },
    {
      n: 7,
      title: 'Release & Follow-Through',
      focus:
        'A clean release finishes every rep. Snap the wrist so the fingers point down at the rim, hold the follow-through until the ball lands, and produce consistent backspin.',
      drills: [
        'Cookie-jar finish — hold the follow-through, hand reaching into the rim',
        'Backspin check — shoot straight up, ball returns with tight backspin',
        'Partner freeze — hold the finish, partner grades hand and fingers',
      ],
      cue: 'Reach into the rim and hold it. Fingers down, wrist relaxed — goose-neck.',
      checkpoint: 'Player holds a clean, consistent follow-through on every make.',
    },
    {
      n: 8,
      title: 'Guide Hand Discipline',
      focus:
        'The most common cause of left/right misses is a guide hand that pushes. Train the off hand to come off the ball at release so only the shooting hand controls direction.',
      drills: [
        'Thumb-off drill — guide-hand thumb never touches the ball’s flight',
        'One-motion form shots — guide hand releases early',
        'Video spot-check — look for guide-hand rotation on the ball',
      ],
      cue: 'Guide hand is a passenger, not a driver. It leaves the ball before release.',
      checkpoint: 'No side-spin or guide-hand push visible on slow-motion video.',
    },
    {
      n: 9,
      title: 'Arc, Range & Game Speed',
      focus:
        'Bring it together under pressure. Shoot for a 45–60° arc, hold form to full range, and add game actions — catch-and-shoot off screens, shooting off the dribble, and pull-ups.',
      drills: [
        'High-arc form shots — aim to drop the ball into the rim',
        'Catch-and-shoot off a screen — game-speed footwork',
        'Pull-up series — one dribble into a balanced jumper',
      ],
      cue: 'Shoot it up, not out. A flat shot needs a perfect line; an arced shot forgives.',
      checkpoint: 'Player keeps form and arc when the shot is rushed or contested.',
    },
    {
      n: 10,
      title: 'Final Evaluation + Certificate',
      required: true,
      focus:
        'Measure the progress. Every player submits a final video for AI analysis. Compare the new report against the Session 1 baseline, celebrate the gains, and issue each player a certificate of completion with their scores.',
      drills: [
        'Final video: same 5 jumpers, same angle as Session 1',
        'Side-by-side review — baseline score vs. final score',
        'Set one keep-going goal for each player after the program',
      ],
      cue: 'Match the Session 1 setup exactly so the before/after comparison is fair.',
      checkpoint: 'Every player has a final score and a completion certificate.',
    },
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
            <h1 className="text-3xl font-black leading-tight mb-2">10-Week Shooting Development Program</h1>
            <p className="text-gray-400 text-sm">
              {pkg.org_name} &nbsp;·&nbsp; {pkg.player_count} Players &nbsp;·&nbsp; Coach&apos;s Session Guide
            </p>
          </div>

          {/* Intro */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h2 className="font-black text-lg mb-2">How to use this guide</h2>
            <p className="text-gray-600 text-sm leading-relaxed">
              This is a ready-to-run session plan — one session per week over 10 weeks that builds the
              jump shot from the ground up: grip, base, alignment, load, legs, release, and game speed.
              Each session gives you a <strong>focus</strong>, three <strong>drills</strong>, a
              <strong> coaching cue</strong> to repeat out loud, and a <strong>checkpoint</strong> so you
              know when players are ready to move on. You know your players best, so adapt freely.
            </p>
            <div className="mt-4 rounded-lg bg-orange-50 border border-orange-100 px-4 py-3">
              <p className="text-orange-900 text-sm leading-relaxed">
                <strong>The two required sessions</strong> are the <strong>Session 1 baseline video</strong> and
                the <strong>Session 10 final video</strong>. The AI analyzes and compares them to generate
                each player&apos;s certificate of improvement — so film both the same way, from the side.
              </p>
            </div>
          </div>

          {/* Session cards */}
          <div className="space-y-4">
            {sessions.map((s) => (
              <div
                key={s.n}
                className={`bg-white rounded-xl border p-5 flex gap-5 ${
                  s.required ? 'border-orange-300 ring-1 ring-orange-100' : 'border-gray-200'
                }`}
              >
                <div className="shrink-0 w-12 h-12 rounded-full bg-orange-500 text-white flex items-center justify-center font-black text-lg">
                  {s.n}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-black text-base">Week {s.n} — {s.title}</span>
                    {s.required && (
                      <span className="text-[10px] font-black uppercase tracking-wide bg-orange-500 text-white px-2 py-0.5 rounded-full">
                        Required video
                      </span>
                    )}
                  </div>
                  <p className="text-gray-600 text-sm leading-relaxed">{s.focus}</p>

                  <div className="mt-3">
                    <p className="text-[11px] font-black uppercase tracking-wide text-gray-400 mb-1.5">Drills</p>
                    <ul className="space-y-1">
                      {s.drills.map((d) => (
                        <li key={d} className="flex gap-2 text-sm text-gray-700 leading-relaxed">
                          <span className="text-orange-500 font-black shrink-0">›</span>
                          <span>{d}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                      <p className="text-[11px] font-black uppercase tracking-wide text-gray-400 mb-0.5">Coaching cue</p>
                      <p className="text-sm text-gray-700 leading-snug">“{s.cue}”</p>
                    </div>
                    <div className="rounded-lg bg-green-50 border border-green-100 px-3 py-2">
                      <p className="text-[11px] font-black uppercase tracking-wide text-green-700/70 mb-0.5">Checkpoint</p>
                      <p className="text-sm text-green-900 leading-snug">{s.checkpoint}</p>
                    </div>
                  </div>
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

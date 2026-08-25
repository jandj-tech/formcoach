import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { getOrgSession } from '@/lib/org-auth'
import PrintButton from './PrintButton'

interface Props {
  params: Promise<{ packageId: string }>
}

interface Lesson {
  name: string
  tag: string
  steps: string[]
  cue?: string
}
interface Drill {
  time: string
  name: string
  detail: string
}
interface Week {
  n: number
  title: string
  theme: string
  required?: boolean
  criteria: { num: string; name: string }[]
  whyTogether: string
  lessons: Lesson[]
  drills: Drill[]
  game: { name: string; detail: string; label?: string }
}

// The standardized 60-minute class formula every organization runs each week.
const HOUR = [
  { t: '0–5', label: 'Shooting warm-up' },
  { t: '5–15', label: 'Today’s two lessons / demonstrations' },
  { t: '15–25', label: 'Controlled form drills' },
  { t: '25–40', label: 'Partner / high-repetition shooting' },
  { t: '40–52', label: 'Shooting game / application' },
  { t: '52–58', label: 'Free shooting + individual coach corrections' },
  { t: '58–60', label: 'Review today’s two cues' },
]

const WEEKS: Week[] = [
  {
    n: 1,
    title: 'Building the Shooting Hand',
    theme: 'Set the shooting hand and arm before anything else in the motion.',
    required: true,
    criteria: [
      { num: '1', name: 'Palm non-contact with the ball' },
      { num: '2', name: 'Elbow L-shape — under the ball' },
    ],
    whyTogether:
      'These belong together because we establish the shooting hand and arm first. The ball rides on the fingertips rather than buried in the palm, and the forearm forms a clean 90° underneath the ball.',
    lessons: [
      {
        name: 'The Air Pocket',
        tag: 'Demo',
        steps: [
          'Everyone holds the ball in their shooting hand only.',
          'WRONG: the ball is buried flat against the palm.',
          'RIGHT: the ball rides on the fingers and finger pads, with space through the center of the palm.',
          'Players look underneath the hand — they should not squeeze the ball into the palm.',
          'Reps: set → inspect hand → reset. No basket yet.',
        ],
        cue: 'Fingertips do the work — leave an air pocket under the palm.',
      },
      {
        name: 'Knee to L',
        tag: 'Demo',
        steps: [
          'Players kneel, or place one knee forward.',
          'Rest the ball on the shooting hand at about knee level.',
          'Slowly bring the ball → elbow → forearm up into shooting position, then freeze.',
          'Show the L formed by the upper arm and forearm, and how the elbow sits underneath the ball.',
        ],
        cue: 'Feel the ball rise into position — don’t push it forward from your chest.',
      },
    ],
    drills: [
      { time: '5 min', name: 'Air Pocket Checks', detail: 'Partners inspect each other’s shooting hand.' },
      { time: '8 min', name: 'Knee-to-L Form Shots', detail: 'Very close to the basket. One hand only to start.' },
      { time: '7 min', name: 'Partner Form Shooting', detail: 'Partners ~6–8 ft apart, shooting back and forth with the shooting hand and correct L-shape. (Jr. NBA uses a similar partner drill for technique.)' },
      { time: '15 min', name: 'Close-Rim Form Shooting', detail: '4–6 players per basket — shoot close, rebound, rotate. Coaches correct only these two things; don’t overwhelm players with ten fixes.' },
    ],
    game: { name: 'First to 5', detail: 'Players spread around the baskets. First to make five technically good close-range shots wins. Coaches can cancel a make if a player completely ignores the week’s form.' },
  },
  {
    n: 2,
    title: 'The Guide Hand',
    theme: 'The guide hand steadies the ball, then gets out of the way.',
    criteria: [
      { num: '3', name: 'Guide hand placement' },
      { num: '4', name: 'Shooting through the guide hand / one-hand release' },
    ],
    whyTogether:
      'The guide hand sits on the side of the ball — not on top — and the actual release comes from one hand.',
    lessons: [
      {
        name: 'The Coin',
        tag: 'Demo',
        steps: [
          'Place a coin between the guide-hand thumb and index finger.',
          'Set the ball normally.',
          'If the player flicks or pushes with the guide-hand thumb, the coin falls.',
          'Goal: the guide hand stabilizes the ball, then gets out of the way.',
        ],
        cue: 'The guide hand steadies — it never shoots.',
      },
      {
        name: 'Window',
        tag: 'Demo',
        steps: [
          'Players hold the ball in shooting position.',
          'The shooting hand sends the ball through the space beside the guide hand.',
          'Guide hand: supports → releases → does not push.',
        ],
      },
    ],
    drills: [
      { time: '5 min', name: 'Coin Holds', detail: 'No shooting at first — just hold the coin in place.' },
      { time: '8 min', name: 'Coin Form Shooting', detail: 'Close to the basket, coin held the whole time.' },
      { time: '10 min', name: 'One-Hand → Two-Hand Progression', detail: '5 one-hand form shots, then add the guide hand. Make the two versions feel almost identical.' },
      { time: '12 min', name: 'Partner Shooting', detail: 'Partners shoot and inspect each other’s guide hands.' },
    ],
    game: { name: 'Clean Hand Challenge', detail: 'First to 5 makes — but a basket only counts if the guide hand stays clean.' },
  },
  {
    n: 3,
    title: 'Release & Rotation',
    theme: 'The ball rolls off two fingers with clean backspin.',
    criteria: [
      { num: '5', name: 'Two-finger release' },
      { num: '6', name: 'Ball rotation' },
    ],
    whyTogether:
      'The ball should roll off the index and middle fingers, creating clean backspin — and now players can actually see what their fingers did.',
    lessons: [
      {
        name: 'Finger Finish',
        tag: 'Demo',
        steps: [
          'Hold the ball above the forehead.',
          'Slowly roll it forward and feel the index + middle finger make the last contact.',
          'Mark those two fingers with removable tape if it helps.',
        ],
        cue: 'Index and middle — last two fingers to touch the ball.',
      },
      {
        name: 'Read the Ball',
        tag: 'Demo',
        steps: [
          'Use a ball with a visible seam or line.',
          'Players shoot straight up and watch the line.',
          'Bad rotation looks wobbly or sideways; clean rotation is backward, backward, backward.',
        ],
      },
    ],
    drills: [
      { time: '5 min', name: 'Straight-Up Spin', detail: 'Shoot vertically and catch it. Read the rotation.' },
      { time: '8 min', name: 'Partner Spin', detail: 'Shoot to a partner concentrating entirely on rotation.' },
      { time: '10 min', name: 'Close Form Shooting', detail: 'Watch the ball after every release.' },
      { time: '12 min', name: 'Free Shooting', detail: 'Coaches circulate and correct releases individually.' },
    ],
    game: { name: 'Spin + Swish', detail: 'Compete to 5. A make = 1. A coach-observed clean make with excellent backspin = 2 — so players start caring about how the ball goes in.' },
  },
  {
    n: 4,
    title: 'Arc & Follow-Through',
    theme: 'A 45–60° arc finished with a held gooseneck.',
    criteria: [
      { num: '7', name: 'Shot arc' },
      { num: '8', name: 'Shooting-hand follow-through' },
    ],
    whyTogether:
      'Aim for a 45–60° arc finished with a wrist snap / gooseneck, holding the finish until the ball reaches the rim.',
    lessons: [
      {
        name: 'The Garbage Bin',
        tag: 'Demo',
        steps: [
          'Bring a large garbage bin. First hold it so players look almost horizontally across the opening — ask, “How big does the opening look?”',
          'Then change the angle so they look more directly down into the opening — the usable opening suddenly appears much larger.',
          'The rim never changes size, but entry angle changes how much opening the ball has to fall through: a flat shot has a small effective opening; a higher, appropriate arc has a much larger one.',
        ],
        cue: 'Shoot it up, not out — give the ball a bigger door to fall through.',
      },
      {
        name: 'Hand in the Cookie Jar',
        tag: 'Demo',
        steps: [
          'Shoot, freeze the wrist, fingers pointing down.',
          'Hold the finish until the ball reaches the rim.',
        ],
        cue: 'Reach into the cookie jar — and don’t pull your hand back out.',
      },
    ],
    drills: [
      { time: '5 min', name: 'Arc Visualization', detail: 'Shoot over a coach safely holding a pool noodle as a visual obstacle.' },
      { time: '10 min', name: 'High-Arc Close Shooting', detail: 'Close range, exaggerate the arc.' },
      { time: '10 min', name: 'Hold Your Finish', detail: 'No one drops the shooting hand until the ball reaches the rim.' },
      { time: '10 min', name: 'Partner Arc Shooting', detail: 'Partners shoot back and forth, both watching arc.' },
    ],
    game: { name: 'First to 5', detail: 'Same race — but this time the coach is watching arc and follow-through.' },
  },
  {
    n: 5,
    title: 'Balance & Alignment',
    theme: 'A shoulder-width base, everything pointed at the rim.',
    criteria: [
      { num: '9', name: 'Feet shoulder-width apart' },
      { num: '10', name: 'Square to the basket' },
    ],
    whyTogether:
      'A shoulder-width base with hips, shoulders and feet all aimed toward the rim.',
    lessons: [
      {
        name: 'Train Tracks',
        tag: 'Demo',
        steps: [
          'Lay down two strips of floor tape.',
          'Players stand with feet about shoulder-width — show that too narrow is unstable and too wide makes natural upward power hard.',
          'Gently bump each player’s shoulder in each stance — they immediately feel which base is balanced.',
        ],
      },
      {
        name: 'Headlights',
        tag: 'Demo',
        steps: [
          'Imagine two headlights on your hips and two on your shoulders.',
          'All four should point at the target, not off to the side.',
        ],
        cue: 'Shine all four headlights at the rim.',
      },
    ],
    drills: [
      { time: '5 min', name: 'Jump & Freeze', detail: 'Jump into shooting stance and freeze the landing.' },
      { time: '8 min', name: 'Catch, Check, Shoot', detail: 'Partner passes; player catches, checks the feet, then shoots.' },
      { time: '12 min', name: 'Partner Shooting', detail: 'Partners shoot back and forth, resetting the base each rep.' },
      { time: '10 min', name: 'Around-the-Key Shooting', detail: 'Move around the key, re-squaring the base at each spot.' },
    ],
    game: { name: 'First to 5 from 5 Spots', detail: 'Close or midrange depending on age.' },
  },
  {
    n: 6,
    title: 'Legs & Power',
    theme: 'Shot power comes from the legs, not the arms.',
    criteria: [
      { num: '11', name: 'Knees bent' },
      { num: '12', name: 'Source of shot power' },
    ],
    whyTogether:
      'The knees load the legs, and shot power comes from the legs rather than simply throwing with the arms.',
    lessons: [
      {
        name: 'No Legs',
        tag: 'Demo',
        steps: [
          'Coach deliberately shoots with straight legs — ask, “Where does all the power have to come from?” (the arms).',
          'Then load and shoot naturally — ask players which looked easier.',
        ],
      },
      {
        name: 'Elevator',
        tag: 'Demo',
        steps: [
          'Player starts loaded; as the legs rise, the ball rises.',
          'The whole body works together.',
        ],
        cue: 'Legs power the shot — the arm just guides it.',
      },
    ],
    drills: [
      { time: '5 min', name: 'No-Ball Load & Rise', detail: 'Feel the load and rise with no ball.' },
      { time: '8 min', name: 'Close Shooting', detail: 'Close range, driving up from the legs.' },
      { time: '10 min', name: 'Step-Back Distance Progression', detail: 'Make 3 close, step back, make 3, repeat. If form collapses, move closer — never compensate for distance by throwing with the arms.' },
      { time: '12 min', name: 'Partner Shooting', detail: 'Partners shoot back and forth at a comfortable range.' },
    ],
    game: { name: 'Distance Ladder', detail: 'Teams advance through shooting spots; a bad miss or broken form means you don’t advance.' },
  },
  {
    n: 7,
    title: 'Building One Connected Shot',
    theme: 'One shot, one motion — from a repeatable pocket.',
    criteria: [
      { num: '13', name: 'Connected shot' },
      { num: '14', name: 'Shot pocket — elbow' },
    ],
    whyTogether:
      'A connected shot is legs, core and release working in one motion, while the shot pocket has the ball loaded and the elbow ready to rise.',
    lessons: [
      {
        name: 'Elevator, Not Two Floors',
        tag: 'Demo',
        steps: [
          'Demonstrate bend → STOP → raise ball → STOP → shoot — it looks robotic.',
          'Then load → rise → release as one smooth chain.',
        ],
        cue: 'One shot. One motion.',
      },
      {
        name: 'The Shot Pocket',
        tag: 'Demo',
        steps: [
          'Catch the ball and immediately find the same comfortable loaded position every time.',
          'Don’t catch at the waist one rep, the chest the next, overhead the next — build repeatability.',
        ],
      },
    ],
    drills: [
      { time: '5 min', name: 'Pocket Reps', detail: 'Catch → pocket → freeze.' },
      { time: '10 min', name: 'Catch-to-Shot', detail: 'Catch straight into the pocket and up in one motion.' },
      { time: '10 min', name: 'Rhythm Shooting', detail: 'Continuous makes at a comfortable range, keeping one connected motion.' },
      { time: '10 min', name: 'Two-Ball Shooting', detail: 'Two basketballs with shooters, passers and rebounders so shots arrive continuously and players rack up reps fast. This is where the program shifts from isolated form into faster shooting.' },
    ],
    game: { name: '2-Ball Team Race', detail: 'Two groups/baskets; first group to collectively make 15.' },
  },
  {
    n: 8,
    title: 'Feet & Forward Motion',
    theme: 'Controlled forward energy toward the rim.',
    criteria: [
      { num: '15', name: 'Dominant foot forward' },
      { num: '16', name: 'Forward motion and toes' },
    ],
    whyTogether:
      'The dominant foot is slightly ahead for balance, with the player’s weight moving forward and the toes pointed at the rim.',
    lessons: [
      {
        name: 'Land Where You’re Going',
        tag: 'Demo',
        steps: [
          'Tape the floor where the player starts, then shoot.',
          'The goal isn’t a big leap forward — it’s controlled forward energy.',
          'Falling backward ✗ · jumping dramatically forward ✗ · balanced natural movement ✓.',
        ],
      },
      {
        name: 'Dominant Foot',
        tag: 'Demo',
        steps: [
          'Put the shooting-hand-side foot slightly ahead.',
          'Let players experiment and feel the difference.',
        ],
      },
    ],
    drills: [
      { time: '5 min', name: 'Stance Check', detail: 'Set the dominant foot slightly forward, toes to the rim.' },
      { time: '8 min', name: 'Jump & Stick Landing', detail: 'Shoot and stick a balanced landing every rep.' },
      { time: '10 min', name: 'Catch-and-Shoot', detail: 'Catch on the move into a balanced, forward shot.' },
      { time: '12 min', name: 'Two-Ball Shooting', detail: 'Increase the pace from last week.' },
    ],
    game: { name: 'Around the World / First to 5', detail: 'Technique still matters, but coaches correct less and let players play.' },
  },
  {
    n: 9,
    title: 'Guide-Hand Finish + Game Pressure',
    theme: 'Can your form survive pressure?',
    criteria: [
      { num: '17', name: 'Guide-hand follow-through' },
      { num: '18', name: 'Thumb spread wide' },
    ],
    whyTogether:
      'A wide thumb gives grip and control, and the guide hand peels away rather than pushing through the release. This is also the week we start asking: can your form survive pressure?',
    lessons: [
      {
        name: 'Peel Away',
        tag: 'Demo',
        steps: [
          'Slow-motion shooting: the guide hand touches the side, the ball rises, and at release the guide hand peels away while the shooting hand continues.',
        ],
      },
      {
        name: 'The Wide Thumb',
        tag: 'Demo',
        steps: [
          'Show a narrow, closed hand, then spread the thumb and fingers into a comfortable control position.',
          'Let players compare the control.',
        ],
      },
    ],
    drills: [
      { time: '5 min', name: 'Hand Position', detail: 'Set a wide, comfortable thumb-and-finger spread.' },
      { time: '8 min', name: 'Slow-Motion Release', detail: 'Exaggerate the guide hand peeling away.' },
      { time: '10 min', name: 'Partner Shooting', detail: 'Partners shoot and check the guide-hand finish.' },
      { time: '10 min', name: 'Closeout Shooting', detail: 'Partner passes, shooter catches, partner gives a controlled closeout — start at ~50% defensive speed, then 70%. We’re testing whether the new mechanics survive when players stop thinking about them.' },
      { time: 'Optional', name: 'Fun Contact Shooting', detail: 'Use a pad if available. A light bump before or around the gather — never dangerous contact during an airborne release. Players regain balance and shoot.' },
    ],
    game: { name: 'Beat the Closeout', detail: 'A make = a point; a good contest without fouling = a defensive point.' },
  },
  {
    n: 10,
    title: 'Putting Everything Together',
    theme: 'Test → Compete → Measure → Celebrate.',
    required: true,
    criteria: [{ num: '1–18', name: 'All criteria — integration & final analysis' }],
    whyTogether:
      'No new criteria — all 18 have been introduced. Week 10 is test, compete, measure and celebrate. Each player records their second LearnHoops analysis today: Analysis #1 at the start of the program and Analysis #2 now gives a measurable before/after and the completion certificate.',
    lessons: [
      {
        name: 'Complete Shooting Review',
        tag: 'Warm-up',
        steps: [
          'Rapid-fire coach questions to the whole group:',
          '“Where’s the guide hand?” → on the side, peels away.',
          '“Which two fingers?” → index + middle.',
          '“Where does the power come from?” → the legs.',
          '“What do we do with the follow-through?” → hold it.',
        ],
      },
    ],
    drills: [
      { time: '10 min', name: 'Form Shooting', detail: 'Players individually work on their single biggest remaining issue; the coach moves around — this block is personalized.' },
      { time: '10 min', name: 'Partner Shooting', detail: 'Each player tells their partner “I’m working on ___,” and the partner watches specifically for that criterion.' },
      { time: '10 min', name: 'Two-Ball Shooting', detail: 'Fast-paced, game-speed catches, lots of reps.' },
      { time: '10 min', name: 'Closeout Shooting', detail: 'Catch, defender closes, then shoot or make a one-dribble adjustment.' },
      { time: '10 min', name: 'Championship Shooting Games', detail: 'Run several: First to 5, Around the World, 2-Ball Race, Team Makes Challenge. Players compete without being constantly stopped for instruction.' },
    ],
    game: { label: 'Final 5 min', name: 'The LearnHoops Challenge', detail: '“Can you put all 18 together?” Record each player’s final jump shot for their second LearnHoops analysis — that becomes their final program result.' },
  },
]

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

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .card { break-inside: avoid; }
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
              {pkg.org_name} &nbsp;·&nbsp; {pkg.player_count} Players &nbsp;·&nbsp; Coach’s Session Guide
            </p>
          </div>

          {/* Program overview */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 card">
            <h2 className="font-black text-lg mb-3">Program overview</h2>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
              {[
                { k: 'Length', v: '10 weeks' },
                { k: 'Class', v: '~60 minutes' },
                { k: 'Group', v: '8–16 players' },
                { k: 'Goal', v: 'All 18 criteria' },
              ].map(f => (
                <div key={f.k} className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 text-center">
                  <p className="text-[11px] font-black uppercase tracking-wide text-gray-400">{f.k}</p>
                  <p className="text-sm font-black text-black mt-0.5">{f.v}</p>
                </div>
              ))}
            </div>

            <p className="text-gray-600 text-sm leading-relaxed">
              The objective is to teach all 18 LearnHoops shooting criteria while giving players enough
              repetitions to actually apply them. Group size scales with additional baskets and coaches.
            </p>

            {/* Design principle */}
            <div className="mt-4 rounded-lg bg-black text-white px-4 py-3">
              <p className="text-[11px] font-black uppercase tracking-widest text-orange-400 mb-1">Design principle</p>
              <p className="font-black text-lg tracking-tight">Teach → Feel → Practice → Compete</p>
              <p className="text-gray-300 text-sm leading-relaxed mt-1">
                Players shouldn’t spend 20 minutes listening. Each week’s two concepts are explained through a
                short physical demonstration, immediately followed by a drill that makes the player <em>feel</em> the
                concept.
              </p>
            </div>

            {/* Standardized 60-minute formula */}
            <div className="mt-4">
              <p className="text-[11px] font-black uppercase tracking-wide text-gray-400 mb-2">The standard 60-minute class</p>
              <div className="rounded-lg border border-gray-100 overflow-hidden">
                {HOUR.map((h, i) => (
                  <div
                    key={h.t}
                    className={`flex items-center gap-3 px-3 py-2 text-sm ${i % 2 ? 'bg-gray-50' : 'bg-white'}`}
                  >
                    <span className="shrink-0 w-16 font-black text-orange-600 tabular-nums">{h.t}</span>
                    <span className="text-gray-700">{h.label}</span>
                  </div>
                ))}
              </div>
              <p className="text-gray-500 text-xs leading-relaxed mt-2">
                That last free-shooting block matters — it’s when coaches walk player to player (“Your elbow is good
                now; look at your guide hand”) instead of turning the whole class into identical drills.
              </p>
            </div>

            {/* Required videos */}
            <div className="mt-4 rounded-lg bg-orange-50 border border-orange-100 px-4 py-3">
              <p className="text-orange-900 text-sm leading-relaxed">
                <strong>Two required videos:</strong> the <strong>Week 1 baseline analysis</strong> and the
                <strong> Week 10 final analysis</strong>. The AI compares them to measure each player’s improvement
                and generate their completion certificate — so film both the same way, from the side.
              </p>
            </div>
          </div>

          {/* How to use */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8 card">
            <h2 className="font-black text-lg mb-2">How to use these coach cards</h2>
            <p className="text-gray-600 text-sm leading-relaxed">
              Each week below is a turnkey coach card. Open the week, and you can run the entire hour without planning
              anything: the two LearnHoops criteria, the physical demonstrations, the exact drills and timing, the
              coaching phrases to repeat out loud, and the game. You know your players best, so adapt freely.
            </p>
          </div>

          {/* Weekly coach cards */}
          <div className="space-y-6">
            {WEEKS.map((w) => (
              <div
                key={w.n}
                className={`page-break card bg-white rounded-xl border p-6 ${
                  w.required ? 'border-orange-300 ring-1 ring-orange-100' : 'border-gray-200'
                }`}
              >
                {/* Card header */}
                <div className="flex gap-4 items-start mb-4">
                  <div className="shrink-0 w-14 h-14 rounded-2xl bg-orange-500 text-white flex flex-col items-center justify-center leading-none">
                    <span className="text-[9px] font-bold uppercase tracking-wide opacity-90">Week</span>
                    <span className="font-black text-2xl">{w.n}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-black text-xl leading-tight">{w.title}</h3>
                      {w.required && (
                        <span className="text-[10px] font-black uppercase tracking-wide bg-orange-500 text-white px-2 py-0.5 rounded-full">
                          Required video
                        </span>
                      )}
                    </div>
                    <p className="text-gray-500 text-sm mt-0.5">{w.theme}</p>
                  </div>
                </div>

                {/* Criteria */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {w.criteria.map(c => (
                    <span
                      key={c.num}
                      className="inline-flex items-center gap-1.5 rounded-full bg-gray-900 text-white text-xs font-semibold pl-1.5 pr-3 py-1"
                    >
                      <span className="rounded-full bg-orange-500 text-white text-[10px] font-black px-1.5 py-0.5 tabular-nums">#{c.num}</span>
                      {c.name}
                    </span>
                  ))}
                </div>

                <p className="text-gray-600 text-sm leading-relaxed mb-5">{w.whyTogether}</p>

                {/* Lessons */}
                <div className="mb-5">
                  <p className="text-[11px] font-black uppercase tracking-wide text-gray-400 mb-2">Lessons &amp; demonstrations</p>
                  <div className="space-y-3">
                    {w.lessons.map(l => (
                      <div key={l.name} className="rounded-lg bg-gray-50 border border-gray-100 p-4">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[9px] font-black uppercase tracking-wide bg-gray-900 text-white px-1.5 py-0.5 rounded">{l.tag}</span>
                          <span className="font-black text-sm">“{l.name}”</span>
                        </div>
                        <ol className="space-y-1">
                          {l.steps.map((s, i) => (
                            <li key={i} className="flex gap-2 text-sm text-gray-700 leading-relaxed">
                              <span className="text-orange-500 font-black shrink-0 tabular-nums">{i + 1}.</span>
                              <span>{s}</span>
                            </li>
                          ))}
                        </ol>
                        {l.cue && (
                          <p className="mt-2 text-sm text-orange-800 bg-orange-50 border border-orange-100 rounded px-2.5 py-1.5">
                            <span className="font-black uppercase text-[10px] tracking-wide mr-1">Cue</span>“{l.cue}”
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Drills */}
                <div className="mb-5">
                  <p className="text-[11px] font-black uppercase tracking-wide text-gray-400 mb-2">Drills</p>
                  <div className="rounded-lg border border-gray-100 overflow-hidden">
                    {w.drills.map((d, i) => (
                      <div key={d.name} className={`flex gap-3 px-3 py-2.5 ${i % 2 ? 'bg-gray-50' : 'bg-white'}`}>
                        <span className="shrink-0 w-16 text-xs font-black text-orange-600">{d.time}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-gray-900 leading-snug">{d.name}</p>
                          <p className="text-sm text-gray-600 leading-relaxed">{d.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Game */}
                <div className="rounded-lg bg-green-50 border border-green-100 px-4 py-3">
                  <p className="text-[11px] font-black uppercase tracking-wide text-green-700/70 mb-0.5">
                    {w.game.label || 'Game'}
                  </p>
                  <p className="text-sm text-green-900 leading-relaxed">
                    <span className="font-black">{w.game.name}.</span> {w.game.detail}
                  </p>
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

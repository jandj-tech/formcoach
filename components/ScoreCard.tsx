import Link from 'next/link'
import { humanizeReasoning } from '@/lib/sanitize'
import LearnVideo from './LearnVideo'

const CHANNEL_URL = 'https://www.youtube.com/@LearnHoopsbasketball'

const IMPROVEMENT_TIPS: Record<string, string> = {
  'Feet Shoulder Width Apart':
    'Set your feet shoulder width apart before every shot. Too wide and your knees cannot bend properly, so you lose the leg power that drives the shot — too narrow and you have no balance. Quick way to check yourself: from your stance, bend straight down without moving your feet. If your hands reach your feet, your stance is right. Practice stepping into it 20 times without the ball until it is automatic, then keep checking before each catch. A consistent base is the most efficient platform for power and a connected shot.',
  'Thumb is Spread Wide':
    'Actively spread your thumb as wide as possible away from your fingers every time you grip the ball. In practice, check your thumb position before each shot — it should look like you are trying to palm the ball. Do 50 slow-motion form shots focusing only on thumb spread until it becomes automatic.',
  'Guide Hand Placement':
    'Move your guide hand to the side of the ball, not underneath it. Your guide hand thumb should point straight back toward your face. Try the wall drill: stand 3 feet from a wall and shoot — your guide hand must not touch the wall at release. If it does, it is pushing.',
  'Palm Non-Contact with Ball':
    'Place the ball on your finger pads only and check for visible daylight between your palm and the ball before every shot. Do the palm check drill — place the ball in your hand and slowly lift your palm away. The ball should stay balanced on your fingers alone.',
  'Elbow L-Shape — Under the Ball':
    'Tuck your elbow inward so it points directly down at the ground, not out to the side. Practice loading your shot pocket in front of a mirror and check that your forearm is perfectly vertical and your elbow is directly below the ball, not to the side of it.',
  'Shot Pocket — Elbow':
    'Build a consistent starting position by catching the ball and immediately loading it to the same spot every time before rising. Practice this in slow motion 50 times — catch, load, check position, then rise. Consistency here makes everything else easier.',
  'Square to the Basket':
    'Before every shot consciously check that your toes, hips, and shoulders all point directly at the rim. Use the floor lines on a court as a guide. Step into your stance deliberately before catching the ball rather than adjusting after.',
  'Knees Bent':
    'Exaggerate your knee bend in practice until it feels natural. Think of loading a spring before each shot — sit into it, then explode up. Do form shooting from 3 feet away with an exaggerated squat and focus on feeling the power come from your legs, not your arms.',
  'Dominant Foot Forward':
    'Consciously step your dominant foot slightly forward before every catch in practice until it becomes habit. Do footwork-only drills — no ball — where you practice your step-in and stance 20 times before adding the ball back.',
  'Source of Shot Power':
    'Practice the jumping motion without the ball — stand in your shot stance, load your knees, and jump while driving your arms upward. Feel the power coming from your legs. Then add the ball and focus on letting the leg drive push the ball up rather than using your arm to throw it.',
  'Shooting Through Guide Hand / One Hand Release':
    'Practice one-hand form shots from 3 feet away with your guide hand completely off the ball. Hold the ball with your shooting hand only and shoot. This removes the guide hand habit completely. Do 30 of these before any shooting session until the clean release is automatic.',
  'Two Finger Release':
    'Practice roll-offs: hold the ball in shooting position and slowly roll it off your index and middle fingers while watching the backspin. Do 20 of these before each session. The ball should spin backward cleanly — if it wobbles or spins sideways, adjust which fingers are last to touch it.',
  'Ball Rotation':
    'Focus on your two-finger release. After every shot watch the ball in the air and check the spin. Clean backspin means your index and middle fingers were last to touch it and rolled it forward. Sidespin means the guide hand pushed or the wrong fingers released last.',
  'Forward Motion and Toes':
    'Think "shoot toward the basket" not "shoot straight up." Practice landing slightly in front of your takeoff spot — a few inches of forward drift is correct. Place tape on the floor marking your takeoff and landing spots and practice until you consistently drift slightly forward.',
  'Shooting Hand Follow Through':
    'After every shot hold your follow through — wrist snapped fully down, fingers pointing at the basket — for a full 2 seconds before dropping your hand. This forces you to complete the snap rather than pulling back early. Make it a habit on every single shot in practice.',
  'Guide Hand Follow Through':
    'After the ball leaves your hand, actively freeze your guide hand in place like you are making a stop sign. Practice in slow motion — release the ball and immediately freeze the guide hand for 2 seconds. If your guide hand moves toward the basket after release, it was pushing.',
  'Shot Arc':
    'Practice shooting over a raised obstacle between you and the basket — a raised hand, a cone on a chair, or a held-up broom. This forces you to elevate your arc. A higher arc gives the ball a larger entry angle into the basket and significantly increases your percentage.',
  'Connected Shot':
    'Slow your entire shot down to 25% speed and practice it as one single unbroken motion from knee bend to follow through. There should be no pause or reset between the leg drive and the arm motion. Think of the whole shot as one word, not three separate moves.',
}

export interface CoachNoteView {
  suggestedScore: number | null
  note: string | null
  authorName: string
  teamName: string | null
}

interface ScoreCardProps {
  name: string
  // ALWAYS the AI's score. A coach note never replaces or alters it, and every
  // computation below (colour, bar width, label, improvement tip, tutorial
  // video) stays keyed on this value — that is where "display only" is
  // actually enforced, so it cannot drift later.
  score: number | null
  reasoning: string
  videoId?: string
  coachNotes?: CoachNoteView[]
  // Coach/owner note editor, injected by the caller only when the viewer is
  // authorized. Undefined on every player-facing render.
  editor?: React.ReactNode
  /** Personal notes on this criterion visible to the current viewer. */
  personalNotes?: PersonalNoteView[]
  /** The viewer's own personal-note editor, when they may write one. */
  personalEditor?: React.ReactNode
}

export interface PersonalNoteView {
  id: number
  authorLabel: string
  body: string
  isPublic: boolean
  mine: boolean
}

/**
 * Collapsed panel inside a criterion card. Only the AI's own analysis stays
 * open by default — everything else (drills, coach input, personal notes)
 * folds away so a report with notes on every criterion is still skimmable.
 * Built on <details> so it needs no client JS.
 */
function Fold({
  title,
  tone,
  children,
}: {
  title: string
  tone: 'orange' | 'indigo' | 'gray'
  children: React.ReactNode
}) {
  const styles = {
    orange: 'border-orange-200 bg-orange-50 text-orange-700',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-800',
    gray: 'border-gray-200 bg-white text-gray-600',
  }[tone]
  return (
    <details className={`group mt-2 rounded-lg border ${styles}`}>
      <summary className="flex items-center justify-between gap-2 px-3 py-2 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
        <span className="text-xs font-bold">{title}</span>
        <svg
          className="w-3.5 h-3.5 opacity-60 transition-transform group-open:rotate-180 shrink-0"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </summary>
      <div className="px-3 pb-3">{children}</div>
    </details>
  )
}

/** Read-only personal notes, rendered inside their fold. */
function PersonalNotes({ notes }: { notes: PersonalNoteView[] }) {
  return (
    <div className="space-y-2">
      {notes.map((n) => (
        <div key={n.id} className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
          <p className="text-[11px] font-bold text-gray-500">
            {n.mine ? 'Your note' : n.authorLabel}
            {n.mine && (
              <span className={n.isPublic ? 'text-green-600' : 'text-gray-400'}>
                {n.isPublic ? ' · shown on this report' : ' · private to you'}
              </span>
            )}
          </p>
          <p className="text-xs text-black leading-relaxed mt-1 whitespace-pre-wrap">{n.body}</p>
        </div>
      ))}
    </div>
  )
}

/**
 * Coach's Notes for one criterion, shown directly beneath the AI's score.
 * Deliberately a different colour from every score element on the card so a
 * coach's number can never be mistaken for the grade itself.
 */
function CoachNotes({ notes, aiScore }: { notes: CoachNoteView[]; aiScore: number | null }) {
  // Only disambiguate with the team name when two coaches share a display
  // name — otherwise a public page needn't state a (possibly minor) player's
  // team affiliation at all.
  const seen = new Map<string, number>()
  for (const n of notes) seen.set(n.authorName, (seen.get(n.authorName) ?? 0) + 1)

  // No heading or panel chrome here — the enclosing Fold supplies both.
  return (
    <div className="space-y-2">
      {notes.map((n, i) => (
        <div key={i}>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[11px] text-indigo-900/70">
              AI {aiScore === null ? 'not graded' : aiScore.toFixed(1)}
            </span>
            {n.suggestedScore !== null && (
              <>
                <span className="text-[11px] text-indigo-900/40">·</span>
                <span className="text-sm font-black text-indigo-900">
                  Coach {n.suggestedScore.toFixed(1)}
                  <span className="text-[11px] font-normal">/10</span>
                </span>
              </>
            )}
            <span className="text-[11px] font-semibold text-indigo-700">
              {(seen.get(n.authorName) ?? 0) > 1 && n.teamName
                ? `${n.authorName} · ${n.teamName}`
                : n.authorName}
            </span>
          </div>
          {n.note && (
            <p className="text-xs text-indigo-900 leading-relaxed mt-1">&ldquo;{n.note}&rdquo;</p>
          )}
        </div>
      ))}
      <p className="text-[10px] text-indigo-900/60 leading-snug">
        Your coach&rsquo;s score is their own read of this clip. Your overall score, leaderboard
        spot and progress still come from the AI score.
      </p>
    </div>
  )
}

function scoreColor(score: number) {
  if (score < 2) return 'text-red-700'
  if (score < 4) return 'text-red-600'
  if (score < 5) return 'text-red-500'
  if (score < 6) return 'text-yellow-400'
  if (score < 7) return 'text-yellow-500'
  if (score <= 7) return 'text-yellow-600'
  if (score < 9) return 'text-green-500'
  if (score < 10) return 'text-green-600'
  return 'text-green-700'
}

function barColor(score: number) {
  if (score < 2) return 'bg-red-700'
  if (score < 4) return 'bg-red-600'
  if (score < 5) return 'bg-red-500'
  if (score < 6) return 'bg-yellow-400'
  if (score < 7) return 'bg-yellow-500'
  if (score <= 7) return 'bg-yellow-600'
  if (score < 9) return 'bg-green-500'
  if (score < 10) return 'bg-green-600'
  return 'bg-green-700'
}

function scoreLabel(score: number) {
  if (score >= 9) return 'Excellent'
  if (score > 7) return 'Good'
  if (score >= 6) return 'Okay'
  if (score >= 5) return 'Below Average'
  if (score >= 3) return 'Needs Work'
  return 'Poor'
}

export default function ScoreCard({
  name,
  score,
  reasoning,
  videoId,
  coachNotes,
  editor,
  personalNotes,
  personalEditor,
}: ScoreCardProps) {
  const cleanReasoning = humanizeReasoning(reasoning)
  const improvementTip = score !== null && score < 10 ? IMPROVEMENT_TIPS[name] : undefined
  const showVideo = score !== null && score < 7.5 && !!videoId
  const showChannelLink = score !== null && score < 7.5 && !videoId

  if (score === null) {
    return (
      <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-black font-semibold text-sm">{name}</h3>
          <span className="text-xs font-medium text-black bg-gray-200 px-2 py-0.5 rounded-full">Not graded</span>
        </div>
        <p className="text-black text-xs leading-relaxed italic">{cleanReasoning}</p>
        <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5">
          <p className="text-xs font-bold text-blue-800 mb-1">Why isn&apos;t this graded?</p>
          <p className="text-xs text-blue-900 leading-relaxed">
            This one wasn&apos;t clear enough in your video to judge, so it was left out
            instead of guessed at — a made-up score would pull your overall number and
            your feedback off. It is not counted against you either way.{' '}
            <Link
              href="/support#filming"
              className="font-bold underline underline-offset-2 hover:text-blue-700"
            >
              See how to film for a more accurate analysis →
            </Link>
          </p>
        </div>
        {/* An ungraded criterion is the highest-value place for a coach note —
            they were there and could see what the camera could not. */}
        {coachNotes?.length ? (
          <Fold title={coachNotes.length > 1 ? "Coaches' notes" : "Coach's notes"} tone="indigo">
            <CoachNotes notes={coachNotes} aiScore={null} />
          </Fold>
        ) : null}
        {editor && (
          <Fold title="Your score &amp; note (coach)" tone="indigo">
            {editor}
          </Fold>
        )}
        {personalNotes?.length ? (
          <Fold title={`Notes (${personalNotes.length})`} tone="gray">
            <PersonalNotes notes={personalNotes} />
          </Fold>
        ) : null}
        {personalEditor && (
          <Fold title="Add your own note" tone="gray">
            {personalEditor}
          </Fold>
        )}
      </div>
    )
  }

  const pct = (score / 10) * 100

  return (
    <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-black font-semibold text-sm">{name}</h3>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${scoreColor(score)}`}>{scoreLabel(score)}</span>
          <span className={`text-2xl font-bold ${scoreColor(score)}`}>{score.toFixed(1)}</span>
          <span className="text-black text-sm">/10</span>
        </div>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-1.5 mb-3">
        <div
          className={`h-1.5 rounded-full transition-all duration-700 ${barColor(score)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-black text-xs leading-relaxed">{cleanReasoning}</p>

      {/* Everything below the AI's own read is folded away by default, so a
          criterion stays scannable however many notes it collects. */}
      {improvementTip && (
        <Fold title="How to improve" tone="orange">
          <p className="text-xs text-orange-900 leading-relaxed">{improvementTip}</p>
          {showVideo && <LearnVideo videoId={videoId!} label="Watch how to fix this" />}
          {showChannelLink && (
            <a
              href={CHANNEL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-orange-600 hover:text-red-600 text-xs font-bold transition-colors"
            >
              Learn on the LearnHoops channel →
            </a>
          )}
        </Fold>
      )}
      {coachNotes?.length ? (
        <Fold title={coachNotes.length > 1 ? "Coaches' notes" : "Coach's notes"} tone="indigo">
          <CoachNotes notes={coachNotes} aiScore={score} />
        </Fold>
      ) : null}
      {editor && (
        <Fold title="Your score &amp; note (coach)" tone="indigo">
          {editor}
        </Fold>
      )}
      {personalNotes?.length ? (
        <Fold title={`Notes (${personalNotes.length})`} tone="gray">
          <PersonalNotes notes={personalNotes} />
        </Fold>
      ) : null}
      {personalEditor && (
        <Fold title="Add your own note" tone="gray">
          {personalEditor}
        </Fold>
      )}
    </div>
  )
}

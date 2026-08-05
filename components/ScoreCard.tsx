import { humanizeReasoning } from '@/lib/sanitize'
import LearnVideo from './LearnVideo'

const CHANNEL_URL = 'https://www.youtube.com/@LearnHoopsbasketball'

const IMPROVEMENT_TIPS: Record<string, string> = {
  'Feet Shoulder Width Apart':
    'Before every shot, set your feet approximately shoulder width apart — wide enough to feel planted, narrow enough that your knees can bend freely. Check yourself in a mirror or on the court lines: your feet should sit roughly under your shoulders. Practice stepping into this stance 20 times without the ball until it becomes your automatic base, then keep checking it before each catch. A consistent shoulder-width base gives you the most efficient platform for power and a connected shot.',
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

interface ScoreCardProps {
  name: string
  score: number | null
  reasoning: string
  videoId?: string
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

export default function ScoreCard({ name, score, reasoning, videoId }: ScoreCardProps) {
  const cleanReasoning = humanizeReasoning(reasoning)
  const improvementTip = score !== null && score < 10 ? IMPROVEMENT_TIPS[name] : undefined
  const showVideo = score !== null && score < 7.5 && !!videoId
  const showChannelLink = score !== null && score < 7.5 && !videoId

  if (score === null) {
    return (
      <div className="bg-gray-50 rounded-xl p-5 border border-gray-200 opacity-75">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-black font-semibold text-sm">{name}</h3>
          <span className="text-xs font-medium text-black bg-gray-200 px-2 py-0.5 rounded-full">Not visible</span>
        </div>
        <p className="text-black text-xs leading-relaxed italic">{cleanReasoning}</p>
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
      {improvementTip && (
        <div className="mt-3 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2.5">
          <p className="text-xs font-bold text-orange-700 mb-1">How to improve</p>
          <p className="text-xs text-orange-900 leading-relaxed">{improvementTip}</p>
        </div>
      )}
      {showVideo && <LearnVideo videoId={videoId!} label="Watch how to fix this" />}
      {showChannelLink && (
        <a
          href={CHANNEL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-orange-500 hover:text-red-600 text-xs font-bold transition-colors"
        >
          Learn on the LearnHoops channel →
        </a>
      )}
    </div>
  )
}

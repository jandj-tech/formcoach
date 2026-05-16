// Pricing constants for the org class program — no DB imports, safe to import from client components.

export const CLASS_MIN_PLAYERS = 10
export const CLASS_PRICE_PER_PLAYER_CENTS = 5000   // $50
export const CLASS_BULK_THRESHOLD = 30
export const CLASS_BULK_PRICE_PER_PLAYER_CENTS = 4500  // $45

export const CLASS_ANALYSES_PER_PLAYER = 2
export const CLASS_IMPROVEMENT_THRESHOLD = 0.03    // 3% minimum for first-time class takers

export const CLASS_CURRICULUM = [
  { session: 1,  title: 'Initial Shot Analysis',      description: 'Upload your first video and get a baseline score for your shooting form.' },
  { session: 2,  title: 'Grip & Hand Placement',      description: 'Focus on thumb spread, guide hand position, and keeping the palm off the ball.' },
  { session: 3,  title: 'Elbow Alignment',            description: 'Practice the L-shape under the ball and keeping the elbow in.' },
  { session: 4,  title: 'Stance & Base',              description: 'Work on dominant foot forward, knee bend, and being square to the basket.' },
  { session: 5,  title: 'Shot Pocket',                description: 'Develop a consistent, repeatable release point every time you shoot.' },
  { session: 6,  title: 'Release Mechanics',          description: 'Two-finger release, backspin, and full shooting hand follow-through.' },
  { session: 7,  title: 'Shot Arc',                   description: 'Train your eyes and muscle memory to achieve a 45–60° launch angle.' },
  { session: 8,  title: 'Guide Hand Discipline',      description: 'Keep the guide hand completely passive — no influence on the ball at release.' },
  { session: 9,  title: 'Full Shot Flow',             description: 'Connect every element into one fluid, connected motion from legs to fingertips.' },
  { session: 10, title: 'Final Evaluation',           description: 'Upload your final video, see how far you have come, and earn your certificate.' },
]

export function classPriceCents(playerCount: number): number {
  const pricePerPlayer = playerCount >= CLASS_BULK_THRESHOLD
    ? CLASS_BULK_PRICE_PER_PLAYER_CENTS
    : CLASS_PRICE_PER_PLAYER_CENTS
  return playerCount * pricePerPlayer
}

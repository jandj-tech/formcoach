/**
 * The 10-Week Shooting Development Program — coach curriculum.
 *
 * This is the program owner's own session plan, written out as a ready-to-run
 * curriculum: each week is a one-page coach sheet with today's two skills, the
 * exact 60-minute timeline, the phrases to say out loud, the mistakes to look
 * for, and the finishing game.
 *
 * Content is the owner's — treat edits as content changes, not refactors.
 * Rendered by app/org/curriculum/[packageId]/page.tsx (print-friendly, one
 * page per week).
 */

export type BlockKind = 'warmup' | 'lesson' | 'drill' | 'game' | 'review'

export interface Block {
  /** Exact clock range, e.g. "0:00–5:00". */
  time: string
  kind: BlockKind
  title: string
  /** What the coach actually does, step by step. */
  body: string[]
  /** Word-for-word phrases to say out loud. */
  say?: string[]
  /** Optional rules / scoring for a game block. */
  scoring?: string
}

export interface Week {
  n: number
  title: string
  /** The two LearnHoops criteria this week installs. */
  skills: { num: string; name: string }[]
  goal: string
  /** Named in the overview table as the week's signature teaching moment. */
  signature: string
  mainGame: string
  /** Week 1 and Week 10 carry the two required analysis videos. */
  required?: boolean
  blocks: Block[]
  mistakes: { wrong: string; fix: string }[]
  /** Swap-ins so a different coach — or a different age — can run it their way. */
  variations: string[]
  ageNotes: { band: string; note: string }[]
  /** What elite shooting teachers do with this same idea. */
  proNote?: { who: string; text: string }
}

/** Read these before Week 1. They matter more than any individual drill. */
export const COACHING_RULES = [
  { rule: 'Don’t overcoach.', detail: 'Prioritize that week’s two skills. Everything else can wait for the week it’s taught.' },
  { rule: 'Keep players shooting.', detail: 'A shooting program cannot turn into 30 minutes of standing and listening.' },
  { rule: 'Demonstrations should be short.', detail: 'Usually 2–5 minutes. Show it, then get them moving.' },
  { rule: 'Use simple language.', detail: '“Find your L” works better than a long biomechanics explanation.' },
  { rule: 'Move players closer if form breaks down.', detail: 'Distance is earned through technique, never the other way around.' },
  { rule: 'Correct one thing at a time.', detail: 'A player given five corrections hears none of them.' },
  { rule: 'Keep competitions fun.', detail: 'Players should want to come back the following week.' },
  { rule: 'Use 4–6 shooters per basket whenever possible.', detail: 'More than that and the reps disappear into a line.' },
  { rule: 'Don’t obsess over makes during early weeks.', detail: 'A missed shot with improving mechanics is worth more than an ugly make.' },
  { rule: 'Gradually increase pressure.', detail: 'Weeks 1–6 technique · Weeks 7–8 speed · Weeks 9–10 defenders, pressure and competition.' },
]

/** The shape of every session, before the week-specific timeline. */
export const HOUR = [
  { t: '0–5', label: 'Shooting warm-up', note: 'Close-range shooting. Coach watches, barely corrects.' },
  { t: '5–15', label: 'Today’s two lessons', note: 'Two short demonstrations. Show it, don’t lecture it.' },
  { t: '15–25', label: 'Controlled form drills', note: 'Slow, close to the rim, technique over makes.' },
  { t: '25–45', label: 'Partner / high-repetition shooting', note: 'Volume block. Everyone shooting almost constantly.' },
  { t: '45–55', label: 'Shooting game', note: 'Compete. Let the week’s concept survive real pressure.' },
  { t: '55–60', label: 'Free shooting + review', note: 'Individual corrections, then say the two cues back.' },
]

/** Everything the ten weeks ever ask for. */
export const EQUIPMENT = [
  { item: 'One ball per player', detail: 'Correct size for the age group — a too-heavy ball ruins form faster than any bad habit.' },
  { item: 'Floor tape or spots', detail: 'Train Tracks stance markers, landing spots, shooting spots for games.' },
  { item: 'A handful of coins', detail: 'Week 2 guide-hand challenge. Poker chips or bottle caps work too.' },
  { item: 'A large garbage bin', detail: 'Week 4 arc demonstration. Nothing sells arc like this one.' },
  { item: 'A pool noodle', detail: 'Safe arc obstacle for Week 4. A broom held high works in a pinch.' },
  { item: 'A blocking pad', detail: 'Optional, Week 9 only. Light contact before or during the gather — never on an airborne shooter.' },
  { item: 'A phone or tablet on a tripod', detail: 'Week 1 and Week 10 analysis videos. Side-on, waist height, whole body in frame.' },
  { item: 'Printed coach sheets', detail: 'This guide. Each week prints on its own page.' },
]

/** The two videos that generate each player's certificate. */
export const FILMING = [
  'Film from the SIDE of the shooting hand — not from the front, not from behind.',
  'Camera at about waist height, roughly 10–15 feet away, held steady (a tripod, a chair, or a teammate).',
  'The whole body must be in frame from feet to fingertips at the top of the shot, plus the ball leaving the hand.',
  'One clean jump shot per video. A catch-and-shoot from a comfortable range is ideal — no layups, no heaves.',
  'Same spot, same angle, same distance in Week 10 as in Week 1. The comparison is only fair if the film is.',
  'Good light, no backlight. Shooting straight into a window turns the player into a silhouette the AI can’t read.',
]

/** How to run the same plan for very different rooms. */
export const AGE_ADAPTATIONS = [
  {
    band: 'Ages 7–10',
    range: 'Shoot from 3–8 ft',
    notes: [
      'Use a size 5 ball and lower the rim if you can. Never let a heavy ball create a heave.',
      'One coaching cue per player per session — no more.',
      'Games every week, kept short. Attention resets about every 6 minutes.',
      'Two-hand shots are fine early; the goal at this age is a clean release, not a jump shot.',
      'Skip the Week 9 contact block entirely. Closeouts at walking speed only.',
    ],
  },
  {
    band: 'Ages 11–13',
    range: 'Shoot from 6–12 ft',
    notes: [
      'The sweet spot for this program — habits are still formable and strength is arriving.',
      'Run the Week 6 distance ladder honestly; this is the age where range gets chased too early.',
      'Start the partner checks. Players coaching each other locks the criteria in faster than you can.',
    ],
  },
  {
    band: 'Ages 14+',
    range: 'Shoot from 12 ft to the arc',
    notes: [
      'Run the two-ball and closeout blocks at real game speed.',
      'Expect resistance to changing a release — frame every fix as “more makes under pressure,” never “your shot is wrong.”',
      'Week 9 closeouts can go to 70–80% for experienced groups; contact stays controlled and pre-release.',
    ],
  },
]

/** What elite shooting teachers do — used to sharpen the weekly cues. */
export const PRO_NOTES = [
  {
    who: 'Herb Magee — the “Shot Doctor”',
    what: 'Four points of emphasis: shooting hand, guide hand, legs, target.',
    text: 'Magee taught thousands of shooters — including NBA players — by breaking the shot into exactly four things and refusing to work on a fifth. His other rule is diagnostic: the coach and the player both have to be able to say WHY a shot missed before anything gets changed. That is the spirit of this program — two criteria a week, and a miss the player can explain.',
    use: 'Weeks 1–2 are his shooting hand and guide hand. Week 6 is his legs. The “target” point is why Week 4 asks players to watch the ball enter the rim, not just whether it went in.',
  },
  {
    who: 'Klay Thompson — the catch-and-shoot model',
    what: 'Shoulder-width base, hands pre-set on the catch, one quick dip, guide hand fully off.',
    text: 'Thompson shoots off a consistent shoulder-width stance, catches with his hands already in shooting position so nothing is wasted, dips once as a quick bounce rather than a pause, sets at about 90° with the ball near forehead height, and takes his guide hand completely off the ball before the wrist snap. His footwork changes with direction — inside foot planted moving one way, outside foot the other — but the upper body never does.',
    use: 'Week 5 is his base. Week 7 is his catch preparation and single dip. Week 8 is his footwork. Week 9 is his guide hand coming clean off.',
  },
]

export const WEEKS: Week[] = [
  {
    n: 1,
    title: 'Shooting Hand + Elbow',
    required: true,
    skills: [
      { num: '1', name: 'Palm non-contact with the ball' },
      { num: '2', name: 'Elbow L-shape — under the ball' },
    ],
    goal: 'Players learn how the ball should sit on the shooting hand and how to get the elbow underneath the basketball.',
    signature: 'Air Pocket / Knee-to-L',
    mainGame: 'First to 5',
    blocks: [
      {
        time: '0:00–5:00', kind: 'warmup', title: 'Shooting warm-up',
        body: [
          'Players shoot casually from close range.',
          'Coach watches without giving many corrections.',
          'Keep players within comfortable shooting distance.',
          'If this is the program’s first session, film each player’s baseline analysis video during or right after this block, before you fix anything.',
        ],
        say: ['“Today we’re going to build the foundation of your shooting arm.”'],
      },
      {
        time: '5:00–10:00', kind: 'lesson', title: 'Lesson #1 — The Air Pocket',
        body: [
          'Everyone holds a basketball in one shooting hand.',
          'WRONG: the ball buried flat against the entire palm.',
          'BETTER: the ball controlled primarily through the fingers and finger pads, with space through the middle of the hand.',
          'Players: hold ball → check hand → remove hand → reset → repeat.',
          'Partner check — one player holds the ball while the partner looks at hand placement, then switch.',
        ],
        say: ['“Control the ball with your fingers. Don’t squeeze it into your palm.”'],
      },
      {
        time: '10:00–15:00', kind: 'lesson', title: 'Lesson #2 — Knee-to-L',
        body: [
          'Players kneel on one knee, or place one knee forward.',
          'Put the basketball on the shooting hand near knee level.',
          'Slowly raise: ball → elbow → shooting position. Freeze.',
          'Coach demonstrates the L created by the shooting arm.',
          'The elbow should get underneath the ball rather than sticking dramatically outside.',
        ],
        say: ['“Bring the ball up.”', '“Elbow underneath.”', '“Lift it — don’t push it forward.”', '“Find your L.”'],
      },
      {
        time: '15:00–25:00', kind: 'drill', title: 'Knee-to-L form shooting',
        body: [
          'Players roughly 3–5 feet from the basket.',
          'Start with the shooting hand only.',
          'Sequence: set → L → shoot → hold finish.',
          'Players rebound their own shot and rotate.',
          'Do not worry about makes yet. Coach walks around looking only at hand placement and elbow position.',
        ],
      },
      {
        time: '25:00–35:00', kind: 'drill', title: 'Partner form shooting',
        body: [
          'Players pair up roughly 6–8 feet apart.',
          'Shoot the ball back and forth; the partner catches and immediately shoots it back.',
          'Focus: ball on fingers → elbow underneath → smooth release.',
          'After several minutes, move partners slightly farther apart.',
        ],
      },
      {
        time: '35:00–47:00', kind: 'drill', title: 'Close-rim shooting',
        body: [
          '4–6 players per basket, shooting from several close locations.',
          'After shooting: rebound → pass to the next player → rotate.',
          'Coach moves around correcting today’s two points and nothing else.',
        ],
      },
      {
        time: '47:00–55:00', kind: 'game', title: 'Game — First to 5',
        body: [
          'Players compete at each basket. First player to make five shots wins.',
          'For Week 1, shots should still be close.',
          'Optional rule: if the shot goes in but the player clearly throws it from the chest or the elbow is dramatically out, the coach can wave it off. Keep this fun, not punitive.',
        ],
        say: ['“Make doesn’t count — show me the L.”'],
        scoring: 'First to 5 makes. Coach can wave off a make that ignores today’s two points.',
      },
      {
        time: '55:00–60:00', kind: 'review', title: 'Free shooting + review',
        body: [
          'Players shoot freely while the coach gives individual corrections.',
          'End with the two questions: “Where should your elbow be?” (Under the ball.) “Where should the ball sit?” (On the fingers and finger pads.)',
        ],
      },
    ],
    mistakes: [
      { wrong: 'Ball resting flat in the palm.', fix: 'Hold the ball out at arm’s length, one hand. A palmed ball falls; a fingertip ball doesn’t.' },
      { wrong: 'Elbow flared out like a chicken wing.', fix: 'Set up an arm’s length from a wall so a flared elbow physically bumps it.' },
      { wrong: 'Player pushes the ball out from the chest.', fix: 'Back to Knee-to-L. The ball rises up the body; it doesn’t travel forward first.' },
    ],
    variations: [
      'Wall L-Holds — set the ball at the top of the shot an arm’s length from a wall, elbow pointing at the floor. Hold 5 seconds × 10.',
      'One-Hand Carry — walk ten steps holding the ball one-handed on the fingertips. Instant proof of the air pocket.',
      'Coach Says — coach calls “air pocket!”, “L!”, “freeze!”; wrong position sits a round. Best game for ages 7–10.',
      'Beat the Coach — the group has to out-make the coach shooting one-handed from close range.',
    ],
    ageNotes: [
      { band: '7–10', note: 'Stay at 3–4 feet all session. Two-hand form shots are fine; the air pocket is the only real objective.' },
      { band: '11–13', note: 'Full one-hand progression. Add the wall holds if elbows are flaring.' },
      { band: '14+', note: 'Expect resistance from players with an existing release. Frame it as a set-point audit, not a rebuild.' },
    ],
    proNote: {
      who: 'Herb Magee',
      text: 'Magee’s first of four points of emphasis is the shooting hand — he starts every shooter there, before the guide hand, before the legs. This week is that, exactly.',
    },
  },

  {
    n: 2,
    title: 'Guide Hand',
    skills: [
      { num: '3', name: 'Guide hand placement' },
      { num: '4', name: 'Shooting through the guide hand / one-hand release' },
    ],
    goal: 'Players understand that the guide hand helps control the basketball but should not push the shot.',
    signature: 'Coin Challenge',
    mainGame: 'Clean Hand First to 5',
    blocks: [
      {
        time: '0:00–5:00', kind: 'warmup', title: 'Review shooting',
        body: [
          'Close-range shooting.',
          'Do not reteach Week 1 — one reminder is enough.',
        ],
        say: ['“Fingers and elbow.”'],
      },
      {
        time: '5:00–10:00', kind: 'lesson', title: 'Lesson #1 — Where does the guide hand go?',
        body: [
          'Demonstrate guide hand on top of the ball ✗.',
          'Demonstrate guide hand behind the ball pushing forward ✗.',
          'Demonstrate guide hand comfortably on the side ✓.',
          'Everyone gets into shooting position and freezes; coach walks around adjusting hands.',
        ],
        say: ['“Shooting hand gives the power. Guide hand gives control.”'],
      },
      {
        time: '10:00–15:00', kind: 'lesson', title: 'Lesson #2 — Coin Challenge',
        body: [
          'Use a coin, small flat token, or similar safe object.',
          'Place it gently between the guide-hand thumb and index-finger area as the player holds the ball.',
          'The purpose is awareness of unnecessary thumb pressure.',
          'Start with stationary repetitions before actually shooting.',
          'If the guide-hand thumb aggressively pushes or flicks, the object moves or drops.',
        ],
        say: ['“Guide it. Don’t push it.”'],
      },
      {
        time: '15:00–25:00', kind: 'drill', title: 'One-hand shooting',
        body: [
          'Players close to the basket.',
          '5 shots using the shooting hand only, then add the guide hand.',
          'Try to make the release feel almost identical either way.',
          'Sequence: 5 one-hand → 5 normal → repeat.',
        ],
      },
      {
        time: '25:00–35:00', kind: 'drill', title: 'Partner guide-hand shooting',
        body: [
          'Pairs. Partner passes; shooter catches, sets the guide hand, shoots.',
          'The partner’s only job is to watch the guide hand.',
          'Switch every 5 shots.',
        ],
      },
      {
        time: '35:00–45:00', kind: 'drill', title: 'Spot shooting',
        body: [
          '4–6 players per basket, using 3 nearby shooting spots.',
          'Players make 2 from Spot 1, 2 from Spot 2, 2 from Spot 3, then rotate.',
        ],
      },
      {
        time: '45:00–55:00', kind: 'game', title: 'Game — Clean Hand First to 5',
        body: [
          'First player to 5 makes wins. Coach watches the guide hand.',
          'A clean make counts. If a player clearly uses both hands to push the basketball, call it and let them shoot again.',
        ],
        say: ['“Guide-hand push — try again.”'],
        scoring: 'First to 5 clean makes. Two-hand pushes don’t count.',
      },
      {
        time: '55:00–60:00', kind: 'review', title: 'Free shooting + review',
        body: [
          'Ask: “What does your guide hand do?” (Helps control the ball.)',
          'Ask: “What shouldn’t it do?” (Push the shot.)',
        ],
      },
    ],
    mistakes: [
      { wrong: 'Thumb flicks at the release.', fix: 'The coin. Nothing convinces a player like a coin hitting the floor.' },
      { wrong: 'Guide hand slides on top of the ball.', fix: 'Reset it every catch — “side of the clock, 9 o’clock for a righty.”' },
      { wrong: 'Two-hand push shot.', fix: 'Move closer to the rim and stay on one-hand reps until one hand is enough.' },
    ],
    variations: [
      'Coin Survivor — everyone shoots holding a coin; last player still holding theirs after 10 shots wins.',
      'Guide-Hand Off — lift the guide hand away one second before release. Looks strange, works immediately.',
      'Left/Right Miss Audit — every miss gets called “left”, “right”, “short” or “long”. Left/right misses are almost always the guide hand.',
    ],
    ageNotes: [
      { band: '7–10', note: 'Skip the coin if it becomes a toy. “Side of the ball, quiet thumb” and a partner check is enough.' },
      { band: '11–13', note: 'Run the full coin progression — this is the age where the thumb-flick habit sets permanently.' },
      { band: '14+', note: 'Use the miss audit. Older players believe data about their own misses faster than they believe a coach.' },
    ],
    proNote: {
      who: 'Herb Magee',
      text: 'Magee calls the guide hand the most neglected part of the shot — his position is that a bad shooter is usually a shooter misusing the guide hand. Fixing it is a named part of his method, not an afterthought.',
    },
  },

  {
    n: 3,
    title: 'Release + Ball Rotation',
    skills: [
      { num: '5', name: 'Two-finger release' },
      { num: '6', name: 'Ball rotation' },
    ],
    goal: 'The basketball should finish through the index and middle fingers, producing controlled backspin.',
    signature: 'Read the Ball',
    mainGame: 'Spin & Score',
    blocks: [
      {
        time: '0:00–5:00', kind: 'warmup', title: 'Warm-up',
        body: [
          'Players shoot naturally.',
          'Coach asks everyone to watch the basketball after they release it — that’s the whole warm-up instruction.',
        ],
      },
      {
        time: '5:00–10:00', kind: 'lesson', title: 'Lesson #1 — Two-finger finish',
        body: [
          'Hold the ball above shooting position.',
          'Slowly roll it out of the shooting hand.',
          'Show the last contact coming through the index and middle fingers.',
          'Players exaggerate this slowly, without shooting.',
        ],
        say: ['“Finish through these two.”'],
      },
      {
        time: '10:00–15:00', kind: 'lesson', title: 'Lesson #2 — Read the Ball',
        body: [
          'Use the visible seams.',
          'Players toss the basketball vertically upward using shooting mechanics and watch the seams.',
          'Show the difference between clean backward rotation and sideways or wobbly rotation.',
          'Teach the diagnosis out loud: side spin usually means the guide hand or the pinky got involved; wobble usually means the ball left the palm instead of the fingers.',
        ],
        say: ['“Clean fingers create clean spin.”'],
      },
      {
        time: '15:00–23:00', kind: 'drill', title: 'Straight-up spin drill',
        body: [
          'Players shoot the ball vertically about 3–5 feet above themselves, then catch it.',
          'Repeat. Goal: consistent backward spin.',
        ],
      },
      {
        time: '23:00–33:00', kind: 'drill', title: 'Partner rotation drill',
        body: [
          'Pairs roughly 8 feet apart. Shoot to the partner; the partner watches the spin and calls it.',
          'Switch after 5 reps.',
        ],
      },
      {
        time: '33:00–45:00', kind: 'drill', title: 'Basket form shooting',
        body: [
          'Close to the basket. Players now combine fingers, elbow, guide hand, two-finger release and rotation.',
          'Coach still emphasizes only today’s focus.',
        ],
      },
      {
        time: '45:00–55:00', kind: 'game', title: 'Game — Spin & Score',
        body: [
          'First to 7 points.',
          'A regular make is 1 point. A clean make with obvious controlled backspin is 2 points. Coach makes the final call.',
        ],
        scoring: 'Make = 1 · clean-rotation make = 2 · first to 7.',
      },
      {
        time: '55:00–60:00', kind: 'review', title: 'Free shooting',
        body: [
          'Let players experiment and watch their rotation.',
          'Final question: “What two fingers do we want finishing the shot?” (Index and middle.)',
        ],
      },
    ],
    mistakes: [
      { wrong: 'Side spin.', fix: 'Usually the guide hand — go back to the coin — or the ball rolling off the ring finger.' },
      { wrong: 'No spin / knuckleball.', fix: 'No wrist snap. Close-range form shots with an exaggerated finish.' },
      { wrong: 'Ball wobbles.', fix: 'It’s leaving the palm. Week 1’s air pocket again.' },
    ],
    variations: [
      'Lying-Down Release — on their back, shoot straight up and catch. Removes legs and arc entirely; pure release.',
      'Swish Only — from close range, only a clean swish counts. Rim-and-in doesn’t.',
      'Call Your Spin — the catcher calls “back”, “sideways” or “wobble” before returning the ball.',
      'Rotation Knockout — standard Knockout, but a make with visible side spin counts as a miss.',
    ],
    ageNotes: [
      { band: '7–10', note: 'Straight-up-and-catch is the whole lesson. Don’t chase perfect backspin at this age or strength.' },
      { band: '11–13', note: 'Use taped index and middle fingers for a session if the release is scattered.' },
      { band: '14+', note: 'Rotation is the fastest self-diagnosis a player will ever own. Make them read every shot for a week.' },
    ],
  },

  {
    n: 4,
    title: 'Arc + Follow-Through',
    skills: [
      { num: '7', name: 'Shot arc' },
      { num: '8', name: 'Shooting-hand follow-through' },
    ],
    goal: 'Players understand entry angle and finish every shot with a held gooseneck. This should be one of the most memorable lessons of the program.',
    signature: 'Garbage Bin',
    mainGame: 'First to 5 / Swish Bonus',
    blocks: [
      {
        time: '0:00–5:00', kind: 'warmup', title: 'Warm-up',
        body: ['Shoot close.'],
        say: ['“Watch how the ball enters the basket today.”'],
      },
      {
        time: '5:00–12:00', kind: 'lesson', title: 'Lesson #1 — Garbage Bin demonstration',
        body: [
          'Bring a large garbage bin or similarly large open container.',
          'Position it so players see the opening from a very low, flat angle. Ask: “Does that opening look big or small?”',
          'Then change the viewing angle so they can see more of the opening.',
          'The physical opening hasn’t changed — but the entry angle changes how much usable opening the ball sees.',
          'Relate it to the rim: a very flat shot has a less forgiving entry; an appropriate higher arc has a better one.',
          'Do not encourage players to throw the ball excessively high.',
        ],
        say: ['“Give the ball a window to go through.”'],
      },
      {
        time: '12:00–16:00', kind: 'lesson', title: 'Lesson #2 — Gooseneck',
        body: [
          'Demonstrate the wrist finish: arm extended, wrist relaxed down, fingers toward the rim.',
        ],
        say: ['“Reach up. Snap down. Hold it.”'],
      },
      {
        time: '16:00–25:00', kind: 'drill', title: 'Hold-the-finish shooting',
        body: [
          'Players close to the basket.',
          'Shoot, then freeze the follow-through until the basketball reaches the rim.',
          'If the hand drops immediately, repeat the rep.',
        ],
      },
      {
        time: '25:00–35:00', kind: 'drill', title: 'Arc Challenge',
        body: [
          'A coach safely holds a pool noodle above and in front of the shooter as a visual obstacle.',
          'The player shoots over it. Move the obstacle based on age and ability.',
          'The purpose is visualizing arc — not making players shoot extremely high.',
        ],
      },
      {
        time: '35:00–45:00', kind: 'drill', title: 'Partner shooting',
        body: [
          'Players shoot from a comfortable distance.',
          'Partner watches arc and wrist, and calls “flat”, “good” or “too high”. Switch every 5.',
        ],
      },
      {
        time: '45:00–55:00', kind: 'game', title: 'Game — First to 5 makes',
        body: [
          'First to five makes.',
          'Optional bonus: a swish is 2, a regular make is 1. This makes players care about clean entry.',
        ],
        scoring: 'Make = 1 · swish = 2 · first to 5 (or 7 with the bonus).',
      },
      {
        time: '55:00–60:00', kind: 'review', title: 'Review',
        body: [
          'Ask: “Why don’t we want every shot completely flat?”',
          'Everyone demonstrates the follow-through without a ball.',
        ],
      },
    ],
    mistakes: [
      { wrong: 'Flat line-drive shot.', fix: 'Move them two feet closer and use the noodle. A flat shot is usually a strength problem being solved by throwing.' },
      { wrong: 'Hand snaps back immediately.', fix: 'Make the held finish part of the make — drop the hand early, the make doesn’t count.' },
      { wrong: 'Moon ball.', fix: 'Rare but real. Give a ceiling: peak just above the top of the backboard.' },
    ],
    variations: [
      'Over the Square — from the block, the ball must pass above the top of the backboard square before dropping in.',
      'Swish Ladder — two swishes moves you back a step; a flat make sends you back to the start.',
      'Over the Noodle — a partner holds the noodle; clearing it = 1, going under = −1.',
    ],
    ageNotes: [
      { band: '7–10', note: 'The garbage bin demo lands hardest at this age. Keep the shooting distance short so arc is achievable.' },
      { band: '11–13', note: 'Raise the noodle gradually across the session rather than setting it high from the start.' },
      { band: '14+', note: 'Pair arc work with range honesty — flat shots almost always show up at the edge of a player’s real range.' },
    ],
    proNote: {
      who: 'Herb Magee',
      text: 'Magee’s fourth point of emphasis is the target: however good the form, aiming at the wrong spot won’t produce a swish. That’s why this week asks players to watch the ball enter the rim, not just whether it dropped.',
    },
  },

  {
    n: 5,
    title: 'Base + Alignment',
    skills: [
      { num: '9', name: 'Feet shoulder-width apart' },
      { num: '10', name: 'Square to the basket' },
    ],
    goal: 'A repeatable shoulder-width base with the body aimed at the target.',
    signature: 'Train Tracks / Headlights',
    mainGame: 'Around the Key',
    blocks: [
      {
        time: '0:00–5:00', kind: 'warmup', title: 'Warm-up',
        body: ['Players shoot. Coach watches feet and says nothing yet.'],
      },
      {
        time: '5:00–10:00', kind: 'lesson', title: 'Lesson #1 — Train Tracks',
        body: [
          'Use two tape lines.',
          'Demonstrate feet together ✗, feet extremely wide ✗, comfortable shoulder-width base ✓.',
          'Players stand in each stance.',
          'Give a very light shoulder tap in each so they feel the balance difference.',
        ],
        say: ['“Strong base.”'],
      },
      {
        time: '10:00–15:00', kind: 'lesson', title: 'Lesson #2 — Headlights',
        body: [
          'Imagine headlights on the hips and on the shoulders.',
          'Ask: “Where should your headlights point?” (Toward the target.)',
          'Keep the explanation this simple, especially for younger players.',
        ],
      },
      {
        time: '15:00–23:00', kind: 'drill', title: 'Jump & Freeze',
        body: [
          'No basketball at first. Players jump lightly into shooting stance and freeze.',
          'Coach checks balance, feet width, orientation.',
          'Add the basketball afterward.',
        ],
      },
      {
        time: '23:00–35:00', kind: 'drill', title: 'Catch, Check, Shoot',
        body: [
          'Partner passes; the player catches and freezes for about one second.',
          'Check: feet → body → basket. Then shoot.',
          'Later in the block, remove the pause.',
        ],
      },
      {
        time: '35:00–45:00', kind: 'drill', title: 'Five-spot shooting',
        body: [
          'Five locations, 2 shots at each.',
          'The focus is a repeatable stance, not the makes.',
        ],
      },
      {
        time: '45:00–55:00', kind: 'game', title: 'Game — First Around the Key',
        body: [
          'Each player must make at several spots around the key.',
          'First player or team to complete the route wins.',
        ],
        scoring: 'Make to advance. Coach can send a crooked base back one spot.',
      },
      {
        time: '55:00–60:00', kind: 'review', title: 'Free shooting',
        body: ['Coach checks each player’s stance individually.'],
      },
    ],
    mistakes: [
      { wrong: 'Feet far too wide.', fix: 'Train Tracks tape. Wide feels stable but kills the leg drive coming in Week 6.' },
      { wrong: 'Shoulders open to the sideline on wing shots.', fix: 'Headlights. Turn the whole body to the rim first, set the feet last.' },
      { wrong: 'Drifting sideways on the landing.', fix: 'Jump & Freeze with a landing mark. Land where you started.' },
    ],
    variations: [
      'Eyes-Closed Base — set the stance with eyes closed, then look. Most players are surprised how far off they are.',
      'Freeze Frame — hold every landing for a 2-count; any wobble and the make doesn’t count.',
      'Corner Emphasis — spend the extra reps in the corners, where alignment falls apart first.',
    ],
    ageNotes: [
      { band: '7–10', note: 'Leave the tape down all session so they can keep re-finding the base.' },
      { band: '11–13', note: 'Add the light shoulder tap — feeling the difference beats being told it.' },
      { band: '14+', note: 'Check the base on the move, not just standing still. That’s where it actually breaks.' },
    ],
    proNote: {
      who: 'Klay Thompson',
      text: 'Thompson shoots off a shoulder-width stance almost without exception — catch or dribble, wing or corner. The consistency of the base is what lets everything above it stay the same.',
    },
  },

  {
    n: 6,
    title: 'Legs + Power',
    skills: [
      { num: '11', name: 'Knees bent' },
      { num: '12', name: 'Source of shot power' },
    ],
    goal: 'Players learn that shot power comes from the legs, which makes shooting easier rather than harder.',
    signature: 'No-Legs / Elevator',
    mainGame: 'Distance Ladder',
    blocks: [
      {
        time: '0:00–5:00', kind: 'warmup', title: 'Warm-up',
        body: ['Normal shooting.'],
        say: ['“Today we’re going to make shooting easier.”'],
      },
      {
        time: '5:00–10:00', kind: 'lesson', title: 'Lesson #1 — No-Legs experiment',
        body: [
          'Coach intentionally shoots with stiff legs. Ask: “Where did all my power have to come from?” (Arms.)',
          'Then demonstrate a natural knee load and upward movement.',
          'Let a few players try both from the same spot — they feel it instantly.',
        ],
        say: ['“Legs start the shot.”'],
      },
      {
        time: '10:00–15:00', kind: 'lesson', title: 'Lesson #2 — Elevator',
        body: [
          'Without a basketball: bend slightly, rise, extend.',
          'Then repeat with the basketball.',
        ],
        say: ['“Your body and the ball ride the elevator together.”'],
      },
      {
        time: '15:00–23:00', kind: 'drill', title: 'Load & Rise',
        body: [
          'No basket required at first: load → rise → shooting motion.',
          'Then shoot close range.',
        ],
      },
      {
        time: '23:00–35:00', kind: 'drill', title: 'Distance Ladder',
        body: [
          'Start close. Make 3, take one step back. Make 3, step back again.',
          'If a player starts throwing the ball with the arms or the form changes dramatically, move them closer.',
          'This is the most important block of the program — give it the full time.',
        ],
        say: ['“Don’t sacrifice form just to shoot farther.”'],
      },
      {
        time: '35:00–45:00', kind: 'drill', title: 'Partner power shooting',
        body: [
          'Pairs: catch → load legs → shoot.',
          'Coach watches whether the player is generating power smoothly rather than in two separate movements.',
        ],
      },
      {
        time: '45:00–55:00', kind: 'game', title: 'Game — Shooting Ladder',
        body: [
          'Teams advance through 4–5 spots. Each make moves the team to the next location.',
          'First team finished wins.',
        ],
        scoring: 'Make with legs = advance. An arm-throw make holds you where you are.',
      },
      {
        time: '55:00–60:00', kind: 'review', title: 'Review',
        body: ['Ask: “Where does your shot start?” (Legs.)'],
      },
    ],
    mistakes: [
      { wrong: 'Shooting from a standstill with straight legs.', fix: 'Chair shooting, then standing. The contrast does the teaching.' },
      { wrong: 'Squatting far too deep.', fix: 'Slow and tiring. “Sit into a bar stool, not a couch.”' },
      { wrong: 'Heaving from beyond their range.', fix: 'Move them in — every week if you have to. Range arrives with strength, not with practising a broken shot.' },
    ],
    variations: [
      'Chair Shooting — seated close-range shooting. With no legs available, players discover exactly what the arms can and can’t do.',
      'Beat the Clock — 20 team makes in 3 minutes from mid-range; forces a repeatable leg-driven motion at speed.',
      'Silent Legs — no talking; the coach only says “legs” when someone throws it.',
    ],
    ageNotes: [
      { band: '7–10', note: 'The ladder may only be two rungs. That’s fine — honesty about range matters more than distance.' },
      { band: '11–13', note: 'This is the week that decides whether they shoot properly at 14. Do not rush the ladder.' },
      { band: '14+', note: 'Extend the ladder to the arc, but hold the same rule: form breaks, step back in.' },
    ],
    proNote: {
      who: 'Herb Magee',
      text: 'Legs are Magee’s third point of emphasis, and he treats footwork as equal in importance to the shot itself — not as a warm-up detail.',
    },
  },

  {
    n: 7,
    title: 'Shot Pocket + Connected Shot',
    skills: [
      { num: '13', name: 'Connected shot' },
      { num: '14', name: 'Shot pocket — elbow' },
    ],
    goal: 'The mechanics get quicker and more natural — one repeatable pocket, one motion.',
    signature: 'One Motion',
    mainGame: 'Two-Ball Race',
    blocks: [
      { time: '0:00–5:00', kind: 'warmup', title: 'Warm-up', body: ['Normal shooting.'] },
      {
        time: '5:00–10:00', kind: 'lesson', title: 'Lesson #1 — Find Your Pocket',
        body: [
          'Player catches the ball and freezes; show the consistent loaded position.',
          'Coach demonstrates inconsistency: catch at the waist, catch at the chest, catch above the head.',
          'Then demonstrate one repeatable pocket.',
        ],
        say: ['“Same pocket every time.”'],
      },
      {
        time: '10:00–15:00', kind: 'lesson', title: 'Lesson #2 — One Motion',
        body: [
          'Demonstrate deliberately robotic shooting: bend — STOP — raise ball — STOP — shoot.',
          'Then demonstrate the smooth version: load → rise → release.',
        ],
        say: ['“One shot. One motion.”'],
      },
      {
        time: '15:00–23:00', kind: 'drill', title: 'Pocket repetitions',
        body: [
          'Partner passes. Player: catch → pocket → freeze. No shot. 10 reps.',
          'Then begin shooting.',
        ],
      },
      {
        time: '23:00–35:00', kind: 'drill', title: 'Rhythm catch-and-shoot',
        body: [
          'Partner passes; shooter catches and immediately flows into the shot.',
          'No unnecessary pause. A steady count out loud keeps every shot the same length.',
        ],
      },
      {
        time: '35:00–47:00', kind: 'drill', title: 'Two-ball shooting',
        body: [
          'Introduce two-ball shooting. Per basket: 1 shooter, 1 passer, 1 rebounder.',
          'Two basketballs stay moving — shooter shoots Ball 1, the rebounder retrieves it, the passer already delivers Ball 2.',
          'The shooter gets repeated shots without long waiting periods.',
          'Rotate roles every 60–90 seconds. This becomes an important recurring drill for the rest of the program.',
        ],
      },
      {
        time: '47:00–55:00', kind: 'game', title: 'Game — Two-Ball Team Race',
        body: [
          'Divide players into teams. First team to 15 makes wins.',
          'Keep the balls moving continuously.',
        ],
        scoring: 'Team total to 15. Everyone shoots; nobody stands still.',
      },
      {
        time: '55:00–60:00', kind: 'review', title: 'Review',
        body: ['Ask: “What should happen after the catch?” (Find the pocket and flow into the shot.)'],
      },
    ],
    mistakes: [
      { wrong: 'A pause at the top — “two floors”.', fix: 'Rhythm shooting on a coach’s count; speed up slightly until the pause has nowhere to live.' },
      { wrong: 'Dipping the ball differently every catch.', fix: 'Pocket reps with no shot. Ten in a row until it’s automatic.' },
      { wrong: 'Re-gripping after the catch.', fix: 'Practice the catch itself — hands already in shooting position before the ball arrives.' },
    ],
    variations: [
      'Rhythm Chain — the group must make 10 in a row, alternating shooters; one miss resets to zero.',
      'Golden Child — one designated shooter per round scores double, but a broken-rhythm shot costs the team a point.',
      '1-2-Shoot — catch on a 1-2 step into the pocket. Adds game footwork without losing the connected motion.',
    ],
    ageNotes: [
      { band: '7–10', note: 'Two-ball with three players is plenty. Slow the passes down; the point is rhythm, not chaos.' },
      { band: '11–13', note: 'Run the full two-ball rotation. This is usually the session players enjoy most.' },
      { band: '14+', note: 'Push the pace until the pocket starts to break, then hold it just under that speed.' },
    ],
    proNote: {
      who: 'Klay Thompson',
      text: 'Thompson catches with his hands already in shooting position, then dips once as a quick bounce and rises — no pause, nothing wasted. That pre-set catch is exactly what the pocket reps are training.',
    },
  },

  {
    n: 8,
    title: 'Foot Position + Forward Energy',
    skills: [
      { num: '15', name: 'Dominant foot forward' },
      { num: '16', name: 'Forward motion and toes' },
    ],
    goal: 'Controlled forward energy toward the rim, off a comfortable stagger.',
    signature: 'Land Where You’re Going',
    mainGame: 'Around the World',
    blocks: [
      { time: '0:00–5:00', kind: 'warmup', title: 'Warm-up', body: ['Normal shooting.'] },
      {
        time: '5:00–10:00', kind: 'lesson', title: 'Lesson #1 — Shooting foot',
        body: [
          'Players identify their shooting-hand side. That foot can sit slightly ahead naturally.',
          'Do not force an exaggerated stagger.',
        ],
        say: ['“Shooting foot slightly ahead. Stay comfortable.”'],
      },
      {
        time: '10:00–15:00', kind: 'lesson', title: 'Lesson #2 — Land Where You’re Going',
        body: [
          'Place tape at the player’s starting feet. Shoot. Look at the landing.',
          'Falling backward ✗ · jumping dramatically toward the rim ✗ · controlled natural forward energy ✓.',
        ],
        say: ['“Up and slightly forward.”'],
      },
      {
        time: '15:00–25:00', kind: 'drill', title: 'Jump & Stick',
        body: [
          'Shoot, land, hold the landing for two seconds.',
          'Coach looks for balance, not distance.',
        ],
      },
      {
        time: '25:00–35:00', kind: 'drill', title: 'Catch-and-shoot footwork',
        body: [
          'Partner passes from different directions.',
          'Shooter organizes the feet before the release.',
        ],
      },
      {
        time: '35:00–47:00', kind: 'drill', title: 'Two-ball shooting',
        body: [
          'Increase the pace from Week 7.',
          'Players should now be able to catch → set feet → shoot.',
        ],
      },
      {
        time: '47:00–55:00', kind: 'game', title: 'Game — Around the World',
        body: [
          'Traditional spot progression. Make = advance, miss = next player.',
          'Adjust the rules based on group size.',
        ],
        scoring: 'First all the way around wins.',
      },
      {
        time: '55:00–60:00', kind: 'review', title: 'Individual shooting',
        body: ['Coach checks foot positioning and landing player by player.'],
      },
    ],
    mistakes: [
      { wrong: 'Fading away.', fix: 'Tape the landing spot and move them closer. Fading is almost always a range problem in disguise.' },
      { wrong: 'Leaping forward into the shot.', fix: 'Controlled energy, not a long jump. Land 6–12 inches ahead, no more.' },
      { wrong: 'Toes turned out to the sideline.', fix: 'Back to Week 5 Headlights — the feet are the fourth headlight.' },
    ],
    variations: [
      'Sniper — taped landing squares at each spot. Make and land in the square = 2; make only = 1.',
      'Fade Detector — a cone (or a coach) two feet behind the shooter; bumping it means they faded.',
      'Knockout — classic elimination from the free-throw line. Fast, loud, and a real test of seven weeks of work.',
    ],
    ageNotes: [
      { band: '7–10', note: 'Skip the stagger talk if it confuses them. “Land in front of the tape, on balance” is the whole lesson.' },
      { band: '11–13', note: 'Add directional catches — the feet break down first when the pass comes from the side.' },
      { band: '14+', note: 'Work both directions: inside foot planted moving one way, outside foot the other.' },
    ],
    proNote: {
      who: 'Klay Thompson',
      text: 'Thompson plants his inside foot moving one direction and his outside foot moving the other, so the shot gets the same forward energy either way. The feet adapt; the upper body never changes.',
    },
  },

  {
    n: 9,
    title: 'Guide-Hand Finish + Pressure',
    skills: [
      { num: '17', name: 'Guide-hand follow-through' },
      { num: '18', name: 'Thumb spread wide' },
    ],
    goal: 'The mechanics start surviving game-like pressure.',
    signature: 'Peel Away',
    mainGame: 'Beat the Closeout',
    blocks: [
      { time: '0:00–5:00', kind: 'warmup', title: 'Warm-up', body: ['Players shoot normally.'] },
      {
        time: '5:00–10:00', kind: 'lesson', title: 'Lesson #1 — Spread the hand',
        body: [
          'Show a cramped hand position, then a comfortable spread of fingers and thumb around the basketball.',
          'Players hold and inspect their own hand.',
        ],
        say: ['“Strong, relaxed grip.”'],
      },
      {
        time: '10:00–15:00', kind: 'lesson', title: 'Lesson #2 — Peel Away',
        body: [
          'Slow-motion shooting demonstration.',
          'The guide hand begins on the side; at release it naturally separates while the shooting hand continues toward the rim.',
        ],
        say: ['“Guide, then get out of the way.”'],
      },
      {
        time: '15:00–25:00', kind: 'drill', title: 'Slow-motion release shooting',
        body: [
          'Players shoot very close, focusing entirely on the hands.',
          'Then gradually increase speed.',
        ],
      },
      {
        time: '25:00–35:00', kind: 'drill', title: 'Partner shooting',
        body: ['Partner watches the guide-hand finish. 5 shots, then switch.'],
      },
      {
        time: '35:00–45:00', kind: 'drill', title: 'Closeout shooting',
        body: [
          'Introduce a defender. Passer passes; defender begins several feet away and closes out at about 50% speed.',
          'Shooter catches and shoots. After several reps, increase to about 70%.',
          'No blocking shots initially — the objective is getting accustomed to someone approaching.',
        ],
      },
      {
        time: '45:00–52:00', kind: 'drill', title: 'Fun contact / bump shooting',
        body: [
          'Use a basketball pad if available.',
          'Coach gives controlled light contact during the gather or before the upward shooting motion.',
          'Do not make contact with players while they are airborne.',
          'Focus: regain balance → shoot. This should be fun.',
        ],
      },
      {
        time: '52:00–57:00', kind: 'game', title: 'Game — Beat the Closeout',
        body: [
          'Offense: a make is 1 point.',
          'Defense: a good legal contest that causes a miss is 1 point.',
          'First player or team to 5.',
        ],
        scoring: 'Make = 1 offense · clean contested miss = 1 defense · first to 5.',
      },
      {
        time: '57:00–60:00', kind: 'review', title: 'Review',
        body: [],
        say: ['“Good form is easy when you’re alone. Great shooters keep it when the game speeds up.”'],
      },
    ],
    mistakes: [
      { wrong: 'Everything falls apart on the closeout.', fix: 'Drop back to 50%. Pressure is a load you add gradually, like weight.' },
      { wrong: 'Rushing the shot when a defender comes.', fix: 'Same tempo, earlier start. Practice catching ready, not catching then getting ready.' },
      { wrong: 'Guide hand grabs at the ball on the finish.', fix: 'Slow-motion release, then bring the Week 2 coin back as a reminder.' },
    ],
    variations: [
      'Tired Legs Shooting — five sprints or ten jumps, then immediately shoot three. Fatigue exposes which habits are real.',
      'Pressure Knockout — Knockout where the player behind you closes out on your shot.',
      'Contest-Only Rounds — defenders may contest but not run at full speed; useful for nervous or younger groups.',
    ],
    ageNotes: [
      { band: '7–10', note: 'Skip the contact block. Closeouts at a jog, hands up, no contest at the release.' },
      { band: '11–13', note: '50% closeouts all session; only go to 70% if the form is clearly holding.' },
      { band: '14+', note: 'Full closeout progression plus the pad. This is the week that carries into real games.' },
    ],
    proNote: {
      who: 'Klay Thompson',
      text: 'Thompson takes the guide hand completely off the ball before the wrist snap — it’s widely considered the most fundamentally clean off-hand in the league. That total separation is the standard this week points at.',
    },
  },

  {
    n: 10,
    title: 'Put It All Together',
    required: true,
    skills: [{ num: '1–18', name: 'All 18 LearnHoops criteria' }],
    goal: 'No major new technique. Review → practice → pressure → compete → measure.',
    signature: 'Full review',
    mainGame: 'Championship Games',
    blocks: [
      {
        time: '0:00–7:00', kind: 'warmup', title: 'Rapid shooting review',
        body: [
          'Coach asks quick questions; keep it energetic.',
          '“Where does the elbow go?” → Under the ball.',
          '“What does the guide hand do?” → Guides, not pushes.',
          '“Which fingers finish the release?” → Index and middle.',
          '“Where does power come from?” → Legs.',
          '“What happens to the shooting wrist?” → Snap and hold.',
          '“What happens to the guide hand?” → Peels away.',
          '“How should we land?” → Balanced.',
        ],
      },
      {
        time: '7:00–17:00', kind: 'drill', title: 'Personalized form shooting',
        body: [
          'Players shoot close. The coach gives each player one individual focus.',
          '“You’re working on elbow.” · “You’re working on guide hand.” · “You’re working on arc.” · “You’re working on balance.”',
          'Do not give five corrections simultaneously.',
        ],
      },
      {
        time: '17:00–27:00', kind: 'drill', title: 'Partner coaching',
        body: [
          'Pairs. The player tells their partner “I’m working on ______.”',
          'The shooter takes 5 shots; the partner watches specifically for that one thing. Then switch.',
          'This reinforces understanding because players now have to recognize shooting mechanics themselves.',
        ],
      },
      {
        time: '27:00–37:00', kind: 'drill', title: 'Two-ball shooting',
        body: [
          'Fast-paced. Rotate shooter → rebounder → passer.',
          'Challenge players to keep nine weeks of mechanics while the repetition speed increases.',
        ],
      },
      {
        time: '37:00–45:00', kind: 'drill', title: 'Closeout shooting',
        body: [
          'Defender closes at realistic but controlled speed. Catch-and-shoot.',
          'Progression: no defender → light closeout → competitive closeout.',
        ],
      },
      {
        time: '45:00–55:00', kind: 'game', title: 'Championship shooting games',
        body: [
          'Run 2–3 quick competitions — make this the most energetic part of the entire program.',
          'First to 5 — 4–6 players per basket.',
          'Two-Ball Race — first team to 15 makes.',
          'Around the World — players progress around the spots.',
          'Team Shooting Challenge — first team to collectively make 25.',
        ],
        scoring: 'Whatever keeps it loud. Nobody gets stopped for instruction during this block.',
      },
      {
        time: '55:00–60:00', kind: 'review', title: 'Final shot + program finish',
        body: [
          'Each player takes several comfortable shots.',
          'Record the shot needed for the player’s final LearnHoops analysis — same spot, same angle, same distance as Week 1.',
          'Compare the beginning analysis with the final one afterward, and hand out completion certificates.',
        ],
        say: ['“Ten weeks ago we started by learning where your hand and elbow go. Now you’re putting all 18 parts of your shooting form together.”'],
      },
    ],
    mistakes: [
      { wrong: 'Filming from a different angle than Week 1.', fix: 'Check the baseline video first and match it exactly, or the before/after isn’t a fair comparison.' },
      { wrong: 'Coaching hard during the final film.', fix: 'Don’t. You want their real shot, not one they held their breath through.' },
      { wrong: 'Skipping the celebration.', fix: 'Read out the improvements and hand the certificates out in front of the group. This is the part they remember.' },
    ],
    variations: [
      'Team Makes Challenge — set the target from what the group could do in Week 1 so the improvement is visible.',
      'Championship Knockout — one last elimination bracket; the winner picks next season’s first drill.',
      'Parent Showcase — run the championship block with families watching. Turns the last session into an event.',
    ],
    ageNotes: [
      { band: '7–10', note: 'Weight the session toward the games. Two questions in the review, not seven.' },
      { band: '11–13', note: 'Partner coaching is the highest-value block here — they teach it back, so they own it.' },
      { band: '14+', note: 'Run the closeouts competitively before filming, then let them settle before the final shot.' },
    ],
  },
]

/** The whole program on one line per week. */
export const PROGRAM_OVERVIEW = WEEKS.map(w => ({
  week: w.n,
  focus: w.skills.map(s => s.name).join(' + '),
  signature: w.signature,
  game: w.mainGame,
}))

/** Full rules for every game in the program — the coach's back pocket. */
export const GAMES_LIBRARY = [
  {
    name: 'First to 5',
    players: 'Any',
    setup: 'Players spread around the baskets at close range.',
    rules: 'Shoot, rebound your own ball, shoot again. First to five technically good makes wins. The coach can wave off a make that ignores the week’s two skills.',
    why: 'The default game. Works at every age, needs nothing, and makes technique the currency instead of luck.',
  },
  {
    name: 'Clean Hand First to 5',
    players: 'Pairs or small groups',
    setup: 'Partners referee each other.',
    rules: 'First to five makes — but only makes with a quiet guide hand count. The partner has to name what they saw.',
    why: 'Players police each other harder than a coach can, and refereeing teaches the criterion twice.',
  },
  {
    name: 'Spin & Score',
    players: 'Any',
    setup: 'Close range, coach watching rotation.',
    rules: 'A make is 1 point. A clean make with obvious controlled backspin is 2. First to 7.',
    why: 'Makes players care about how the ball goes in, which is the whole point of Week 3.',
  },
  {
    name: 'Around the Key',
    players: '2–6 per basket',
    setup: 'Five taped spots around the key.',
    rules: 'Make a spot, move to the next. First player or team to complete the route wins.',
    why: 'Forces players to re-square the base at every angle — Week 5 under mild pressure.',
  },
  {
    name: 'Distance / Shooting Ladder',
    players: 'Any',
    setup: 'Four to five taped spots from close range outward.',
    rules: 'Make with correct form to advance a rung. A miss, or a make thrown with the arms, keeps you where you are.',
    why: 'Teaches that range is earned by the legs, and shows every player their real range honestly.',
  },
  {
    name: 'Two-Ball Team Race',
    players: '6–12',
    setup: 'Two teams, two balls per basket, designated passers and rebounders.',
    rules: 'Continuous shooting — shoot, follow, pass, rotate. First team to 15 collective makes.',
    why: 'The highest-rep game in the program. Volume without losing rhythm.',
  },
  {
    name: 'Around the World',
    players: '2–6 per basket',
    setup: 'Five to seven spots.',
    rules: 'Make to advance, miss and it’s the next player’s turn. First all the way around wins.',
    why: 'Familiar, self-running, and it exposes footwork at every angle.',
  },
  {
    name: 'Beat the Closeout',
    players: '3 per group, rotating',
    setup: 'A passer, a shooter and a closeout defender at 50–70% speed.',
    rules: 'Make = 1 for the offense. A clean legal contest that causes a miss = 1 for the defense. First to 5.',
    why: 'The pressure test. If the form holds here, it holds in a game.',
  },
  {
    name: 'Knockout',
    players: '5+',
    setup: 'Single line at the free-throw line or closer, two balls.',
    rules: 'Shoot; if the player behind you makes theirs first, you’re out. Rebound your own miss and shoot until it drops.',
    why: 'Pure pressure and a lot of noise. Best used in Weeks 8–10, once form can survive it.',
  },
  {
    name: 'Team Shooting Challenge',
    players: 'Whole group',
    setup: 'Everyone shooting at once, coach on a stopwatch.',
    rules: 'The group has a set time to reach a target number of makes. Everyone shoots and everyone rebounds.',
    why: 'Turns the class into one team, and shows ten weeks of improvement in a single number.',
  },
  {
    name: 'Sniper',
    players: 'Any',
    setup: 'Taped landing squares at each shooting spot.',
    rules: 'Make the shot and land inside the square = 2. Make only = 1. Land outside = 0, even on a make.',
    why: 'The cleanest way to kill a fade-away habit without ever saying “stop fading”.',
  },
  {
    name: 'Coach Says',
    players: 'Ages 7–10',
    setup: 'Group in a semicircle, balls in hand.',
    rules: 'Coach calls positions — “air pocket!”, “L!”, “freeze!”, “cookie jar!”. Wrong position sits a round.',
    why: 'Teaches the vocabulary of the whole program to players too young for long explanations.',
  },
]

/** All 18 criteria in order, with the week that installs each one. */
export const CRITERIA_INDEX = WEEKS.flatMap(w =>
  w.skills.map(s => ({ num: s.num, name: s.name, week: w.n, weekTitle: w.title })),
)

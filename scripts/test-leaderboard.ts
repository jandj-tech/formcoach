/**
 * Tests for the leaderboard's Team filter and sort ordering.
 *
 * Run: npx tsx scripts/test-leaderboard.ts
 *
 * The org board merges every team's players into one list, so the thing that
 * can quietly go wrong is a rank: a player showing 4th on their own team's
 * board and 4th again on the org board, because the rank was computed over the
 * wrong slice. Every assertion here is a number a coach or org admin reads off
 * the screen and would be wrong about.
 */

import {
  buildView,
  leaderboardRowKey,
  leaderboardTeamNames,
  type LeaderboardRow,
} from '../components/LeaderboardTable'

let passed = 0
let failed = 0

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    passed++
  } else {
    failed++
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function eq(name: string, actual: unknown, expected: unknown) {
  check(name, actual === expected, `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`)
}

function deepEq(name: string, actual: unknown, expected: unknown) {
  check(
    name,
    JSON.stringify(actual) === JSON.stringify(expected),
    `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`,
  )
}

function row(
  id: string,
  first: string,
  best: number,
  team?: string,
  avg: number | null = best - 1,
): LeaderboardRow {
  return {
    id,
    first_name: first,
    last_name_initial: 'X',
    kind: 'member',
    best_score: best,
    avg_score: avg,
    upload_count: 3,
    team_name: team,
  }
}

const ALL = ''

// Two teams, deliberately interleaved by score so a rank computed over the
// wrong slice produces a visibly different number.
const org = [
  row('a', 'Ava', 9.1, 'Ravens'),
  row('b', 'Ben', 7.4, 'Ravens'),
  row('c', 'Cam', 8.6, 'Wolves'),
  row('d', 'Dee', 6.2, 'Wolves'),
]
const names = (rows: LeaderboardRow[]) => rows.map((r) => r.first_name)

// ── Which teams offer a filter ────────────────────────────────────────────
deepEq('lists both teams, alphabetically', leaderboardTeamNames(org, true), ['Ravens', 'Wolves'])
deepEq(
  'a single-team board offers just the one',
  leaderboardTeamNames(org.filter((r) => r.team_name === 'Ravens'), true),
  ['Ravens'],
)
deepEq('a coach/player board never offers teams', leaderboardTeamNames(org, false), [])
deepEq(
  'rows with no team are not offered as a team',
  leaderboardTeamNames([row('x', 'Xan', 5)], true),
  [],
)

// ── All teams: ranked across the whole organization ───────────────────────
const all = buildView(org, { team: ALL, sort: 'score-desc', showTeam: true })
deepEq('all teams shows every player', names(all.rows), ['Ava', 'Cam', 'Ben', 'Dee'])
eq('org rank 1 is the best score anywhere', all.rankByKey['a::Ravens'], 1)
eq('org rank 2 is the other team’s best', all.rankByKey['c::Wolves'], 2)
eq('org rank 3', all.rankByKey['b::Ravens'], 3)
eq('org rank 4', all.rankByKey['d::Wolves'], 4)

// ── Filtered to one team: re-ranked 1..n inside it ────────────────────────
const wolves = buildView(org, { team: 'Wolves', sort: 'score-desc', showTeam: true })
deepEq('filtering to Wolves drops the other team', names(wolves.rows), ['Cam', 'Dee'])
eq('the filtered team’s best is rank 1, not its org rank of 2', wolves.rankByKey['c::Wolves'], 1)
eq('and the next is rank 2, not 4', wolves.rankByKey['d::Wolves'], 2)
check('nobody from the other team is ranked', wolves.rankByKey['a::Ravens'] === undefined)

const ravens = buildView(org, { team: 'Ravens', sort: 'score-desc', showTeam: true })
deepEq('filtering to Ravens keeps only Ravens', names(ravens.rows), ['Ava', 'Ben'])
eq('Ravens rank 1', ravens.rankByKey['a::Ravens'], 1)
eq('Ravens rank 2', ravens.rankByKey['b::Ravens'], 2)

// A stale team selection resolves back to All in the component before it gets
// here; what's asserted is only that an exact-match filter is exact.
deepEq(
  'a team with no rows yields no rows',
  names(buildView(org, { team: 'Hawks', sort: 'score-desc', showTeam: true }).rows),
  [],
)

// ── Rank is independent of the sort order ─────────────────────────────────
for (const sort of ['name', 'score-asc', 'avg-desc', 'team'] as const) {
  const view = buildView(org, { team: ALL, sort, showTeam: true })
  eq(`rank survives sort=${sort} (top)`, view.rankByKey['a::Ravens'], 1)
  eq(`rank survives sort=${sort} (bottom)`, view.rankByKey['d::Wolves'], 4)
  eq(`sort=${sort} keeps every row`, view.rows.length, 4)
}

// ── Sort orders ───────────────────────────────────────────────────────────
deepEq(
  'Team (A–Z) groups by team, best first inside each',
  names(buildView(org, { team: ALL, sort: 'team', showTeam: true }).rows),
  ['Ava', 'Ben', 'Cam', 'Dee'],
)
deepEq(
  'Highest score',
  names(buildView(org, { team: ALL, sort: 'score-desc', showTeam: true }).rows),
  ['Ava', 'Cam', 'Ben', 'Dee'],
)
deepEq(
  'Lowest score',
  names(buildView(org, { team: ALL, sort: 'score-asc', showTeam: true }).rows),
  ['Dee', 'Ben', 'Cam', 'Ava'],
)
deepEq(
  'Name (A–Z)',
  names(buildView(org, { team: ALL, sort: 'name', showTeam: true }).rows),
  ['Ava', 'Ben', 'Cam', 'Dee'],
)
deepEq(
  'Highest average',
  names(buildView(org, { team: ALL, sort: 'avg-desc', showTeam: true }).rows),
  ['Ava', 'Cam', 'Ben', 'Dee'],
)
// A row with no average sorts last rather than ahead of a real 6.2.
deepEq(
  'a missing average sorts last',
  names(
    buildView([row('a', 'Ava', 9.1, 'Ravens', null), row('d', 'Dee', 6.2, 'Wolves')], {
      team: ALL,
      sort: 'avg-desc',
      showTeam: true,
    }).rows,
  ),
  ['Dee', 'Ava'],
)

// ── Sorting must not mutate the caller's array ────────────────────────────
const original = [...org]
buildView(org, { team: ALL, sort: 'score-asc', showTeam: true })
deepEq('buildView leaves `entries` untouched', names(org), names(original))

// ── Scores arriving as strings (numeric columns come back as text) ────────
const asText = [
  { ...row('a', 'Ava', 0, 'Ravens'), best_score: '9.1' },
  { ...row('d', 'Dee', 0, 'Wolves'), best_score: '10.0' },
]
deepEq(
  'string scores compare numerically, not lexically',
  names(buildView(asText, { team: ALL, sort: 'score-desc', showTeam: true }).rows),
  ['Dee', 'Ava'],
)

// ── Row keys ──────────────────────────────────────────────────────────────
eq('org keys carry the team', leaderboardRowKey(org[0], true), 'a::Ravens')
eq('team-board keys are the bare id', leaderboardRowKey(org[0], false), 'a')
// The same player on two teams must occupy two distinct rows, not collapse.
const twoTeams = [row('a', 'Ava', 9.1, 'Ravens'), row('a', 'Ava', 8.0, 'Wolves')]
const both = buildView(twoTeams, { team: ALL, sort: 'score-desc', showTeam: true })
eq('a player on two teams is ranked twice', Object.keys(both.rankByKey).length, 2)
eq('their Ravens row ranks 1', both.rankByKey['a::Ravens'], 1)
eq('their Wolves row ranks 2', both.rankByKey['a::Wolves'], 2)
deepEq(
  'filtering picks only the one team’s row',
  buildView(twoTeams, { team: 'Wolves', sort: 'score-desc', showTeam: true }).rows.map(
    (r) => r.best_score,
  ),
  [8.0],
)

// ── The unfiltered coach/player board is unchanged ────────────────────────
const teamOnly = [row('a', 'Ava', 9.1), row('b', 'Ben', 7.4)]
const coachView = buildView(teamOnly, { team: ALL, sort: 'score-desc', showTeam: false })
deepEq('team board still ranks by best score', names(coachView.rows), ['Ava', 'Ben'])
eq('team board keys stay bare ids', coachView.rankByKey['a'], 1)
eq('and rank 2', coachView.rankByKey['b'], 2)

// ── Empty board ───────────────────────────────────────────────────────────
const none = buildView([], { team: ALL, sort: 'score-desc', showTeam: true })
eq('an empty board has no rows', none.rows.length, 0)
eq('and no ranks', Object.keys(none.rankByKey).length, 0)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)

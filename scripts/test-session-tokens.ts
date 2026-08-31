/**
 * Tests for session-token separation.
 *
 * Run: npx tsx scripts/test-session-tokens.ts
 *
 * Player, team, org, admin and team-choice tokens are all signed with the SAME
 * HMAC key. That means a valid signature proves only "this app minted it" —
 * never "this app minted it for this purpose". Every check below is a token
 * being offered where it does not belong; each one that passes is a session
 * someone could have had without the password.
 *
 * The concrete bug this locks down: /api/team/select used to mint a full team
 * session from a teamId and an email, with no proof a password was ever
 * checked. It now requires a short-lived team-choice token, so the two must
 * stay rigorously distinguishable.
 */

// Must be set before the lib modules are imported — jwtSecret() caches it.
process.env.JWT_SECRET = 'test-secret-not-used-anywhere-real-0123456789'

import { signTeamSession, verifyTeamSession, signTeamChoice, verifyTeamChoice } from '../lib/team-auth'
import { signSession, verifySession } from '../lib/auth'
import { signOrgSession, verifyOrgSession } from '../lib/org-auth'

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

const TEAM_A = '11111111-1111-1111-1111-111111111111'
const TEAM_B = '22222222-2222-2222-2222-222222222222'
const COACH = 'coach@example.test'

async function main() {
  // ── The happy paths still work ────────────────────────────────────
  const teamToken = await signTeamSession({ teamId: TEAM_A, adminEmail: COACH })
  const teamSession = await verifyTeamSession(teamToken)
  check('a real team session verifies', teamSession?.teamId === TEAM_A)
  check('and carries its coach email', teamSession?.adminEmail === COACH)

  const choiceToken = await signTeamChoice(COACH, [TEAM_A, TEAM_B])
  const choice = await verifyTeamChoice(choiceToken)
  check('a real team-choice token verifies', choice?.teamIds.length === 2)
  check('and names the coach', choice?.adminEmail === COACH)
  check('and lists both teams', !!choice?.teamIds.includes(TEAM_A) && !!choice?.teamIds.includes(TEAM_B))

  // ── Cross-type confusion ──────────────────────────────────────────
  // The important one: a choice token must never become a team session. It
  // carries `teamIds` (plural) and no `teamId`, so without an explicit guard
  // it verifies and yields a session whose teamId is undefined — which every
  // downstream `WHERE team_id = $1` treats as "no rows" rather than as a
  // forgery, hiding the escalation instead of blocking it.
  check(
    'a team-choice token is NOT a team session',
    (await verifyTeamSession(choiceToken)) === null,
  )
  check(
    'a team session is NOT a team-choice token',
    (await verifyTeamChoice(teamToken)) === null,
  )

  const playerToken = await signSession({ userId: 'user-1', email: COACH })
  const orgToken = await signOrgSession({ orgId: 'org-1', adminEmail: COACH })

  check('a player token is NOT a team session', (await verifyTeamSession(playerToken)) === null)
  check('an org token is NOT a team session', (await verifyTeamSession(orgToken)) === null)
  check('a player token is NOT a team-choice token', (await verifyTeamChoice(playerToken)) === null)
  check('an org token is NOT a team-choice token', (await verifyTeamChoice(orgToken)) === null)

  // A team token must not pass as a player session either — the player path
  // requires a non-empty userId, which no team token carries.
  const asPlayer = await verifySession(teamToken)
  check('a team token has no userId to pass as a player', !asPlayer?.userId)

  // Nor as an org session, which requires an orgId.
  const asOrg = await verifyOrgSession(teamToken)
  check('a team token has no orgId to pass as an org', !asOrg?.orgId)

  // ── Tampering ─────────────────────────────────────────────────────
  check('garbage is rejected', (await verifyTeamSession('not-a-jwt')) === null)
  check('empty string is rejected', (await verifyTeamSession('')) === null)

  // Flipping a character in the signature must invalidate it.
  const parts = teamToken.split('.')
  const lastChar = parts[2].slice(-1)
  const tampered = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -1)}${lastChar === 'A' ? 'B' : 'A'}`
  check('a tampered signature is rejected', (await verifyTeamSession(tampered)) === null)

  // Re-signing the payload with a different key must not verify.
  const { SignJWT } = await import('jose')
  const foreign = await new SignJWT({ teamId: TEAM_A, adminEmail: COACH, kind: 'team' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode('a-different-secret-entirely-9876543210'))
  check('a token signed with another key is rejected', (await verifyTeamSession(foreign)) === null)

  // The `alg: none` classic — jose must refuse an unsigned token.
  const unsigned = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(
    JSON.stringify({ teamId: TEAM_A, adminEmail: COACH, kind: 'team' }),
  ).toString('base64url')}.`
  check('an alg:none token is rejected', (await verifyTeamSession(unsigned)) === null)

  // ── Expiry ────────────────────────────────────────────────────────
  const expired = await new SignJWT({ teamId: TEAM_A, adminEmail: COACH, kind: 'team' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!))
  check('an expired team session is rejected', (await verifyTeamSession(expired)) === null)

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exit(1)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

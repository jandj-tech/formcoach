import Link from 'next/link'
import type { Metadata } from 'next'
import { UsersIcon, CheckCircle2Icon } from 'lucide-react'
import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { getTeamSession } from '@/lib/team-auth'
import { getOrgSession } from '@/lib/org-auth'
import JoinCard from './JoinCard'

/**
 * This page is always dark, like /signup and /team — it is the first thing a
 * player sees, before they have a theme with us. So its buttons are styled
 * outright rather than reusing the backend scale, whose quiet variant picks
 * its colour through a `dark:` variant and would render dark-grey-on-black
 * for any visitor whose browser is in light mode.
 */
const PRIMARY_BTN =
  'inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-base font-bold ' +
  'bg-ember-500 hover:bg-ember-600 text-ink-950 transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-400'
const QUIET_BTN =
  'inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-bold ' +
  'border border-courtline text-chalk hover:border-chalk-dim/60 transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-400'

export const metadata: Metadata = { robots: { index: false, follow: false } }

/**
 * The front door for a team invite link — learnhoops.com/join/THNDR7.
 *
 * The old flow had no page like this. A coach could only share the six-letter
 * code ("type this in on your dashboard") or a raw /signup?teamCode= link that
 * dropped a stranger onto a signup form with no indication of what they were
 * joining, and did nothing at all for a player who already had an account.
 *
 * This page always shows WHAT is being joined before asking for anything, and
 * carries the invite through whichever door the visitor needs — join now, log
 * in, or sign up — so the code never has to be typed by hand.
 */
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const teamCode = decodeURIComponent(code).trim().toUpperCase()

  // A database hiccup must not be reported as "that link isn't valid" — the
  // player would give up on a perfectly good invite. The two cases are kept
  // apart so each gets the message it deserves.
  let team:
    | { id: string; name: string; access_code: string; coach_nickname: string | null; admin_email: string }
    | undefined
  let lookupFailed = false
  try {
    ;[team] = (await db`
      SELECT id, name, access_code, coach_nickname, admin_email
      FROM teams WHERE access_code = ${teamCode}
    `) as unknown as [
      { id: string; name: string; access_code: string; coach_nickname: string | null; admin_email: string } | undefined,
    ]
  } catch (err) {
    console.error('[join] team lookup failed:', err)
    lookupFailed = true
  }

  const [session, teamSession, orgSession] = await Promise.all([
    getSession(), getTeamSession(), getOrgSession(),
  ])

  let playerCount = 0
  let alreadyOnTeam = false
  let needsName = false

  if (team) {
    try {
      const [row] = (await db`
        SELECT COUNT(*)::int AS n FROM team_memberships WHERE team_id = ${team.id}
      `) as unknown as [{ n: number }]
      playerCount = row?.n ?? 0
    } catch {
      // A count is decoration — never fail the invite over it.
    }
    if (session) {
      const [mine] = (await db`
        SELECT 1 FROM team_memberships
        WHERE team_id = ${team.id} AND user_id = ${session.userId} LIMIT 1
      `) as unknown as [unknown | undefined]
      alreadyOnTeam = !!mine
      const [user] = (await db`
        SELECT first_name, last_initial FROM users WHERE id = ${session.userId}
      `) as unknown as [{ first_name: string | null; last_initial: string | null } | undefined]
      needsName = !user?.first_name?.trim() || !user?.last_initial?.trim()
    }
  }

  const shell = (children: React.ReactNode) => (
    <main className="min-h-screen bg-ink-950 text-chalk flex flex-col">
      <TopNav />
      <div className="hero-glow grain relative flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md text-center space-y-6">{children}</div>
      </div>
      <SiteFooter />
    </main>
  )

  if (lookupFailed) {
    return shell(
      <>
        <h1 className="font-display font-black uppercase text-2xl leading-tight">
          Something went wrong
        </h1>
        <p className="text-chalk-dim text-sm leading-relaxed">
          We couldn&apos;t look up that team just now. Your invite link is fine — please refresh in
          a moment.
        </p>
      </>,
    )
  }

  if (!team) {
    return shell(
      <>
        <h1 className="font-display font-black uppercase text-2xl leading-tight">
          That invite link isn&apos;t valid
        </h1>
        <p className="text-chalk-dim text-sm leading-relaxed">
          The team code <span className="font-mono text-chalk">{teamCode}</span> doesn&apos;t match
          any team. Ask your coach to send the link again — codes change if a team is recreated.
        </p>
        <Link href="/" className={QUIET_BTN}>
          Go to LearnHoops
        </Link>
      </>,
    )
  }

  const coachName = team.coach_nickname?.trim() || null

  // The invite is always shown, whoever is looking — the identity block below
  // only decides which door to offer.
  const header = (
    <div className="space-y-3">
      <p className="eyebrow text-ember-400 select-none">You&apos;ve been invited to join</p>
      <h1 className="font-display font-black uppercase text-3xl leading-tight text-gradient-ember">
        {team.name}
      </h1>
      <p className="text-chalk-dim text-sm font-mono flex items-center justify-center gap-2">
        <UsersIcon aria-hidden className="w-4 h-4" />
        {playerCount} player{playerCount === 1 ? '' : 's'}
        {coachName ? ` · Coach ${coachName}` : ''}
      </p>
    </div>
  )

  // A coach or organization is signed in on this browser. Joining as a player
  // would need a different kind of account, so say so rather than failing.
  if (!session && (teamSession || orgSession)) {
    return shell(
      <>
        {header}
        <p className="text-chalk-dim text-sm leading-relaxed">
          You&apos;re signed in as a {orgSession ? 'organization' : 'coach'}. Team invites are for
          players — open this link on your player&apos;s device, or log out here first.
        </p>
        <Link
          href={orgSession ? '/org/dashboard' : '/team/dashboard'}
          className={QUIET_BTN}
        >
          Back to my dashboard
        </Link>
      </>,
    )
  }

  if (session && alreadyOnTeam) {
    return shell(
      <>
        {header}
        <p className="text-chalk-dim text-sm flex items-center justify-center gap-2">
          <CheckCircle2Icon aria-hidden className="w-4 h-4 text-green-400" />
          You&apos;re already on this team.
        </p>
        <Link href="/team" className={PRIMARY_BTN}>
          Open your team
        </Link>
      </>,
    )
  }

  if (session) {
    return shell(
      <>
        {header}
        <JoinCard teamCode={team.access_code} teamName={team.name} needsName={needsName} />
      </>,
    )
  }

  // Signed out: both doors carry the invite, so nobody types the code.
  return shell(
    <>
      {header}
      <div className="space-y-3">
        <Link
          href={`/signup?teamCode=${encodeURIComponent(team.access_code)}`}
          className={PRIMARY_BTN}
        >
          Create an account &amp; join
        </Link>
        <Link
          href={`/login?next=${encodeURIComponent(`/join/${team.access_code}`)}`}
          className={QUIET_BTN}
        >
          I already have an account
        </Link>
      </div>
      <p className="text-chalk-dim text-xs leading-relaxed">
        Joining puts you on {team.name}&apos;s roster so your coach can see your shot analyses.
        Free to join — your coach hands out analysis tokens.
      </p>
    </>,
  )
}

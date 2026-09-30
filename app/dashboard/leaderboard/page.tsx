import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { playerTeamBoard, type ImprovedRow } from '@/lib/team-shots'
import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import PrintButton from '@/components/PrintButton'
import LeaderboardTable, { type LeaderboardRow } from '@/components/LeaderboardTable'

export default async function TeamLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const { team: teamParam } = await searchParams

  // A player can be on several teams. Show the team from the ?team= param
  // (only if they're actually a member of it), otherwise their most recent.
  let team: { id: string; name: string } | null = null
  if (teamParam) {
    try {
      const [row] = (await db`
        SELECT t.id, t.name
        FROM team_memberships tm
        JOIN teams t ON t.id = tm.team_id
        WHERE tm.user_id = ${session.userId} AND t.id = ${teamParam}
        LIMIT 1
      `) as unknown as [{ id: string; name: string } | undefined]
      team = row ?? null
    } catch {
      // Invalid team id in the param — fall through to the default below.
    }
  }
  if (!team) {
    try {
      const [row] = (await db`
        SELECT t.id, t.name
        FROM team_memberships tm
        JOIN teams t ON t.id = tm.team_id
        WHERE tm.user_id = ${session.userId}
        ORDER BY tm.joined_at DESC
        LIMIT 1
      `) as unknown as [{ id: string; name: string } | undefined]
      team = row ?? null
    } catch (err) {
      console.error('[dashboard/leaderboard] team query failed:', err)
    }
  }

  // Not on a team — nothing to rank, send them back to the dashboard.
  if (!team) redirect('/dashboard')

  // Only shots filed to this team, each counted once (lib/team-shots.ts) — a
  // teammate's personal or other-team shots are not this team's leaderboard.
  // playerTeamBoard is the player-facing reader: when the coach keeps the
  // board private it returns only this player's own row, so teammates' names
  // and scores never reach this page.
  let leaderboard: LeaderboardRow[] = []
  let mostImproved: ImprovedRow[] = []
  let hidden = false
  try {
    const board = await playerTeamBoard(team.id, session.userId)
    hidden = board.hidden
    leaderboard = board.leaderboard
    mostImproved = board.mostImproved
  } catch (err) {
    console.error('[dashboard/leaderboard] leaderboard query failed:', err)
  }

  // Private view: the player's own numbers only.
  const mine = hidden ? leaderboard[0] : undefined
  const myImprovement = hidden ? mostImproved[0] : undefined
  const fmt = (v: number | string | null | undefined) => {
    const n = Number(v)
    return v === null || v === undefined || !Number.isFinite(n) ? '—' : (Math.round(n * 10) / 10).toString()
  }
  const improvementDelta = myImprovement
    ? Math.round((Number(myImprovement.latest_score) - Number(myImprovement.first_score)) * 10) / 10
    : null

  // BIG team name, last word in the ember gradient — same hero treatment as
  // the team hub this page is linked from.
  const words = team.name.trim().split(/\s+/)
  const lastWord = words[words.length - 1]
  const leadWords = words.slice(0, -1).join(' ')

  return (
    <main className="min-h-screen bg-ink-950 text-chalk print:bg-white dark:print:bg-ink-900 print:text-black dark:print:text-chalk flex flex-col">
      <div className="print:hidden">
        <TopNav />
      </div>
      <div className="max-w-3xl mx-auto w-full px-6 py-10 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <Link href="/team" className="text-sm text-ember-400 hover:text-ember-500 font-medium print:hidden">
              ← Back to your team
            </Link>
            <p className="eyebrow text-ember-400 select-none mt-4 print:text-black dark:print:text-chalk">
              {hidden ? 'Your results' : 'Leaderboard'}
            </p>
            {/* One line, always — long team names render smaller so the whole
                name still fits, with an ellipsis as the last resort. */}
            <h1
              className={`font-display font-black uppercase leading-tight mt-1 truncate ${
                team.name.length > 24
                  ? 'text-[clamp(1.05rem,2.6vw,1.5rem)]'
                  : 'text-[clamp(1.4rem,3.5vw,2rem)]'
              }`}
            >
              {leadWords && <>{leadWords} </>}
              <span className="text-gradient-ember print:text-black dark:print:text-chalk print:[background:none]">{lastWord}</span>
            </h1>
            <p className="text-chalk-dim text-sm mt-3 print:text-gray-500 dark:print:text-chalk-dim">
              {hidden
                ? 'Your coach keeps the leaderboard private.'
                : 'Every player ranked by their best shot score.'}
            </p>
          </div>
          {!hidden && leaderboard.length > 0 && <PrintButton label="Print" />}
        </div>

        {hidden ? (
          !mine ? (
            <div className="text-center py-12 text-chalk-dim border-2 border-dashed border-courtline rounded-2xl">
              <p className="font-semibold text-chalk">No shots on this team yet</p>
              <p className="text-sm mt-1">Your scores show up here once you analyze a shot with this team.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Best score', value: fmt(mine.best_score) },
                  { label: 'Average', value: fmt(mine.avg_score) },
                  { label: mine.upload_count === 1 ? 'Shot' : 'Shots', value: String(mine.upload_count) },
                ].map(stat => (
                  <div key={stat.label} className="bg-ink-900 border border-courtline rounded-2xl px-4 py-5 text-center">
                    <p className="font-display font-black text-3xl text-chalk tabular-nums">{stat.value}</p>
                    <p className="text-xs uppercase tracking-wide text-chalk-dim mt-1">{stat.label}</p>
                  </div>
                ))}
              </div>
              <div className="bg-ink-900 border border-courtline rounded-2xl px-5 py-4">
                <p className="text-xs uppercase tracking-wide text-chalk-dim">Improvement</p>
                {myImprovement && improvementDelta !== null ? (
                  <p className="text-chalk mt-1">
                    First shot <span className="font-semibold tabular-nums">{fmt(myImprovement.first_score)}</span>
                    {' → '}latest <span className="font-semibold tabular-nums">{fmt(myImprovement.latest_score)}</span>
                    <span
                      className={`ml-2 font-bold tabular-nums ${
                        improvementDelta > 0 ? 'text-green-400' : improvementDelta < 0 ? 'text-red-400' : 'text-chalk-dim'
                      }`}
                    >
                      {improvementDelta > 0 ? '+' : ''}{improvementDelta}
                    </span>
                  </p>
                ) : (
                  <p className="text-chalk-dim text-sm mt-1">Analyze a second shot to see how much you&apos;ve improved.</p>
                )}
              </div>
            </div>
          )
        ) : leaderboard.length === 0 ? (
          <div className="text-center py-12 text-chalk-dim border-2 border-dashed border-courtline rounded-2xl">
            <p className="font-semibold text-chalk">No shots analyzed yet</p>
            <p className="text-sm mt-1">Scores show up here once teammates analyze their shots.</p>
          </div>
        ) : (
          <LeaderboardTable entries={leaderboard} context="player" theme="dark" />
        )}
      </div>
      <div className="flex-1" />
      <div className="print:hidden">
        <SiteFooter />
      </div>
    </main>
  )
}

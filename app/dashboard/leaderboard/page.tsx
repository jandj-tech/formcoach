import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
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

  // The leaderboard combines two kinds of shots: players who joined with an
  // account (matched by submissions.user_id) and players a coach uploaded for
  // by name (matched by submissions.team_player_id).
  let leaderboard: LeaderboardRow[] = []
  try {
    leaderboard = (await db`
      WITH shots AS (
        SELECT
          u.id::text AS player_id,
          COALESCE(NULLIF(tm.first_name, ''), u.email) AS name,
          tm.last_name_initial,
          a.overall_score,
          s.id AS sid,
          'member' AS kind
        FROM team_memberships tm
        JOIN users u ON u.id = tm.user_id
        JOIN submissions s ON s.user_id = u.id
        JOIN analyses a ON a.submission_id = s.id
        WHERE tm.team_id = ${team.id} AND s.status = 'complete'
        UNION ALL
        SELECT
          tp.id::text AS player_id,
          tp.first_name AS name,
          tp.last_name_initial,
          a.overall_score,
          s.id AS sid,
          'player' AS kind
        FROM team_players tp
        JOIN submissions s ON s.team_player_id = tp.id AND s.team_id = tp.team_id
        JOIN analyses a ON a.submission_id = s.id
        WHERE tp.team_id = ${team.id} AND s.status = 'complete'
      )
      SELECT
        player_id AS id,
        name AS first_name,
        last_name_initial,
        kind,
        MAX(overall_score) AS best_score,
        ROUND(AVG(overall_score)::numeric, 1) AS avg_score,
        COUNT(sid)::int AS upload_count
      FROM shots
      GROUP BY player_id, name, last_name_initial, kind
      ORDER BY best_score DESC
    `) as unknown as LeaderboardRow[]
  } catch (err) {
    console.error('[dashboard/leaderboard] leaderboard query failed:', err)
  }

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
            <p className="eyebrow text-ember-400 select-none mt-4 print:text-black dark:print:text-chalk">Leaderboard</p>
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
              Every player ranked by their best shot score.
            </p>
          </div>
          {leaderboard.length > 0 && <PrintButton label="Print" />}
        </div>

        {leaderboard.length === 0 ? (
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

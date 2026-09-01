import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { isInAppRequest } from '@/lib/in-app'
import { db } from '@/lib/db'
import { userTier } from '@/lib/team-features'
import { analysisBaseCents, REGULAR_VOLUME_MIN_QTY, REGULAR_VOLUME_PRICE_CENTS, usd } from '@/lib/team-pricing'
import { getUsageSummary } from '@/lib/player-dashboard'
import { PLAYER_PLANS } from '@/lib/player-plans'
import PlanControls from './PlanControls'
import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import InfoTip from '@/components/InfoTip'
import AccountTabs from '@/components/account/AccountTabs'
import Section from '@/components/account/Section'
import Link from 'next/link'
import LogoutButton from './LogoutButton'
import BuyTokenButton from './BuyTokenButton'
import DeleteSubmissionButton from './DeleteSubmissionButton'
import DeleteAccountButton from './DeleteAccountButton'
import JoinTeamForm from './JoinTeamForm'
import LeaveTeamButton from './LeaveTeamButton'
import NicknameForm from './NicknameForm'
import NameForm from './NameForm'
import TeamChatPanel from '@/components/TeamChatPanel'
import TeamSchedulePanel from '@/components/TeamSchedulePanel'
import AppearanceSection from '@/components/account/AppearanceSection'

type UserRow = {
  id: string
  email: string
  subscription_type: string | null
  subscription_expires_at: string | null
  analysis_tokens?: number
  nickname?: string | null
  first_name?: string | null
  last_initial?: string | null
}

type SubmissionRow = {
  id: string
  created_at: string
  token: string
  // Postgres returns DECIMAL columns as strings, so this can be either.
  overall_score: string | number | null
  frame_urls: string[] | null
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ app?: string; tab?: string; subscribed?: string }> }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const params = await searchParams
  // The ?app=ios param is lost on in-page navigation, so also check the
  // app WebView's User-Agent marker.
  const isInApp = params.app === 'ios' || (await isInAppRequest())

  let user: UserRow | undefined
  let submissions: SubmissionRow[] = []
  let loadError: string | null = null

  try {
    // The analysis_tokens / nickname columns may not exist yet if the DB
    // migration hasn't been applied — fall back to the base column set.
    try {
      ;[user] = (await db`
        SELECT id, email, subscription_type, subscription_expires_at,
               analysis_tokens, nickname, first_name, last_initial
        FROM users WHERE id = ${session.userId}
      `) as unknown as [UserRow | undefined]
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!/column .* does not exist/i.test(msg)) throw err
      // first_name / last_initial migration not yet run — fall back without them.
      try {
        ;[user] = (await db`
          SELECT id, email, subscription_type, subscription_expires_at, analysis_tokens, nickname
          FROM users WHERE id = ${session.userId}
        `) as unknown as [UserRow | undefined]
      } catch (err2) {
        const msg2 = err2 instanceof Error ? err2.message : String(err2)
        if (!/column .* does not exist/i.test(msg2)) throw err2
        ;[user] = (await db`
          SELECT id, email, subscription_type, subscription_expires_at
          FROM users WHERE id = ${session.userId}
        `) as unknown as [UserRow | undefined]
      }
    }

    if (user) {
      submissions = (await db`
        SELECT s.id, s.created_at, s.token, a.overall_score, a.frame_urls
        FROM submissions s
        LEFT JOIN analyses a ON a.submission_id = s.id
        WHERE s.user_id = ${user.id} OR s.email = ${user.email}
        ORDER BY s.created_at DESC
        LIMIT 100
      `) as unknown as SubmissionRow[]
    }
  } catch (err) {
    // Don't crash with a 500 — surface the real reason so it can be fixed.
    loadError = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    console.error('[dashboard] load error:', err)
  }

  // Couldn't load data — show the actual error instead of a blank server error.
  if (loadError) {
    return (
      <main className="min-h-screen bg-white dark:bg-ink-900 flex flex-col">
        <TopNav />
        <div className="max-w-3xl mx-auto w-full px-6 py-20 space-y-4 text-center">
          <div className="text-5xl">⚠️</div>
          <h1 className="text-2xl font-black text-black dark:text-chalk">Couldn&apos;t load your account</h1>
          <p className="text-gray-500 dark:text-chalk-dim text-sm">
            Something went wrong reading your data. Technical detail:
          </p>
          <pre className="text-left text-xs bg-gray-100 dark:bg-ink-800 border border-gray-200 dark:border-courtline rounded-lg p-4 overflow-x-auto whitespace-pre-wrap text-red-600 dark:text-red-400">
            {loadError}
          </pre>
          <div className="pt-2">
            <LogoutButton />
          </div>
        </div>
      </main>
    )
  }

  if (!user) redirect('/login')

  // Teams the player has joined — a player can be on more than one (e.g. a
  // house league team and a summer league team).
  let teams: Array<{ id: string; name: string; access_code: string; admin_email: string }> = []
  try {
    teams = (await db`
      SELECT t.id, t.name, t.access_code, t.admin_email
      FROM team_memberships tm
      JOIN teams t ON t.id = tm.team_id
      WHERE tm.user_id = ${user.id}
      ORDER BY tm.joined_at DESC
    `) as unknown as typeof teams
  } catch (err) {
    console.error('[dashboard] team membership query failed:', err)
  }

  // Coaches for each team, shown by nickname (falling back to email): the
  // founding coach plus any added coaches.
  // Two batched reads rather than two per team. This was 2N+1 sequential
  // round-trips — and the per-team nickname lookup re-read a `teams` row the
  // query above had already returned. A player on five teams paid eleven
  // round-trips to render one page; now it is three, whatever the count.
  //
  // Each read keeps its own try/catch: coach_nickname and team_coaches may be
  // absent on older databases, and the page must still show the founding coach
  // rather than failing, exactly as before.
  const coachesByTeam: Record<string, string[]> = {}
  const teamIds = teams.map(t => t.id)

  const nicknameById = new Map<string, string | null>()
  if (teamIds.length > 0) {
    try {
      const rows = (await db`
        SELECT id, coach_nickname FROM teams WHERE id = ANY(${teamIds})
      `) as unknown as Array<{ id: string; coach_nickname: string | null }>
      for (const r of rows) nicknameById.set(r.id, r.coach_nickname)
    } catch (err) {
      console.error('[dashboard] head coach nickname query failed:', err)
    }
  }

  const extrasByTeam = new Map<string, string[]>()
  if (teamIds.length > 0) {
    try {
      const rows = (await db`
        SELECT team_id, email, nickname FROM team_coaches
        WHERE team_id = ANY(${teamIds})
        ORDER BY created_at ASC
      `) as unknown as Array<{ team_id: string; email: string; nickname: string | null }>
      for (const c of rows) {
        const list = extrasByTeam.get(c.team_id) ?? []
        list.push(c.nickname || c.email)
        extrasByTeam.set(c.team_id, list)
      }
    } catch (err) {
      console.error('[dashboard] team coaches query failed:', err)
    }
  }

  for (const t of teams) {
    coachesByTeam[t.id] = [
      nicknameById.get(t.id) || t.admin_email,
      ...(extrasByTeam.get(t.id) ?? []),
    ]
  }

  // Grandfathered pre-2026 unlimited subscribers (legacy columns).
  const isSubscribed =
    !!user.subscription_type &&
    !!user.subscription_expires_at &&
    new Date(user.subscription_expires_at) > new Date()

  const tokens = user.analysis_tokens ?? 0
  const tier = await userTier(user.id)
  // The Player/Pro plan + this week/month allowance, from the same service the
  // API and the iOS app read — one source of truth for what's left.
  const usage = await getUsageSummary(user.id)

  function scoreColor(score: number) {
    if (score >= 8) return 'text-green-600 dark:text-green-400'
    if (score >= 6) return 'text-orange-500'
    return 'text-red-500'
  }

  const fullName = user.first_name && user.last_initial
    ? `${user.first_name} ${user.last_initial}`
    : null
  const tokenPrice = (analysisBaseCents(tier) / 100).toFixed(2)

  const shotsTab = (
    <div className="space-y-3">
      {submissions.length === 0 ? (
        <div className="text-center py-16 space-y-4 bg-gray-50 dark:bg-ink-800 border border-gray-200 dark:border-courtline rounded-2xl">
          <div className="text-5xl">🏀</div>
          <p className="text-black dark:text-chalk font-semibold">No shots analyzed yet</p>
          <Link
            href="/analyze"
            className="inline-block bg-orange-500 hover:bg-orange-400 text-ink-950 font-bold px-6 py-3 rounded-xl transition-colors"
          >
            Analyze Your Shot
          </Link>
        </div>
      ) : (
        <>
          {submissions.map((sub) => {
            const thumb = sub.frame_urls?.[Math.floor((sub.frame_urls.length || 1) / 2)]
            const date = new Date(sub.created_at).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric',
            })
            // Postgres returns DECIMAL as a string — coerce before formatting.
            const score = sub.overall_score == null ? null : Number(sub.overall_score)
            return (
              <div key={sub.id} className="flex items-center gap-2">
                <Link
                  href={`/results/${sub.token}`}
                  className="flex-1 min-w-0 flex items-center gap-4 bg-gray-50 dark:bg-ink-800 hover:bg-orange-50 dark:hover:bg-ember-500/10 border border-gray-200 dark:border-courtline hover:border-orange-200 rounded-xl p-4 transition-colors group"
                >
                  {thumb ? (
                    <img
                      src={thumb}
                      alt="Shot frame"
                      className="w-16 h-16 object-cover rounded-lg shrink-0 bg-gray-200 dark:bg-ink-700"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-gray-200 dark:bg-ink-700 rounded-lg shrink-0 flex items-center justify-center text-2xl">🏀</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-500 dark:text-chalk-dim">{date}</p>
                    <p className="text-black dark:text-chalk font-semibold text-sm mt-0.5 group-hover:text-orange-600 dark:group-hover:text-ember-400 transition-colors">
                      View Shot Breakdown →
                    </p>
                  </div>
                  {score !== null && !Number.isNaN(score) ? (
                    <div className={`text-2xl font-black shrink-0 ${scoreColor(score)}`}>
                      {score.toFixed(1)}
                    </div>
                  ) : (
                    <div className="text-gray-300 text-sm shrink-0">—</div>
                  )}
                </Link>
                <DeleteSubmissionButton id={sub.id} />
              </div>
            )
          })}
          <div className="text-center pt-2">
            <Link
              href="/analyze"
              className="inline-block bg-orange-500 hover:bg-orange-400 text-ink-950 font-bold px-8 py-3 rounded-xl transition-colors"
            >
              + Analyze Another Shot
            </Link>
          </div>
        </>
      )}
    </div>
  )

  const settingsTab = (
    <div className="space-y-4">
      <AppearanceSection />

      <Section
        title="Display name"
        tipLabel="What is my display name used for?"
        tip="Shown on team rosters, leaderboards, and any certificates you earn. Just your first name and last initial — never your full name."
        summary={fullName || 'Not set'}
      >
        <NameForm
          currentFirstName={user.first_name ?? null}
          currentLastInitial={user.last_initial ?? null}
        />
      </Section>

      <Section
        title="Nickname"
        tipLabel="What is my nickname used for?"
        tip="Optional handle (like &ldquo;Buckets&rdquo;). It&rsquo;s shown on your account instead of your email if you haven&rsquo;t set a display name."
        summary={user.nickname || 'Not set'}
      >
        <NicknameForm current={user.nickname ?? null} />
      </Section>

      <div className="border border-red-200 dark:border-red-900/60 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-black dark:text-chalk">Delete account</h3>
          <p className="text-gray-500 dark:text-chalk-dim text-xs mt-1">
            Permanently removes your account and all shot history. This cannot be undone.
          </p>
        </div>
        <DeleteAccountButton />
      </div>
    </div>
  )

  const teamsTab = (
    <div className="space-y-4">
      {teams.map((t, i) => {
        const teamCoaches = coachesByTeam[t.id] ?? []
        return (
          // The whole team is minimizable to its name+code header. Same
          // no-JS <details> pattern as account Sections; the first team
          // starts open (keeps the schedule's at-a-glance prominence),
          // additional teams start folded.
          <details
            key={t.id}
            open={i === 0}
            className="group bg-gray-50 dark:bg-ink-800 border border-gray-200 dark:border-courtline rounded-2xl"
          >
            <summary className="flex items-center justify-between gap-3 p-4 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
              <div className="min-w-0">
                <p className="font-bold text-black dark:text-chalk truncate">{t.name}</p>
                <p className="text-gray-500 dark:text-chalk-dim text-xs mt-0.5">
                  Team code:{' '}
                  <span className="font-mono font-semibold text-gray-700 dark:text-chalk-dim">{t.access_code}</span>
                </p>
              </div>
              <svg
                className="w-5 h-5 text-gray-400 dark:text-chalk-dim transition-transform group-open:rotate-180 shrink-0"
                viewBox="0 0 20 20" fill="currentColor" aria-hidden
              >
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </summary>

            <div className="px-4 pb-4 space-y-2 border-t border-gray-200 dark:border-courtline pt-3">
              <div className="flex items-start justify-between gap-3">
                {teamCoaches.length > 0 ? (
                  <p className="text-xs text-gray-500 dark:text-chalk-dim min-w-0">
                    <span className="font-semibold uppercase tracking-wide">
                      {teamCoaches.length === 1 ? 'Coach' : 'Coaches'}:
                    </span>{' '}
                    <span className="text-gray-700 dark:text-chalk-dim">{teamCoaches.join(', ')}</span>
                  </p>
                ) : <span />}
                <LeaveTeamButton teamId={t.id} teamName={t.name} />
              </div>
              <Link
                href={`/dashboard/leaderboard?team=${t.id}`}
                className="inline-block text-sm font-semibold text-orange-600 dark:text-ember-400 hover:text-orange-500 transition-colors"
              >
                View Team Leaderboard →
              </Link>

              {/* Upcoming events — one-tap RSVP without leaving the dashboard.
                  Schedule outranks chat everywhere: open by default, chat folded. */}
              <div className="pt-2 space-y-2">
                <Section title="📅 Upcoming" defaultOpen>
                  <TeamSchedulePanel teamId={t.id} theme="light" compact />
                </Section>

                {/* Team chat — same rules as the app: coach controls who can post */}
                <Section title="💬 Team Chat" summary="Open to chat">
                  <TeamChatPanel teamId={t.id} />
                </Section>
              </div>
            </div>
          </details>
        )
      })}

      {teams.length === 0 ? (
        <JoinTeamForm variant="empty" />
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-gray-600 dark:text-chalk-dim">
            Have another team code? Join another team — handy for house or
            summer league.
          </p>
          <JoinTeamForm />
        </div>
      )}
    </div>
  )

  return (
    <main className="min-h-screen bg-white dark:bg-ink-900 flex flex-col">
      <TopNav />

      <div className="max-w-3xl mx-auto w-full px-6 py-10 space-y-6 flex-1">
        {/* ── Header ─────────────────────────────────────────────── */}
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-black dark:text-chalk">
              {fullName || user.nickname || 'Your Account'}
            </h1>
            <p className="text-gray-500 dark:text-chalk-dim text-sm mt-1 truncate">{user.email}</p>
          </div>
          <LogoutButton />
        </header>

        {/* ── Plan & usage — always visible above the tabs ───────── */}
        {params.subscribed === '1' && usage.entitled && (
          <div className="bg-green-50 dark:bg-green-500/10 border border-green-300 dark:border-green-500/40 rounded-2xl px-5 py-4 text-sm font-semibold text-green-800 dark:text-green-300">
            Your {usage.planName} plan is active. Included analyses reset on your own billing
            schedule — they&apos;re tracked below.
          </div>
        )}

        {usage.entitled && usage.plan ? (
          <>
            {/* Current plan */}
            <section className="bg-orange-50 dark:bg-ember-500/10 border border-orange-200 rounded-2xl p-5 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xs font-bold text-gray-500 dark:text-chalk-dim uppercase tracking-wide">Your Plan</h2>
                  <p className="text-2xl font-black text-black dark:text-chalk mt-1">{usage.planName}</p>
                  <p className="text-sm text-gray-600 dark:text-chalk-dim mt-0.5">
                    {usage.billingFrequency === 'annual'
                      ? `${usd(PLAYER_PLANS[usage.plan].annualTotalCents)}/year`
                      : `${usd(PLAYER_PLANS[usage.plan].monthlyCents)}/month`}
                    {' · '}
                    {usage.allowanceLabel}
                  </p>
                  {usage.nextBillingAt && (
                    <p className="text-xs text-gray-500 dark:text-chalk-dim mt-1">
                      {usage.cancelAtPeriodEnd ? 'Plan ends' : usage.subscriptionStatus === 'past_due' ? 'Payment retry — access until' : 'Next billing date'}
                      {': '}
                      {new Date(usage.nextBillingAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </p>
                  )}
                  {usage.subscriptionStatus === 'past_due' && (
                    <p className="text-xs font-bold text-red-600 dark:text-red-400 mt-1">
                      Your last payment failed — update your card in Manage subscription to keep your plan.
                    </p>
                  )}
                </div>
                <Link
                  href="/analyze"
                  className="bg-orange-500 hover:bg-orange-400 text-ink-950 font-bold text-sm px-5 py-2.5 rounded-xl transition-colors"
                >
                  Analyze a Shot
                </Link>
              </div>
              {usage.billedViaApple ? (
                <p className="text-xs text-gray-500 dark:text-chalk-dim">
                  Your plan is billed through the App Store — manage or cancel it in your iPhone&apos;s
                  Settings → Subscriptions.
                </p>
              ) : (
                !isInApp && <PlanControls plan={usage.plan} interval={usage.billingFrequency ?? 'monthly'} />
              )}
            </section>

            {/* Included usage — BOTH limits, tracked separately from tokens */}
            <section className="border border-gray-200 dark:border-courtline rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-bold text-gray-500 dark:text-chalk-dim uppercase tracking-wide">Shot Analysis</h2>
                <InfoTip label="How do included analyses work?" align="left">
                  Your plan includes {usage.allowanceLabel} — both limits apply, and unused
                  analyses don&apos;t roll over. When your included analyses are used up, any
                  purchased analysis tokens are used instead (we&apos;ll tell you first).
                </InfoTip>
              </div>
              {(
                [
                  { label: 'This Week', used: usage.weeklyUsed, limit: usage.weeklyLimit, remaining: usage.weeklyRemaining, days: usage.weeklyResetInDays, resetLabel: 'Next weekly reset' },
                  { label: 'This Month', used: usage.monthlyUsed, limit: usage.monthlyLimit, remaining: usage.monthlyRemaining, days: usage.monthlyResetInDays, resetLabel: 'Next monthly reset' },
                ] as const
              ).map((row) => {
                const pct = row.limit > 0 ? Math.min(100, Math.round((row.used / row.limit) * 100)) : 0
                const days = row.days
                return (
                  <div key={row.label}>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-bold text-black dark:text-chalk">{row.label}</p>
                      <p className="text-sm font-black text-black dark:text-chalk">
                        {row.used} <span className="text-gray-400 dark:text-chalk-dim font-semibold">/ {row.limit}</span>
                      </p>
                    </div>
                    <div
                      className="mt-1.5 h-2 rounded-full bg-gray-200 dark:bg-ink-700 overflow-hidden"
                      role="progressbar"
                      aria-valuenow={row.used}
                      aria-valuemin={0}
                      aria-valuemax={row.limit}
                      aria-label={`${row.label}: ${row.used} of ${row.limit} included analyses used`}
                    >
                      <div
                        className={`h-full rounded-full transition-all ${row.remaining === 0 ? 'bg-gray-400 dark:bg-chalk-dim' : 'bg-orange-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-chalk-dim mt-1">
                      {row.remaining === 0
                        ? `Used up — ${row.resetLabel.toLowerCase()}${days ? ` in ${days} day${days === 1 ? '' : 's'}` : ''}`
                        : `${row.remaining} ${row.remaining === 1 ? 'analysis' : 'analyses'} remaining`}
                      {row.remaining > 0 && days ? ` · ${row.resetLabel.toLowerCase()} in ${days} day${days === 1 ? '' : 's'}` : ''}
                    </p>
                  </div>
                )
              })}
              {usage.weeklyRemaining === 0 && usage.monthlyRemaining > 0 && usage.plan === 'player' && !isInApp && (
                <p className="text-xs text-gray-600 dark:text-chalk-dim border-t border-gray-200 dark:border-courtline pt-3">
                  Hitting the weekly limit often? Pro includes up to {PLAYER_PLANS.pro.weeklyLimit} per
                  week and {PLAYER_PLANS.pro.monthlyLimit} per month.
                </p>
              )}
            </section>
          </>
        ) : isSubscribed ? (
          /* Grandfathered legacy subscriber — unlimited, exactly as sold. */
          <section className="bg-orange-50 dark:bg-ember-500/10 border border-orange-200 rounded-2xl p-5">
            <h2 className="text-xs font-bold text-gray-500 dark:text-chalk-dim uppercase tracking-wide">Shot Analyses</h2>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
              <span className="text-3xl font-black text-orange-600 dark:text-ember-400">Unlimited</span>
              <Link
                href="/analyze"
                className="bg-orange-500 hover:bg-orange-400 text-ink-950 font-bold text-sm px-5 py-2.5 rounded-xl transition-colors"
              >
                Analyze a Shot
              </Link>
            </div>
          </section>
        ) : (
          !isInApp && (
            /* No plan: subscriptions are the primary option. */
            <section className="bg-orange-50 dark:bg-ember-500/10 border border-orange-200 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xs font-bold text-gray-500 dark:text-chalk-dim uppercase tracking-wide">Train Consistently</h2>
                <p className="text-black dark:text-chalk font-bold mt-1">
                  Get {PLAYER_PLANS.player.weeklyLimit} analyses every week, up to {PLAYER_PLANS.player.monthlyLimit} a month
                </p>
                <p className="text-sm text-gray-600 dark:text-chalk-dim mt-0.5">
                  Plans from {usd(PLAYER_PLANS.player.monthlyCents)}/month.
                </p>
              </div>
              <Link
                href="/pricing"
                className="bg-orange-500 hover:bg-orange-400 text-ink-950 font-bold text-sm px-5 py-2.5 rounded-xl transition-colors"
              >
                See Plans
              </Link>
            </section>
          )
        )}

        {/* ── Purchased analyses — separate from any plan allowance ── */}
        <section className="border border-gray-200 dark:border-courtline rounded-2xl p-5">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold text-gray-500 dark:text-chalk-dim uppercase tracking-wide">Purchased Analyses</h2>
            <InfoTip label="What are purchased analyses?" align="left">
              {isInApp ? (
                // In-app purchases carry their own App Store pricing — quoting
                // the web price here shows a number the buy button won't charge.
                <>One-time analysis tokens you own outright — separate from any plan&apos;s included
                analyses, and they don&apos;t expire. Every training ball from the shop includes 5
                free analyses.</>
              ) : (
                <>One-time analysis tokens you own outright — separate from any plan&apos;s included
                analyses, and they don&apos;t expire. ${tokenPrice} each, or {usd(REGULAR_VOLUME_PRICE_CENTS)} each
                when you buy {REGULAR_VOLUME_MIN_QTY} or more. Every training ball from the shop
                includes 5 free analyses.</>
              )}
            </InfoTip>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black text-black dark:text-chalk">{tokens}</span>
              <span className="text-gray-500 dark:text-chalk-dim text-sm">available</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {!isSubscribed && <BuyTokenButton isInApp={isInApp} initialTier={tier} />}
              {!usage.entitled && !isSubscribed && (
                <Link
                  href="/analyze"
                  className="bg-orange-500 hover:bg-orange-400 text-ink-950 font-bold text-sm px-5 py-2.5 rounded-xl transition-colors"
                >
                  Analyze a Shot
                </Link>
              )}
            </div>
          </div>
          {!isSubscribed && !isInApp && (
            <p className="text-gray-500 dark:text-chalk-dim text-xs mt-3">
              Tip: every{' '}
              <Link href="/shop" className="text-orange-600 dark:text-ember-400 hover:text-orange-500 font-medium transition-colors">
                training ball
              </Link>{' '}
              comes with 5 free analyses.
            </p>
          )}
        </section>

        {/* ── Tabs ───────────────────────────────────────────────── */}
        <AccountTabs
          defaultTab={params.tab}
          tabs={[
            { id: 'shots', label: 'Shot History', count: submissions.length, content: shotsTab },
            {
              id: 'teams',
              label: teams.length === 1 ? 'My Team' : 'My Teams',
              count: teams.length,
              content: teamsTab,
            },
            // Renamed from "Profile" once it grew past name-and-nickname into
            // real settings. `profile` stays as an alias so old links land.
            { id: 'settings', label: 'Settings', content: settingsTab, aliases: ['profile'] },
          ]}
        />
      </div>
      <SiteFooter />
    </main>
  )
}

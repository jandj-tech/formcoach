// Shapes and helpers shared by the org dashboard and the per-team card it
// renders. They live here rather than in OrgDashboardClient so the card can
// import them without a cycle back into its own parent.

import type { LeaderboardRow } from '@/components/LeaderboardTable'
import type { LeaderboardVisibility } from '@/components/LeaderboardVisibilitySwitch'

export interface Member {
  id: string
  email: string
  first_name: string | null
  last_name_initial: string | null
  tokens: number
  /** true while a coach/org-added player hasn't finished account setup. */
  roster_pending?: boolean
}

// A coach-invited player who has no account yet (name only, joined by link).
export interface PendingPlayer {
  id: string
  first_name: string
  last_name_initial: string | null
  /**
   * A sibling's family address this name-only player is emailed at (older
   * entries only — new siblings get their own account on that email). The
   * roster offers "Give own account" for these.
   */
  contact_email?: string | null
}

export interface Coach {
  id: string
  email: string
  pending: boolean
  nickname: string | null
}

export interface TeamData {
  id: string
  name: string
  ageGroup: string | null
  accessCode: string
  adminEmail: string
  credits: number
  classPackageId: string | null
  members: Member[]
  pendingPlayers: PendingPlayer[]
  coaches: Coach[]
  coachNickname: string | null
  tokenPool: number
  leaderboard: LeaderboardRow[]
  /** 'team' = players see the ranked board; 'hidden' = only their own scores. */
  leaderboardVisibility: LeaderboardVisibility
}

// The account-setup state shown on a roster row.
export function memberStatus(m: Member): 'active' | 'pending' {
  return m.roster_pending ? 'pending' : 'active'
}

export interface ClassEnrollment {
  id: string
  user_id: string | null
  first_name: string | null
  last_name_initial: string | null
  first_score: number | null
  final_score: number | null
  display_final_score: number | null
  is_first_class: boolean
  certificate_issued_at: string | null
  has_first: boolean
  has_final: boolean
  tokens: number
}

export interface ClassPackage {
  id: string
  player_count: number
  price_per_player_cents: number
  total_cents: number
  token_pool: number
  status: string
  created_at: string
  enrolled_count: number
  completed_count: number
  team_access_code: string | null
  enrollments: ClassEnrollment[]
}

export type PlayerSortMode = 'name' | 'score-desc' | 'score-asc'

// Players are listed by first name plus a last initial; players who signed up
// without a name fall back to the email they registered with.
/**
 * Picker label: the display name, plus the email when another member in
 * `all` shows the same name (two "Jayden M." must be told apart).
 */
export function memberPickLabel(m: Member, all: readonly Member[]): string {
  const name = memberDisplayName(m)
  const twin = all.some(o => o.id !== m.id && memberDisplayName(o).toLowerCase() === name.toLowerCase())
  return twin && m.email && name !== m.email ? `${name} (${m.email})` : name
}

export function memberDisplayName(m: Member): string {
  if (m.first_name) {
    return `${m.first_name}${m.last_name_initial ? ' ' + m.last_name_initial + '.' : ''}`
  }
  return m.email
}

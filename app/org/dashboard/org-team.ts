// Shapes and helpers shared by the org dashboard and the per-team card it
// renders. They live here rather than in OrgDashboardClient so the card can
// import them without a cycle back into its own parent.

import type { LeaderboardRow } from '@/components/LeaderboardTable'

export interface Member {
  id: string
  email: string
  first_name: string | null
  last_name_initial: string | null
  tokens: number
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
  coaches: Coach[]
  coachNickname: string | null
  tokenPool: number
  leaderboard: LeaderboardRow[]
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
export function memberDisplayName(m: Member): string {
  if (m.first_name) {
    return `${m.first_name}${m.last_name_initial ? ' ' + m.last_name_initial + '.' : ''}`
  }
  return m.email
}

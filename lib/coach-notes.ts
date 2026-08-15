import { cookies } from 'next/headers'
import { db } from './db'
import { getSession } from './auth'
import { getTeamSession, type TeamSessionPayload } from './team-auth'
import { getOrgSession } from './org-auth'

/**
 * Coach's Notes — a coach's (or the owner's) own read of one criterion, shown
 * to the player BESIDE the AI score.
 *
 * Hard rule: nothing here may ever reach the grading model.
 * `criterion_scores.admin_score` is read with no author/scope filter by
 * lib/analyze.ts:buildCalibrationFeedbackText() and spliced into every
 * analysis prompt (with `admin_notes` quoted verbatim), so a coach writing
 * there would retrain the grader for every customer. The only bridge is the
 * owner explicitly accepting a note in Learn Mode.
 */

export const MAX_NOTE_LENGTH = 500

export interface NoteTarget {
  id: number
  analysis_id: number
  ai_score: string | null
}

/**
 * Resolves a criterion score the given coach is allowed to annotate, or null.
 *
 * Both facts are re-checked from the database on every call: team sessions are
 * 30-day JWTs, so a coach removed from a team still holds a token asserting
 * that teamId.
 *
 * Deliberately does NOT include the `submissions.email = player.email` branch
 * used by the coach member page — that string match also reaches anonymous
 * legacy uploads and other teams' shots, which is too broad for a read path
 * and must never become a write path.
 */
export async function resolveNoteTarget(
  session: TeamSessionPayload,
  criterionScoreId: number,
): Promise<NoteTarget | null> {
  const [row] = (await db`
    SELECT cs.id, cs.analysis_id, cs.ai_score
    FROM criterion_scores cs
    JOIN analyses a ON a.id = cs.analysis_id
    JOIN submissions s ON s.id = a.submission_id
    WHERE cs.id = ${criterionScoreId}
      AND EXISTS (
        SELECT 1 FROM teams t
        WHERE t.id = ${session.teamId} AND t.admin_email = ${session.adminEmail}
        UNION ALL
        SELECT 1 FROM team_coaches tc
        WHERE tc.team_id = ${session.teamId} AND tc.email = ${session.adminEmail}
      )
      AND (
        EXISTS (
          SELECT 1 FROM team_players tp
          WHERE tp.id = s.team_player_id AND tp.team_id = ${session.teamId}
        )
        OR EXISTS (
          SELECT 1 FROM team_memberships tm
          WHERE tm.team_id = ${session.teamId} AND tm.user_id = s.user_id
        )
      )
  `) as unknown as [NoteTarget | undefined]
  return row ?? null
}

/** Confirms a criterion score exists — the admin may annotate any analysis. */
export async function resolveAdminNoteTarget(criterionScoreId: number): Promise<NoteTarget | null> {
  const [row] = (await db`
    SELECT id, analysis_id, ai_score FROM criterion_scores WHERE id = ${criterionScoreId}
  `) as unknown as [NoteTarget | undefined]
  return row ?? null
}

/**
 * Player accounts that are really the owner coaching in person. He runs
 * sessions through his own login, so that account writes owner-level notes
 * rather than being treated as a player. Comma-separated override available
 * without a deploy.
 */
const OWNER_ACCOUNT_EMAILS = (process.env.OWNER_ACCOUNT_EMAILS ?? 'learnhoops8@gmail.com')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

/** Who is writing, and under which team the note is filed. */
export type NoteAuthor =
  | { authorType: 'admin'; teamId: null; authorEmail: string }
  | { authorType: 'coach'; teamId: string; authorEmail: string }

async function isAdminCookie(): Promise<boolean> {
  const store = await cookies()
  return store.get('admin_auth')?.value === process.env.ADMIN_PASSWORD
}

/**
 * Decides whether the current viewer may annotate a given analysis, checking
 * every session kind: the admin cookie, an owner player account, a team coach,
 * or an org admin whose organization owns one of the player's teams.
 *
 * Used by the results page to decide whether to render editors at all, and by
 * the write endpoint to authorize each save. Returns null for players viewing
 * their own report and for anyone holding only a share link.
 */
export async function resolveNoteAuthorForAnalysis(analysisId: number): Promise<NoteAuthor | null> {
  if (await isAdminCookie()) {
    return { authorType: 'admin', teamId: null, authorEmail: 'owner' }
  }

  // The owner's own player account — annotates as the owner, any analysis.
  const player = await getSession()
  if (player && OWNER_ACCOUNT_EMAILS.includes(player.email.toLowerCase())) {
    return { authorType: 'admin', teamId: null, authorEmail: player.email.toLowerCase() }
  }

  const team = await getTeamSession()
  if (team) {
    const [ok] = (await db`
      SELECT 1 AS ok
      FROM analyses a
      JOIN submissions s ON s.id = a.submission_id
      WHERE a.id = ${analysisId}
        AND EXISTS (
          SELECT 1 FROM teams t
          WHERE t.id = ${team.teamId} AND t.admin_email = ${team.adminEmail}
          UNION ALL
          SELECT 1 FROM team_coaches tc
          WHERE tc.team_id = ${team.teamId} AND tc.email = ${team.adminEmail}
        )
        AND (
          s.team_id = ${team.teamId}
          OR EXISTS (
            SELECT 1 FROM team_players tp
            WHERE tp.id = s.team_player_id AND tp.team_id = ${team.teamId}
          )
          OR EXISTS (
            SELECT 1 FROM team_memberships tm
            WHERE tm.team_id = ${team.teamId} AND tm.user_id = s.user_id
          )
        )
    `) as unknown as [{ ok: number } | undefined]
    if (ok) return { authorType: 'coach', teamId: team.teamId, authorEmail: team.adminEmail }
    return null
  }

  const org = await getOrgSession()
  if (org) {
    // File the note under whichever of the org's teams this player belongs to.
    const [row] = (await db`
      SELECT t.id AS team_id
      FROM analyses a
      JOIN submissions s ON s.id = a.submission_id
      JOIN teams t ON t.organization_id = ${org.orgId}
      WHERE a.id = ${analysisId}
        AND (
          s.team_id = t.id
          OR EXISTS (
            SELECT 1 FROM team_players tp
            WHERE tp.id = s.team_player_id AND tp.team_id = t.id
          )
          OR EXISTS (
            SELECT 1 FROM team_memberships tm
            WHERE tm.team_id = t.id AND tm.user_id = s.user_id
          )
        )
      ORDER BY t.created_at ASC
      LIMIT 1
    `) as unknown as [{ team_id: string } | undefined]
    if (row) return { authorType: 'coach', teamId: row.team_id, authorEmail: org.adminEmail }
    return null
  }

  return null
}

/** Same decision, reached from a criterion id (the write path). */
export async function resolveNoteAuthorForCriterion(
  criterionScoreId: number,
): Promise<{ author: NoteAuthor; target: NoteTarget } | null> {
  const target = await resolveAdminNoteTarget(criterionScoreId)
  if (!target) return null
  const author = await resolveNoteAuthorForAnalysis(target.analysis_id)
  if (!author) return null
  return { author, target }
}

/**
 * Snaps to the 0.5 grid the rubric uses and range-checks. Returns undefined
 * for an invalid value so callers can distinguish it from a deliberate null
 * (note-only). DECIMAL(4,1) would otherwise silently round 7.25 on the way in.
 */
export function normalizeSuggestedScore(raw: unknown): number | null | undefined {
  if (raw === null || raw === undefined || raw === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0 || n > 10) return undefined
  return Math.round(n * 2) / 2
}

/**
 * Strips control characters (keeping tab and newline), trims, and caps length.
 * Uses a codepoint filter rather than a regex so no literal control bytes end
 * up in this source file.
 */
export function normalizeNote(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const cleaned = Array.from(raw)
    .filter((ch) => {
      const c = ch.codePointAt(0) ?? 0
      return c === 9 || c === 10 || (c >= 32 && c !== 127)
    })
    .join('')
    .trim()
  return cleaned ? cleaned.slice(0, MAX_NOTE_LENGTH) : null
}

/**
 * Replaces the author's live note for a criterion: the previous version is
 * tombstoned rather than updated, so every edit keeps its own authorship and
 * a retraction is reversible. Status resets to 'pending' — an edit made after
 * the owner accepted the previous version must be reviewed again.
 */
export async function saveNote(params: {
  criterionScoreId: number
  authorType: 'coach' | 'admin'
  teamId: string | null
  authorEmail: string
  suggestedScore: number | null
  note: string | null
}) {
  const { criterionScoreId, authorType, teamId, authorEmail, suggestedScore, note } = params
  return db.begin(async (sql) => {
    // IS NOT DISTINCT FROM matches the admin row, where team_id is NULL.
    await sql`
      UPDATE coach_notes SET deleted_at = NOW()
      WHERE criterion_score_id = ${criterionScoreId}
        AND team_id IS NOT DISTINCT FROM ${teamId}
        AND deleted_at IS NULL
    `
    const [inserted] = await sql`
      INSERT INTO coach_notes
        (criterion_score_id, author_type, team_id, author_email, suggested_score, note)
      VALUES
        (${criterionScoreId}, ${authorType}, ${teamId}, ${authorEmail}, ${suggestedScore}, ${note})
      RETURNING id, criterion_score_id, suggested_score, note, status, created_at
    `
    return inserted
  })
}

/** Retracts the author's live note. False when there was nothing to remove. */
export async function deleteNote(criterionScoreId: number, teamId: string | null): Promise<boolean> {
  const removed = await db`
    UPDATE coach_notes SET deleted_at = NOW()
    WHERE criterion_score_id = ${criterionScoreId}
      AND team_id IS NOT DISTINCT FROM ${teamId}
      AND deleted_at IS NULL
    RETURNING id
  `
  return removed.length > 0
}

/**
 * What the PLAYER sees. This type has no email field on purpose: it is the
 * only shape the public report ever receives, so a coach's address cannot leak
 * onto a page whose access control is just an unguessable token.
 */
export interface PublicCoachNote {
  criterionScoreId: number
  suggestedScore: number | null
  note: string | null
  authorName: string
  teamName: string | null
}

export async function getPublicCoachNotes(
  analysisId: number,
): Promise<Map<number, PublicCoachNote[]>> {
  const rows = (await db`
    SELECT
      cn.criterion_score_id,
      cn.suggested_score,
      cn.note,
      t.name AS team_name,
      COALESCE(
        NULLIF(tc.nickname, ''),
        -- teams.coach_nickname names the HEAD coach only; using it for an
        -- assistant would misattribute the note.
        CASE WHEN t.admin_email = cn.author_email THEN NULLIF(t.coach_nickname, '') END,
        'Coach'
      ) AS author_name
    FROM coach_notes cn
    JOIN criterion_scores cs ON cs.id = cn.criterion_score_id
    LEFT JOIN teams t ON t.id = cn.team_id
    -- LATERAL + LIMIT 1 is required, not stylistic: migrate-self-coach.sql
    -- dropped the unique constraint on team_coaches.email, so a plain LEFT
    -- JOIN can fan out and render the same note twice.
    LEFT JOIN LATERAL (
      SELECT tc2.nickname FROM team_coaches tc2
      WHERE tc2.team_id = cn.team_id AND tc2.email = cn.author_email
      ORDER BY tc2.created_at ASC
      LIMIT 1
    ) tc ON true
    WHERE cs.analysis_id = ${analysisId} AND cn.deleted_at IS NULL
    ORDER BY cn.created_at ASC
  `) as unknown as Array<{
    criterion_score_id: number
    suggested_score: string | null
    note: string | null
    team_name: string | null
    author_name: string
  }>

  const byScore = new Map<number, PublicCoachNote[]>()
  for (const r of rows) {
    const list = byScore.get(r.criterion_score_id) ?? []
    list.push({
      criterionScoreId: r.criterion_score_id,
      // DECIMAL comes back from postgres.js as a string.
      suggestedScore: r.suggested_score === null ? null : Number(r.suggested_score),
      note: r.note,
      authorName: r.author_name,
      teamName: r.team_name,
    })
    byScore.set(r.criterion_score_id, list)
  }
  return byScore
}

/** The author's own live notes for an analysis, for prefilling the editor. */
export async function getOwnNotes(
  analysisId: number,
  teamId: string | null,
): Promise<Map<number, { suggestedScore: number | null; note: string | null }>> {
  const rows = (await db`
    SELECT cn.criterion_score_id, cn.suggested_score, cn.note
    FROM coach_notes cn
    JOIN criterion_scores cs ON cs.id = cn.criterion_score_id
    WHERE cs.analysis_id = ${analysisId}
      AND cn.team_id IS NOT DISTINCT FROM ${teamId}
      AND cn.deleted_at IS NULL
  `) as unknown as Array<{
    criterion_score_id: number
    suggested_score: string | null
    note: string | null
  }>
  return new Map(
    rows.map((r) => [
      r.criterion_score_id,
      {
        suggestedScore: r.suggested_score === null ? null : Number(r.suggested_score),
        note: r.note,
      },
    ]),
  )
}

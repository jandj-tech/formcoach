import { db } from './db'
import { getSession } from './auth'
import { getTeamSession } from './team-auth'
import { getOrgSession } from './org-auth'
import { resolveNoteAuthorForAnalysis } from './coach-notes'

/**
 * Personal notes on a whole analysis.
 *
 * Two audiences, one mechanism: a player jotting down what they were working
 * on, and a trainer who uploaded a shot for someone else, writing it up and
 * sending the link. A note is private until its author publishes it, at which
 * point anyone opening the report sees it.
 *
 * Like coach notes, nothing here ever reaches the grading model.
 */

export const MAX_BODY_LENGTH = 2000

export interface AnalysisNoteAuthor {
  authorKey: string
  authorLabel: string
}

export interface AnalysisNoteView {
  id: number
  criterionScoreId: number
  authorLabel: string
  body: string
  isPublic: boolean
  updatedAt: string
  /** True for the viewer's own note — only that one is editable. */
  mine: boolean
}

/** Trims control characters, collapses trailing space, and caps length. */
export function normalizeBody(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const cleaned = Array.from(raw)
    .filter((ch) => {
      const c = ch.codePointAt(0) ?? 0
      return c === 9 || c === 10 || (c >= 32 && c !== 127)
    })
    .join('')
    .trim()
  return cleaned ? cleaned.slice(0, MAX_BODY_LENGTH) : null
}

/**
 * Who, if anyone, the current viewer is allowed to write a note as.
 *
 * Three ways in:
 *  - the player the analysis belongs to (their own shot, or one a trainer
 *    uploaded under their account),
 *  - the account that uploaded it, which is how a trainer using their own
 *    login gets to write up someone else's shot,
 *  - anyone already entitled to coach this analysis (team coach, org admin,
 *    or the owner) — reusing that resolver so the two features can't drift.
 *
 * Returns null for a visitor holding only a share link.
 */
export async function resolveAnalysisNoteAuthor(
  analysisId: number,
): Promise<AnalysisNoteAuthor | null> {
  const player = await getSession()
  if (player) {
    const [owns] = (await db`
      SELECT u.nickname, u.first_name, u.last_initial
      FROM analyses a
      JOIN submissions s ON s.id = a.submission_id
      JOIN users u ON u.id = ${player.userId}
      WHERE a.id = ${analysisId}
        AND (s.user_id = ${player.userId} OR LOWER(s.email) = ${player.email.toLowerCase()})
    `) as unknown as [
      { nickname: string | null; first_name: string | null; last_initial: string | null } | undefined,
    ]
    if (owns) {
      const named = owns.first_name
        ? `${owns.first_name}${owns.last_initial ? ` ${owns.last_initial}.` : ''}`
        : null
      return {
        authorKey: `user:${player.userId}`,
        // Never the email — reports are public to anyone with the token.
        authorLabel: named || owns.nickname || 'Player',
      }
    }
  }

  // Coaches, org admins and the owner: same entitlement as Coach's Notes.
  const coach = await resolveNoteAuthorForAnalysis(analysisId)
  if (coach) {
    if (coach.authorType === 'admin') {
      return { authorKey: 'admin', authorLabel: 'Coach' }
    }
    const team = await getTeamSession()
    const org = await getOrgSession()
    const [row] = (await db`
      SELECT
        COALESCE(
          NULLIF(tc.nickname, ''),
          CASE WHEN t.admin_email = ${coach.authorEmail} THEN NULLIF(t.coach_nickname, '') END,
          'Coach'
        ) AS label
      FROM teams t
      LEFT JOIN LATERAL (
        SELECT tc2.nickname FROM team_coaches tc2
        WHERE tc2.team_id = t.id AND tc2.email = ${coach.authorEmail}
        ORDER BY tc2.created_at ASC LIMIT 1
      ) tc ON true
      WHERE t.id = ${coach.teamId}
    `) as unknown as [{ label: string } | undefined]
    // Key by whichever session actually authorized, so a coach and an org
    // admin over the same team keep separate notes.
    const key = team ? `team:${coach.teamId}` : org ? `org:${org.orgId}` : `team:${coach.teamId}`
    return { authorKey: key, authorLabel: row?.label ?? 'Coach' }
  }

  return null
}

/**
 * Every note on a shot, grouped by criterion: all published ones, plus the
 * viewer's own private notes. A share-link visitor passes viewerKey = null and
 * sees only published notes.
 */
export async function getAnalysisNotes(
  analysisId: number,
  viewerKey: string | null,
): Promise<Map<number, AnalysisNoteView[]>> {
  const rows = (await db`
    SELECT id, criterion_score_id, author_key, author_label, body, is_public, updated_at
    FROM analysis_notes
    WHERE analysis_id = ${analysisId}
      AND (is_public = true OR author_key = ${viewerKey})
    ORDER BY updated_at ASC
  `) as unknown as Array<{
    id: number
    criterion_score_id: number
    author_key: string
    author_label: string
    body: string
    is_public: boolean
    updated_at: string
  }>

  const byCriterion = new Map<number, AnalysisNoteView[]>()
  for (const r of rows) {
    const list = byCriterion.get(r.criterion_score_id) ?? []
    list.push({
      id: r.id,
      criterionScoreId: r.criterion_score_id,
      authorLabel: r.author_label,
      body: r.body,
      isPublic: r.is_public,
      updatedAt: r.updated_at,
      mine: viewerKey !== null && r.author_key === viewerKey,
    })
    byCriterion.set(r.criterion_score_id, list)
  }
  return byCriterion
}

/** Creates or replaces this author's note for one criterion. */
export async function saveAnalysisNote(params: {
  analysisId: number
  criterionScoreId: number
  author: AnalysisNoteAuthor
  body: string
  isPublic: boolean
}) {
  const { analysisId, criterionScoreId, author, body, isPublic } = params
  const [row] = (await db`
    INSERT INTO analysis_notes
      (analysis_id, criterion_score_id, author_key, author_label, body, is_public)
    VALUES
      (${analysisId}, ${criterionScoreId}, ${author.authorKey}, ${author.authorLabel}, ${body}, ${isPublic})
    ON CONFLICT (criterion_score_id, author_key) DO UPDATE
      SET body = EXCLUDED.body,
          is_public = EXCLUDED.is_public,
          author_label = EXCLUDED.author_label,
          updated_at = NOW()
    RETURNING id, body, is_public, updated_at
  `) as unknown as [{ id: number; body: string; is_public: boolean; updated_at: string }]
  return row
}

export async function deleteAnalysisNote(
  criterionScoreId: number,
  authorKey: string,
): Promise<boolean> {
  const removed = await db`
    DELETE FROM analysis_notes
    WHERE criterion_score_id = ${criterionScoreId} AND author_key = ${authorKey}
    RETURNING id
  `
  return removed.length > 0
}

/** Resolves the analysis a criterion belongs to, for write-path scoping. */
export async function analysisIdForCriterion(criterionScoreId: number): Promise<number | null> {
  const [row] = (await db`
    SELECT analysis_id FROM criterion_scores WHERE id = ${criterionScoreId}
  `) as unknown as [{ analysis_id: number } | undefined]
  return row?.analysis_id ?? null
}

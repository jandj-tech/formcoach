import { isCleanDisplayText, BLOCKED_TEXT_ERROR } from '@/lib/moderation'
import {
  isTrainingActivityType,
  TRAINING_BACKDATE_DAYS,
  TRAINING_MAX_MINUTES,
  TRAINING_NOTE_MAX_CHARS,
  type TrainingActivityType,
} from '@/lib/player-plans'

/**
 * Validation for manual training-log entries, shared by POST /api/my/training
 * and PATCH /api/my/training/[id] so create and edit cannot drift.
 */

export interface TrainingInput {
  activityType: TrainingActivityType
  durationMinutes: number
  activityDate: string
  note: string | null
}

/**
 * Dates are calendar dates (YYYY-MM-DD, UTC): today or up to
 * TRAINING_BACKDATE_DAYS back — recent corrections yes, rewriting a season of
 * history (and the consistency score with it) no.
 */
export function parseTrainingInput(body: unknown): { input: TrainingInput } | { error: string } {
  const b = body as Record<string, unknown> | null
  const activityType = b?.activityType ?? b?.type
  if (!isTrainingActivityType(activityType)) {
    return { error: 'Pick an activity type' }
  }

  const durationMinutes = Number(b?.durationMinutes)
  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 1 ||
    durationMinutes > TRAINING_MAX_MINUTES
  ) {
    return { error: `Duration must be between 1 minute and ${TRAINING_MAX_MINUTES / 60} hours` }
  }

  const rawDate = typeof b?.activityDate === 'string' ? b.activityDate : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    return { error: 'Invalid date' }
  }
  const date = new Date(`${rawDate}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== rawDate) {
    return { error: 'Invalid date' }
  }
  // "Today" is judged one day generously: a player ahead of UTC (evening in
  // NZ is already tomorrow there) must be able to log their local today.
  const maxDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const floor = new Date(Date.now() - TRAINING_BACKDATE_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
  if (rawDate > maxDate) return { error: 'That date is in the future' }
  if (rawDate < floor) {
    return { error: `Entries can be dated up to ${TRAINING_BACKDATE_DAYS} days back` }
  }

  let note: string | null = null
  if (typeof b?.note === 'string' && b.note.trim().length > 0) {
    note = b.note.trim()
    if (note.length > TRAINING_NOTE_MAX_CHARS) {
      return { error: `Notes max ${TRAINING_NOTE_MAX_CHARS} characters` }
    }
    if (!isCleanDisplayText(note)) return { error: BLOCKED_TEXT_ERROR }
  }

  return { input: { activityType, durationMinutes, activityDate: rawDate, note } }
}

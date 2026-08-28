import { randomInt } from 'crypto'
import { db } from '@/lib/db'

// Ambiguous glyphs are left out on purpose: these codes get read aloud in a
// gym and typed by twelve-year-olds, so no O/0, I/1, or Z/2 confusion.
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const LENGTH = 8

/**
 * A random 8-character access code.
 *
 * randomInt, not Math.random: an access code is a bearer credential — it lets
 * an anonymous player spend a coach's credits — and Math.random is predictable
 * from prior outputs.
 */
export function generateAccessCode(): string {
  let code = ''
  for (let i = 0; i < LENGTH; i++) {
    code += CHARS[randomInt(CHARS.length)]
  }
  return code
}

/**
 * A code that no row in `organizations` or `teams` already holds.
 *
 * Both tables are checked regardless of which one the caller is inserting
 * into. The two code spaces are separate in the schema but not in a user's
 * head — someone handed a code types it into whichever box is in front of
 * them, and a collision across the two would send them to the wrong place.
 *
 * Falls back to an unchecked code after `attempts` tries rather than throwing:
 * with 32^8 (~1.1 trillion) possibilities, exhausting the attempts means the
 * database is unreachable, and failing the whole signup over a uniqueness
 * check that the column's own constraint will catch is the worse trade.
 */
export async function generateUniqueAccessCode(attempts = 10): Promise<string> {
  for (let i = 0; i < attempts; i++) {
    const code = generateAccessCode()
    try {
      const rows = (await db`
        SELECT 1 FROM organizations WHERE access_code = ${code}
        UNION ALL
        SELECT 1 FROM teams WHERE access_code = ${code}
        LIMIT 1
      `) as unknown as unknown[]
      if (rows.length === 0) return code
    } catch (err) {
      console.error('[access-code] collision check failed, using unchecked code:', err)
      return code
    }
  }
  return generateAccessCode()
}

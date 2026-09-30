// Minimal user-generated-content filter (App Store guideline 1.2): blocks
// obvious profanity/slurs in user-chosen display text (nicknames, player
// names, team names). Deliberately small and conservative — display text is
// short, so substring matching with common leet substitutions is enough.

const BLOCKED = [
  'fuck', 'fuk', 'fck', 'shit', 'sh1t', 'bitch', 'b1tch', 'cunt', 'twat',
  'asshole', 'a55hole', 'dick', 'd1ck', 'cock', 'pussy', 'pu55y', 'whore',
  'slut', 'fag', 'f4g', 'dyke', 'nigger', 'n1gger', 'nigga', 'n1gga',
  'chink', 'spic', 'kike', 'wetback', 'retard', 'r3tard', 'rape', 'nazi',
  'hitler', 'kys', 'porn', 'penis', 'vagina', 'blowjob', 'handjob',
]

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[@]/g, 'a')
    .replace(/[0]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[4]/g, 'a')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[^a-z]/g, '')
}

/** True when the text is acceptable as user-visible display text. */
export function isCleanDisplayText(text: string): boolean {
  const normalized = normalize(text)
  return !BLOCKED.some(word => normalized.includes(normalize(word)))
}

/** Standard error message for rejected display text. */
export const BLOCKED_TEXT_ERROR = 'That name contains language we don\'t allow. Please choose something else.'

// Invisible characters that can hide or reorder text: C0/C1 controls, and
// format characters (zero-width space/joiners, BOM, soft hyphen, bidi
// embeddings/overrides/isolates, word joiner).
const INVISIBLE_RE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu
// Characters that only matter to HTML/markdown renderers. No real name needs them.
const MARKUP_RE = /[<>`]/

/** Error shown when display text contains markup characters. */
export const MARKUP_TEXT_ERROR = 'Names can only use letters, numbers, spaces and simple punctuation like - \' . Please remove any other symbols and try again.'

/**
 * Normalises and validates user-chosen display text (player, coach, team and
 * organization names, nicknames) at the point it is saved:
 * NFC-normalise → turn tabs/newlines into spaces → strip control, zero-width
 * and bidi characters → reject `<`, `>` and backtick → collapse whitespace →
 * trim → cap at `max` characters → profanity check.
 *
 * Accents, apostrophes, hyphens and emoji are all kept ("Zoë O'Neil-Smith").
 * An empty result is an error; callers that allow clearing a field should
 * handle the empty case before calling.
 */
export function cleanDisplayText(
  raw: string,
  max: number
): { ok: true; value: string } | { ok: false; error: string } {
  const text = String(raw ?? '')
    .normalize('NFC')
    .replace(/[\t\n\r\v\f\u0085\p{Zl}\p{Zp}]/gu, ' ')
    .replace(INVISIBLE_RE, '')
  if (MARKUP_RE.test(text)) return { ok: false, error: MARKUP_TEXT_ERROR }
  const collapsed = text.replace(/\s+/g, ' ').trim()
  // Cap by code point so an emoji is never cut in half.
  const value = Array.from(collapsed).slice(0, Math.max(1, Math.floor(max))).join('').trim()
  if (!value) return { ok: false, error: 'Please enter a name.' }
  if (!isCleanDisplayText(value)) return { ok: false, error: BLOCKED_TEXT_ERROR }
  return { ok: true, value }
}

/**
 * Same as cleanDisplayText for an optional field: a missing, non-string or
 * blank value is `{ ok: true, value: null }` (so the field can be cleared);
 * anything else must pass cleanDisplayText.
 */
export function cleanOptionalDisplayText(
  raw: unknown,
  max: number
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (typeof raw !== 'string') return { ok: true, value: null }
  // Blank after stripping invisible characters counts as "cleared" too.
  if (!raw.replace(INVISIBLE_RE, '').trim()) return { ok: true, value: null }
  return cleanDisplayText(raw, max)
}

/** Title-cases the first code point of a cleaned name ("zoë" → "Zoë"). */
export function capitalizeFirst(value: string): string {
  const [first = '', ...rest] = Array.from(value)
  return first.toUpperCase() + rest.join('')
}

/** Error shown when a last initial / last name doesn't start with a letter. */
export const LAST_INITIAL_ERROR = 'The last initial must be a letter. Please check it and try again.'

/**
 * One uppercase character for a CHAR(1) last-initial column. Takes the first
 * code point and uppercases it, then keeps only the first code point of the
 * result — "ß" uppercases to "SS", which used to overflow CHAR(1) and 500.
 * '' when there is nothing usable.
 */
export function upperInitial(value: string | null | undefined): string {
  const [first = ''] = Array.from(String(value ?? '').normalize('NFC').trim())
  if (!first) return ''
  const [upper = ''] = Array.from(first.toUpperCase())
  return /^\p{L}$/u.test(upper) ? upper : first
}

/**
 * The stored last initial from user-typed text (a last initial or a full last
 * name, already through cleanDisplayText): its first character, which must be
 * a letter, as a single uppercase character.
 */
export function lastInitialFromText(value: string): { ok: true; value: string } | { ok: false; error: string } {
  const [first = ''] = Array.from(value.normalize('NFC').trim())
  if (!/^\p{L}$/u.test(first)) return { ok: false, error: LAST_INITIAL_ERROR }
  return { ok: true, value: upperInitial(first) }
}

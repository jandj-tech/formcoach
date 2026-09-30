// Tiny dependency-free CSV parser + a header mapper for player-roster imports.
// Handles quoted fields, escaped quotes ("") and both \n and \r\n line endings.

/**
 * Parses CSV text into records, keeping blank records so a record's position
 * matches the row number a spreadsheet shows (row 1 = the first line).
 */
export function parseCsvRecords(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const s = text.replace(/^﻿/, '') // strip BOM

  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(field); field = ''
      rows.push(row); row = []
    } else {
      field += c
    }
  }
  // Flush trailing field/row unless the file ended on a clean newline.
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}

function isBlankRecord(r: string[]): boolean {
  return !r.some(cell => cell.trim() !== '')
}

/** Parsed records with fully-empty rows (blank lines) dropped. */
export function parseCsv(text: string): string[][] {
  return parseCsvRecords(text).filter(r => !isBlankRecord(r))
}

export interface PlayerImportRow {
  /** The row number in the original file, as a spreadsheet shows it (header = 1). */
  rowNumber: number
  firstName: string
  lastName: string
  parentName: string
  email: string
  phone: string
  teamName: string
}

// Which header names map to which field. Forgiving of spacing/case/synonyms so
// a coach's own spreadsheet just works.
const HEADER_ALIASES: Record<Exclude<keyof PlayerImportRow, 'rowNumber'>, string[]> = {
  firstName: ['first name', 'firstname', 'first', 'player first name', 'player'],
  lastName: ['last name', 'lastname', 'last', 'surname', 'player last name'],
  parentName: ['parent name', 'parent', 'guardian', 'parent/guardian', 'guardian name'],
  email: ['email', 'email address', 'e-mail', 'parent email', 'contact email'],
  phone: ['phone', 'phone number', 'mobile', 'cell', 'contact phone', 'telephone'],
  teamName: ['team name', 'team'],
}
type Field = keyof typeof HEADER_ALIASES

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Normalises a team name for matching: trimmed, case-insensitive, single spaces. */
export function normTeamName(s: string | null | undefined): string {
  return norm(s ?? '')
}

export interface MappedCsv {
  rows: PlayerImportRow[]
  /** Header names we couldn't place (as written in the file), for a gentle warning. */
  unmapped: string[]
  hasHeader: boolean
  /** True when the file had a Team column. */
  hasTeamColumn: boolean
}

// Maps parsed CSV records to player rows. If the first line looks like a
// header we use it; otherwise we assume a fixed column order:
// first, last, parent, email, phone, [team].
//
// Every non-blank row is kept — including ones with no first name or a bad
// email — so the preview can show them and let the person fix them. Use
// importRowProblem() to find the ones that need fixing.
export function mapPlayerCsv(grid: string[][]): MappedCsv {
  const numbered = grid.map((cells, i) => ({ cells, rowNumber: i + 1 })).filter(r => !isBlankRecord(r.cells))
  if (numbered.length === 0) return { rows: [], unmapped: [], hasHeader: false, hasTeamColumn: false }

  const rawHeader = numbered[0].cells
  const header = rawHeader.map(norm)
  const col: Partial<Record<Field, number>> = {}
  const used = new Set<number>()
  ;(Object.keys(HEADER_ALIASES) as Field[]).forEach((field) => {
    const idx = header.findIndex((h, i) => !used.has(i) && HEADER_ALIASES[field].includes(h))
    if (idx >= 0) { col[field] = idx; used.add(idx) }
  })

  const hasHeader = Object.keys(col).length >= 2 // needs at least a couple of recognised columns
  const unmapped = hasHeader
    ? rawHeader.map(h => h.trim()).filter((h, i) => !used.has(i) && h !== '')
    : []

  const dataRows = hasHeader ? numbered.slice(1) : numbered
  const pick = (r: string[], field: Field, fallbackIdx: number): string => {
    const idx = hasHeader ? col[field] : fallbackIdx
    return idx === undefined ? '' : (r[idx] ?? '').trim()
  }

  const rows: PlayerImportRow[] = dataRows.map(({ cells, rowNumber }) => ({
    rowNumber,
    firstName: pick(cells, 'firstName', 0),
    lastName: pick(cells, 'lastName', 1),
    parentName: pick(cells, 'parentName', 2),
    email: pick(cells, 'email', 3),
    phone: pick(cells, 'phone', 4),
    teamName: pick(cells, 'teamName', 5),
  }))

  const hasTeamColumn = hasHeader ? col.teamName !== undefined : rows.some(r => r.teamName !== '')
  return { rows, unmapped, hasHeader, hasTeamColumn }
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
}

/**
 * Why a row can't be imported as written, in plain words — or null when it is
 * fine. Shared by the preview (client) and the import routes (server).
 */
// Characters names can't contain (the server rejects them too — see
// cleanDisplayText in lib/moderation.ts). Checked here so the preview can
// point at the cell before anything is sent.
const NAME_MARKUP_RE = /[<>`]/

/** Which name cell holds a character names can't contain, or null. */
export function nameMarkupField(r: { firstName?: string | null; lastName?: string | null; parentName?: string | null }): 'first name' | 'last name' | 'parent name' | null {
  if (NAME_MARKUP_RE.test(r.firstName ?? '')) return 'first name'
  if (NAME_MARKUP_RE.test(r.lastName ?? '')) return 'last name'
  if (NAME_MARKUP_RE.test(r.parentName ?? '')) return 'parent name'
  return null
}

export function importRowProblem(r: { firstName?: string | null; lastName?: string | null; parentName?: string | null; email?: string | null }): string | null {
  if (!(r.firstName ?? '').trim()) return 'Add a first name.'
  const markup = nameMarkupField(r)
  if (markup) return `The ${markup} can only use letters, numbers, spaces and simple punctuation like - ' . Please remove any other symbols.`
  const email = (r.email ?? '').trim()
  if (email && !isValidEmail(email)) {
    return 'This email doesn’t look right (check for a typo or a missing .com). Or clear it to add the player without an email.'
  }
  return null
}

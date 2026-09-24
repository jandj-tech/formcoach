// Tiny dependency-free CSV parser + a header mapper for player-roster imports.
// Handles quoted fields, escaped quotes ("") and both \n and \r\n line endings.

export function parseCsv(text: string): string[][] {
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
  // Drop fully-empty rows (blank lines).
  return rows.filter(r => r.some(cell => cell.trim() !== ''))
}

export interface PlayerImportRow {
  firstName: string
  lastName: string
  parentName: string
  email: string
  phone: string
  teamName: string
}

// Which header names map to which field. Forgiving of spacing/case/synonyms so
// a coach's own spreadsheet just works.
const HEADER_ALIASES: Record<keyof PlayerImportRow, string[]> = {
  firstName: ['first name', 'firstname', 'first', 'player first name', 'player'],
  lastName: ['last name', 'lastname', 'last', 'surname', 'player last name'],
  parentName: ['parent name', 'parent', 'guardian', 'parent/guardian', 'guardian name'],
  email: ['email', 'email address', 'e-mail', 'parent email', 'contact email'],
  phone: ['phone', 'phone number', 'mobile', 'cell', 'contact phone', 'telephone'],
  teamName: ['team name', 'team'],
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

export interface MappedCsv {
  rows: PlayerImportRow[]
  /** Header names we couldn't place, for a gentle warning. */
  unmapped: string[]
  hasHeader: boolean
}

// Maps a parsed CSV to player rows. If the first line looks like a header we
// use it; otherwise we assume a fixed column order:
// first, last, parent, email, phone, [team].
export function mapPlayerCsv(grid: string[][]): MappedCsv {
  if (grid.length === 0) return { rows: [], unmapped: [], hasHeader: false }

  const header = grid[0].map(norm)
  const col: Partial<Record<keyof PlayerImportRow, number>> = {}
  const used = new Set<number>()
  ;(Object.keys(HEADER_ALIASES) as Array<keyof PlayerImportRow>).forEach((field) => {
    const idx = header.findIndex((h, i) => !used.has(i) && HEADER_ALIASES[field].includes(h))
    if (idx >= 0) { col[field] = idx; used.add(idx) }
  })

  const hasHeader = Object.keys(col).length >= 2 // needs at least a couple of recognised columns
  const unmapped = hasHeader ? header.filter((_, i) => !used.has(i) && header[i] !== '') : []

  const dataRows = hasHeader ? grid.slice(1) : grid
  const pick = (r: string[], field: keyof PlayerImportRow, fallbackIdx: number): string => {
    const idx = hasHeader ? col[field] : fallbackIdx
    return idx === undefined ? '' : (r[idx] ?? '').trim()
  }

  const rows: PlayerImportRow[] = dataRows.map((r) => ({
    firstName: pick(r, 'firstName', 0),
    lastName: pick(r, 'lastName', 1),
    parentName: pick(r, 'parentName', 2),
    email: pick(r, 'email', 3),
    phone: pick(r, 'phone', 4),
    teamName: pick(r, 'teamName', 5),
  })).filter(r => r.firstName || r.email)

  return { rows, unmapped, hasHeader }
}

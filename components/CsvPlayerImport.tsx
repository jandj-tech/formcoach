'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangleIcon, CheckIcon, CopyIcon, FileSpreadsheetIcon, XIcon } from 'lucide-react'
import { parseCsvRecords, mapPlayerCsv, importRowProblem, nameMarkupField, normTeamName, type PlayerImportRow } from '@/lib/csv'
import { backendButton } from '@/components/backend/button-styles'
import { copyToClipboard } from '@/lib/copy'

// ── Shared pieces (also used by the org-level multi-team import) ──────────

export interface RowOutcome {
  status: string
  detail?: string
  warning?: string
  inviteUrl?: string
  nameMatch?: boolean
  /** Its own account, on an email a sibling's account also uses. */
  sharedEmail?: boolean
}

export interface EditableRow extends PlayerImportRow {
  key: string
  removed?: boolean
  /** Set when the row was deliberately left out (e.g. it names another team). */
  skippedReason?: string
  allowDuplicateName?: boolean
  /** Being fixed by hand: keep its cells editable even once the value is valid. */
  fixing?: boolean
  outcome?: RowOutcome
}

const DONE = new Set(['created', 'linked', 'invited', 'already_on_team'])

/** The row went through (added, invited, or already there) — nothing left to do. */
export function rowIsDone(r: EditableRow): boolean {
  return !!r.outcome && DONE.has(r.outcome.status)
}

/** What needs fixing before this row can be imported, or null. */
export function rowProblem(r: EditableRow): string | null {
  if (r.outcome?.status === 'error') return r.outcome.detail || 'Could not add this player.'
  return importRowProblem(r)
}

/**
 * Rows that repeat an earlier row of the same file (same team, first name,
 * last name and email, ignoring case and spacing) → that earlier row's
 * number. The server would skip them as "Same player as row N"; saying so in
 * the preview is kinder than after the import.
 */
export function inFileDuplicates(rows: EditableRow[]): Map<string, number> {
  const first = new Map<string, number>()
  const out = new Map<string, number>()
  const n = (v: string | null | undefined) => (v ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
  for (const r of rows) {
    if (r.removed || r.skippedReason || !n(r.firstName)) continue
    const key = [normTeamName(r.teamName), n(r.firstName), n(r.lastName), n(r.email)].join('|')
    const at = first.get(key)
    if (at === undefined) first.set(key, r.rowNumber)
    else if (!rowIsDone(r)) out.set(r.key, at)
  }
  return out
}

/**
 * Rows whose email another row of the file uses for a child with a different
 * first name (brothers and sisters sharing a parent's address) → the preview
 * note, e.g. "Harper gets their own account (shares Dave Smith’s email)".
 * Each child still gets their own account and their own setup email.
 */
export function familyEmailNotes(rows: EditableRow[]): Map<string, string> {
  const n = (v: string | null | undefined) => (v ?? '').trim().replace(/\s+/g, ' ')
  const byEmail = new Map<string, EditableRow[]>()
  for (const r of rows) {
    const e = n(r.email).toLowerCase()
    if (r.removed || r.skippedReason || !e || !n(r.firstName) || importRowProblem(r)) continue
    byEmail.set(e, [...(byEmail.get(e) ?? []), r])
  }
  const out = new Map<string, string>()
  for (const group of byEmail.values()) {
    const firsts = new Set(group.map(r => n(r.firstName).toLowerCase()))
    if (firsts.size < 2) continue
    const parent = group.map(r => n(r.parentName)).find(Boolean)
    for (const r of group) {
      const first = n(r.firstName)
      const others = Array.from(new Set(
        group.filter(o => n(o.firstName).toLowerCase() !== first.toLowerCase()).map(o => n(o.firstName)),
      ))
      out.set(r.key, parent
        ? `${first} gets their own account (shares ${parent}’s email)`
        : `${first} gets their own account (shares an email with ${others.join(' and ')})`)
    }
  }
  return out
}

/** Per-cell problems, so only the wrong cell is marked. */
export function fieldProblems(r: EditableRow): { firstName: boolean; lastName: boolean; parentName: boolean; email: boolean } {
  const email = r.email.trim()
  return {
    firstName: !r.firstName.trim() || nameMarkupField({ firstName: r.firstName }) !== null,
    lastName: nameMarkupField({ lastName: r.lastName }) !== null,
    parentName: nameMarkupField({ parentName: r.parentName }) !== null,
    email: !!email && importRowProblem({ firstName: 'x', email }) !== null,
  }
}

/** Rows still to send: not done, not removed, not skipped, valid, and not a repeat. */
export function rowsToSend(rows: EditableRow[]): EditableRow[] {
  const dups = inFileDuplicates(rows)
  return rows.filter(r => !r.removed && !r.skippedReason && !rowIsDone(r) && !importRowProblem(r) && !dups.has(r.key))
}

export function readRosterFile(text: string): { rows: EditableRow[]; unmapped: string[]; hasTeamColumn: boolean } {
  const mapped = mapPlayerCsv(parseCsvRecords(text))
  return {
    rows: mapped.rows.map(r => ({ ...r, key: `r${r.rowNumber}` })),
    unmapped: mapped.unmapped,
    hasTeamColumn: mapped.hasTeamColumn,
  }
}

/**
 * Sends rows to an import endpoint and returns the rows with outcomes filled
 * in. Throws with a plain-language message when the whole request fails.
 */
export async function postImportRows(
  endpoint: string,
  extra: Record<string, unknown>,
  batch: EditableRow[],
  sendEmail: boolean,
): Promise<Map<string, RowOutcome>> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...extra,
      sendEmail,
      rows: batch.map(r => ({
        rowNumber: r.rowNumber,
        firstName: r.firstName.trim(),
        lastName: r.lastName.trim() || undefined,
        email: r.email.trim() || undefined,
        parentName: r.parentName.trim() || undefined,
        phone: r.phone.trim() || undefined,
        allowDuplicateName: r.allowDuplicateName || undefined,
      })),
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'The import didn’t go through. Please try again.')
  const out = new Map<string, RowOutcome>()
  const results = (data.results ?? []) as Array<RowOutcome & { index: number }>
  for (const r of results) {
    const row = batch[r.index]
    if (row) out.set(row.key, { status: r.status, detail: r.detail, warning: r.warning, inviteUrl: r.inviteUrl, nameMatch: r.nameMatch, sharedEmail: r.sharedEmail })
  }
  return out
}

export function countOutcomes(rows: EditableRow[]) {
  const live = rows.filter(r => !r.removed)
  const dups = inFileDuplicates(live)
  return {
    repeats: dups.size,
    added: live.filter(r => r.outcome && ['created', 'linked', 'invited'].includes(r.outcome.status)).length,
    already: live.filter(r => r.outcome?.status === 'already_on_team').length,
    needsFix: live.filter(r => !r.skippedReason && !rowIsDone(r) && !!rowProblem(r)).length,
    ready: rowsToSend(live).length,
  }
}

function StatusCell({ row, sameAs, family, onAddAnyway }: { row: EditableRow; sameAs?: number; family?: string; onAddAnyway?: () => void }) {
  const [copied, setCopied] = useState(false)
  const o = row.outcome
  const copy = (url: string) =>
    copyToClipboard(url, 'Invite link copied!').then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })

  if (row.skippedReason) {
    return <span className="text-gray-500 dark:text-chalk-dim">Left out: {row.skippedReason}</span>
  }
  if (sameAs !== undefined && !o) {
    return (
      <span className="text-gray-600 dark:text-chalk-dim">
        <strong className="font-semibold">Same as row {sameAs}</strong> — only imported once. Remove this row, or edit it if it&rsquo;s a different player.
      </span>
    )
  }
  const problem = rowProblem(row)
  if (!o || o.status === 'error') {
    if (problem) {
      return <span className="text-red-600 dark:text-red-400"><strong className="font-semibold">Needs fixing:</strong> {problem}</span>
    }
    return (
      <span className="text-gray-500 dark:text-chalk-dim">
        {o?.status === 'error' ? 'Fixed — ready to import' : 'Ready'}
        {family && <span className="block">{family}</span>}
      </span>
    )
  }

  const label =
    o.status === 'created' && o.sharedEmail ? 'Added — own account, family email'
      : o.status === 'created' || o.status === 'linked' ? 'Added'
        : o.status === 'invited' ? 'Invited'
          : o.status === 'already_on_team' ? 'Already on team'
            : o.status
  const tone =
    o.status === 'already_on_team' ? 'text-gray-600 dark:text-chalk-dim'
      : 'text-green-700 dark:text-green-400'

  return (
    <div className="space-y-0.5">
      <p className={`font-semibold ${tone}`}>{label}</p>
      {o.detail && <p className="text-gray-500 dark:text-chalk-dim">{o.detail.replace(/^Added\.\s*/, '')}</p>}
      {o.warning && (
        <p className="flex items-start gap-1 text-amber-700 dark:text-amber-400">
          <AlertTriangleIcon aria-hidden className="w-3.5 h-3.5 mt-px shrink-0" />
          <span>{o.warning}</span>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {o.inviteUrl && (
          <button onClick={() => copy(o.inviteUrl!)} className="inline-flex items-center gap-1 font-semibold text-ember-600 dark:text-ember-400 hover:text-ember-500">
            {copied ? <CheckIcon aria-hidden className="w-3.5 h-3.5" /> : <CopyIcon aria-hidden className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy invite link'}
          </button>
        )}
        {o.status === 'already_on_team' && o.nameMatch && onAddAnyway && (
          <button onClick={onAddAnyway} className="font-semibold text-ember-600 dark:text-ember-400 hover:text-ember-500">
            Add anyway (different player)
          </button>
        )}
      </div>
    </div>
  )
}

const cellInput =
  'w-full min-w-[6rem] bg-white dark:bg-ink-900 border border-red-300 dark:border-red-800 rounded-md px-2 py-1 text-xs text-black dark:text-chalk focus:outline-none focus:border-ember-500'

/**
 * Every row of the file, numbered by its row in the original spreadsheet,
 * with its outcome. Rows that need fixing can be edited in place or removed.
 */
export function ImportRowsTable({
  rows,
  onEdit,
  onRemove,
  onAddAnyway,
  showTeam = false,
  familyRows,
}: {
  rows: EditableRow[]
  /** Every row of the file, when `rows` is one team's slice of it (sibling notes span teams). */
  familyRows?: EditableRow[]
  onEdit: (key: string, patch: Partial<PlayerImportRow>) => void
  onRemove: (key: string) => void
  onAddAnyway?: (key: string) => void
  showTeam?: boolean
}) {
  const visible = rows.filter(r => !r.removed)
  const dups = inFileDuplicates(rows)
  const family = familyEmailNotes(familyRows ?? rows)
  const okCell = cellInput.replace('border-red-300 dark:border-red-800', 'border-gray-300 dark:border-courtline')
  return (
    <div className="max-h-96 overflow-auto border border-gray-200 dark:border-courtline rounded-lg">
      <table className="w-full text-xs md:table-fixed">
        <thead className="bg-gray-50 dark:bg-ink-950/60 text-gray-500 dark:text-chalk-dim sticky top-0 z-10">
          <tr>
            <th className="text-left font-semibold px-2 py-1.5 w-12">Row</th>
            {showTeam && <th className="text-left font-semibold px-2 py-1.5 md:w-28">Team</th>}
            <th className="text-left font-semibold px-2 py-1.5 md:w-32 whitespace-nowrap">First name</th>
            <th className="text-left font-semibold px-2 py-1.5 md:w-32 whitespace-nowrap">Last name</th>
            <th className="text-left font-semibold px-2 py-1.5 min-w-[11rem] md:min-w-0 md:w-52">Email</th>
            <th className="text-left font-semibold px-2 py-1.5 hidden md:table-cell md:w-28">Parent</th>
            <th className="text-left font-semibold px-2 py-1.5 min-w-[12rem] md:min-w-0">Status</th>
            <th className="px-2 py-1.5 md:w-9"><span className="sr-only">Remove</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-courtline">
          {visible.map(r => {
            const done = rowIsDone(r)
            const editable = !done && !r.skippedReason && (!!rowProblem(r) || !!r.fixing || dups.has(r.key))
            // A server error for the row (not a cell problem) leaves the cells
            // neutral; only a cell that is itself wrong is marked red.
            const bad = fieldProblems(r)
            return (
              <tr key={r.key} className={editable ? 'bg-red-50/60 dark:bg-red-950/20' : ''}>
                <td className="px-2 py-1.5 text-gray-400 dark:text-chalk-dim tabular-nums align-top">{r.rowNumber}</td>
                {showTeam && <td className="px-2 py-1.5 text-gray-600 dark:text-chalk-dim align-top">{r.teamName || '—'}</td>}
                <td className="px-2 py-1.5 align-top text-black dark:text-chalk">
                  {editable
                    ? <input aria-label={`First name, row ${r.rowNumber}`} aria-invalid={bad.firstName || undefined} value={r.firstName} placeholder="First name" onChange={e => onEdit(r.key, { firstName: e.target.value })} className={bad.firstName ? cellInput : okCell} />
                    : r.firstName || <span className="text-gray-400">&mdash;</span>}
                </td>
                <td className="px-2 py-1.5 align-top text-black dark:text-chalk">
                  {editable
                    ? <input aria-label={`Last name, row ${r.rowNumber}`} aria-invalid={bad.lastName || undefined} value={r.lastName} placeholder="Last name" onChange={e => onEdit(r.key, { lastName: e.target.value })} className={bad.lastName ? cellInput : okCell} />
                    : r.lastName || <span className="text-gray-400">&mdash;</span>}
                </td>
                <td className="px-2 py-1.5 align-top text-gray-600 dark:text-chalk-dim [overflow-wrap:anywhere]">
                  {editable
                    ? <input aria-label={`Email, row ${r.rowNumber}`} aria-invalid={bad.email || undefined} type="email" value={r.email} placeholder="Email (optional)" onChange={e => onEdit(r.key, { email: e.target.value })} className={bad.email ? cellInput : okCell} />
                    : r.email || <span className="text-gray-400">&mdash;</span>}
                </td>
                <td className="px-2 py-1.5 align-top text-gray-600 dark:text-chalk-dim hidden md:table-cell">
                  {editable && (bad.parentName || r.fixing)
                    ? <input aria-label={`Parent name, row ${r.rowNumber}`} aria-invalid={bad.parentName || undefined} value={r.parentName} placeholder="Parent name" onChange={e => onEdit(r.key, { parentName: e.target.value })} className={bad.parentName ? cellInput : okCell} />
                    : r.parentName || '—'}
                </td>
                <td className="px-2 py-1.5 align-top"><StatusCell row={r} sameAs={dups.get(r.key)} family={family.get(r.key)} onAddAnyway={onAddAnyway ? () => onAddAnyway(r.key) : undefined} /></td>
                <td className="px-1 py-1.5 align-top text-right">
                  {!done && (
                    <button
                      onClick={() => onRemove(r.key)}
                      title="Leave this row out"
                      aria-label={`Leave row ${r.rowNumber} out`}
                      className="p-1 rounded text-gray-400 dark:text-chalk-dim hover:text-red-500 hover:bg-gray-100 dark:hover:bg-ink-800"
                    >
                      <XIcon aria-hidden className="w-3.5 h-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function downloadCsv(name: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  URL.revokeObjectURL(url)
}

// ── Per-team import ───────────────────────────────────────────────────────

const TEMPLATE =
  'First Name,Last Name,Parent Name,Email,Phone\n' +
  'Joseph,Smith,Dana Smith,parent@example.com,555-0100\n' +
  'Maria,Lopez,Ana Lopez,,\n'

// CSV roster import for one team (org team card + coach dashboard). Parse →
// preview every row (numbered as in the file) → import → every row keeps its
// outcome; rows that need fixing can be edited or removed and re-imported.
export default function CsvPlayerImport({
  endpoint,
  extra = {},
  teamName,
  multiTeamHint,
}: {
  endpoint: string
  extra?: Record<string, unknown>
  /** The team this imports into. Rows whose Team column names another team are flagged. */
  teamName?: string
  /** Where to point people whose file covers several teams. */
  multiTeamHint?: string
}) {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<EditableRow[]>([])
  const [unmapped, setUnmapped] = useState<string[]>([])
  const [otherTeams, setOtherTeams] = useState<string[]>([])
  const [leaveOutOthers, setLeaveOutOthers] = useState(true)
  const [fileName, setFileName] = useState('')
  const [sendEmail, setSendEmail] = useState(true)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState(false)

  const target = normTeamName(teamName)
  const isOther = (r: EditableRow) => !!target && !!r.teamName && normTeamName(r.teamName) !== target

  function applyLeaveOut(list: EditableRow[], leave: boolean): EditableRow[] {
    return list.map(r => (!rowIsDone(r) && isOther(r)
      ? { ...r, skippedReason: leave ? `this row is for ${r.teamName}` : undefined }
      : r))
  }

  function reset() {
    setRows([]); setUnmapped([]); setOtherTeams([]); setError(''); setImported(false); setFileName('')
  }

  function handleFile(file: File) {
    reset()
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = readRosterFile(String(reader.result ?? ''))
        if (parsed.rows.length === 0) { setError('We couldn’t find any players in that file. Check that it has a First Name column.'); return }
        const others = Array.from(new Set(parsed.rows.filter(isOther).map(r => r.teamName.trim())))
        setOtherTeams(others)
        setUnmapped(parsed.unmapped)
        setRows(applyLeaveOut(parsed.rows, leaveOutOthers))
      } catch {
        setError('Could not read that file. Save it as a .csv file from your spreadsheet app and try again.')
      }
    }
    reader.readAsText(file)
  }

  function edit(key: string, patch: Partial<PlayerImportRow>) {
    setRows(list => list.map(r => (r.key === key ? { ...r, ...patch, fixing: true, outcome: r.outcome?.status === 'error' ? undefined : r.outcome } : r)))
  }
  function remove(key: string) {
    setRows(list => list.map(r => (r.key === key ? { ...r, removed: true } : r)))
  }

  async function send(batch: EditableRow[]) {
    if (batch.length === 0) { setError('There’s nothing left to import. Fix or remove the rows marked “Needs fixing”.'); return }
    setImporting(true); setError('')
    try {
      const outcomes = await postImportRows(endpoint, extra, batch, sendEmail)
      setRows(list => list.map(r => (outcomes.has(r.key) ? { ...r, outcome: outcomes.get(r.key) } : r)))
      setImported(true)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong during import.')
    } finally {
      setImporting(false)
    }
  }

  function addAnyway(key: string) {
    const row = rows.find(r => r.key === key)
    if (!row) return
    const retry = { ...row, allowDuplicateName: true, outcome: undefined }
    setRows(list => list.map(r => (r.key === key ? retry : r)))
    void send([retry])
  }

  const counts = countOutcomes(rows)
  const sendable = rowsToSend(rows)

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setError('') }}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-ember-500 hover:text-ember-400 transition-colors"
      >
        <FileSpreadsheetIcon aria-hidden className="w-4 h-4" />
        Import from a spreadsheet
      </button>
    )
  }

  return (
    <div className="w-full border border-gray-200 dark:border-courtline rounded-xl p-3 space-y-3 bg-white dark:bg-transparent">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-black dark:text-chalk">Import players from a spreadsheet{teamName ? ` into ${teamName}` : ''}</p>
        <button onClick={() => { setOpen(false); reset() }} className="text-gray-400 dark:text-chalk-dim hover:text-gray-600 text-xs font-semibold">Close</button>
      </div>

      <p className="text-xs text-gray-500 dark:text-chalk-dim">
        Save your spreadsheet as a .csv file. Columns: First Name, Last Name, Parent Name, Email, Phone. Only First Name is needed.{' '}
        <button onClick={() => downloadCsv('learnhoops-roster-template.csv', TEMPLATE)} className="font-semibold text-ember-600 dark:text-ember-400 hover:underline">Download a template</button>
      </p>

      <div className="flex items-center gap-2 min-w-0">
        <button onClick={() => fileInput.current?.click()} className={backendButton('secondary')}>
          {fileName ? 'Choose a different file' : 'Choose file'}
        </button>
        {fileName && <span className="text-xs text-gray-500 dark:text-chalk-dim truncate">{fileName}</span>}
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
        />
      </div>

      {unmapped.length > 0 && (
        <p className="text-xs text-gray-500 dark:text-chalk-dim">
          We didn&rsquo;t recognise {unmapped.length === 1 ? 'this column' : 'these columns'}, so {unmapped.length === 1 ? 'it' : 'they'} won&rsquo;t be imported:{' '}
          <strong className="text-gray-700 dark:text-chalk">{unmapped.join(', ')}</strong>
        </p>
      )}

      {otherTeams.length > 0 && (
        <div className="border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 space-y-2">
          <p className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangleIcon aria-hidden className="w-4 h-4 shrink-0" />
            <span>
              Some rows name a different team in the Team column ({otherTeams.join(', ')}).
              {multiTeamHint ? ` ${multiTeamHint}` : ''}
            </span>
          </p>
          <label className="flex items-center gap-2 text-xs text-amber-900 dark:text-amber-200 cursor-pointer">
            <input
              type="checkbox"
              checked={leaveOutOthers}
              onChange={e => { setLeaveOutOthers(e.target.checked); setRows(list => applyLeaveOut(list, e.target.checked)) }}
              className="w-4 h-4 accent-ember-500"
            />
            Leave out the rows for other teams (otherwise they&rsquo;re added to {teamName})
          </label>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="text-xs text-gray-600 dark:text-chalk-dim flex flex-wrap gap-x-3 gap-y-1">
            <span><strong className="text-black dark:text-chalk">{rows.filter(r => !r.removed).length}</strong> rows</span>
            {imported && <span><strong className="text-green-700 dark:text-green-400">{counts.added}</strong> added</span>}
            {imported && counts.already > 0 && <span><strong className="text-black dark:text-chalk">{counts.already}</strong> already on team</span>}
            {counts.ready > 0 && <span><strong className="text-black dark:text-chalk">{counts.ready}</strong> ready to import</span>}
            {counts.repeats > 0 && <span><strong className="text-black dark:text-chalk">{counts.repeats}</strong> repeated in the file (imported once)</span>}
            {counts.needsFix > 0 && <span className="text-red-600 dark:text-red-400"><strong>{counts.needsFix}</strong> need fixing (edit the red cells, or remove the row)</span>}
          </div>

          <ImportRowsTable rows={rows} onEdit={edit} onRemove={remove} onAddAnyway={addAnyway} />

          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-chalk-dim cursor-pointer">
            <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} className="w-4 h-4 accent-ember-500" />
            Email a setup link to players who have an email
          </label>

          {sendable.length > 0 && (
            <button
              onClick={() => send(sendable)}
              disabled={importing}
              className={backendButton('primary', 'w-full')}
            >
              {importing
                ? 'Importing…'
                : imported
                  ? `Import the fixed rows (${sendable.length})`
                  : `Import ${sendable.length} player${sendable.length === 1 ? '' : 's'}`}
            </button>
          )}
          {imported && sendable.length === 0 && counts.needsFix === 0 && (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-green-700 dark:text-green-400">
              <CheckIcon aria-hidden className="w-4 h-4" /> All done. Every row is on the team.
            </p>
          )}
        </>
      )}

      {error && <p className="text-red-600 dark:text-red-400 text-xs">{error}</p>}
    </div>
  )
}

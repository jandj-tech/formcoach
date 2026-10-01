'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangleIcon, CheckIcon, FileSpreadsheetIcon } from 'lucide-react'
import { normTeamName, type PlayerImportRow } from '@/lib/csv'
import { backendButton } from '@/components/backend/button-styles'
import {
  ImportRowsTable,
  countOutcomes,
  downloadCsv,
  markRowsOnTeam,
  postImportRows,
  readRosterFile,
  rowIsDone,
  rowsToSend,
  type EditableRow,
} from '@/components/CsvPlayerImport'

const TEMPLATE =
  'Team,First Name,Last Name,Parent Name,Email,Phone\n' +
  'U12 Boys,Joseph,Smith,Dana Smith,parent@example.com,555-0100\n' +
  'U14 Girls,Maria,Lopez,Ana Lopez,,\n'

const LEAVE_OUT = '__leave_out__'

interface TeamOption { id: string; name: string }

interface Group {
  /** Normalised team name from the file ('' when the cell was empty). */
  key: string
  /** As written in the file. */
  label: string
  /** Matched or chosen team id, LEAVE_OUT, or '' when still to pick. */
  teamId: string
  matched: boolean
  /** How many of the org's teams have this name, when it's more than one. */
  sameName?: number
}

/** For telling two same-named teams apart in the picker. */
interface TeamInfo { players: number; coach: string | null }

// Org-level roster import: ONE spreadsheet with a Team column, split across
// the org's teams. Each row's team is matched by name (case and spacing
// ignored); names that don't match are flagged with a picker. Import then runs
// per team through the same /api/org/import-players path as a team card, so
// all the duplicate and sibling handling is shared.
export default function OrgRosterImport({ teams }: { teams: TeamOption[] }) {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<EditableRow[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [unmapped, setUnmapped] = useState<string[]>([])
  const [noTeamColumn, setNoTeamColumn] = useState(false)
  const [sendEmail, setSendEmail] = useState(true)
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState(false)
  const [error, setError] = useState('')
  const [teamInfo, setTeamInfo] = useState<Record<string, TeamInfo>>({})

  // Every team per name: an older org can have two teams with one name, and
  // a row must not be filed under whichever came last.
  const byName = new Map<string, TeamOption[]>()
  for (const t of teams) byName.set(normTeamName(t.name), [...(byName.get(normTeamName(t.name)) ?? []), t])
  const sameNamed = (id: string) => (byName.get(normTeamName(teamName(id)))?.length ?? 0) > 1
  const optionLabel = (t: TeamOption) => {
    const info = sameNamed(t.id) ? teamInfo[t.id] : undefined
    if (!info) return t.name
    return `${t.name} — ${info.players} player${info.players === 1 ? '' : 's'}${info.coach ? `, coach ${info.coach}` : ''}`
  }

  /** Flags this team's name-only rows whose player is already on it (preview only). */
  function checkTeamRows(teamId: string, list: EditableRow[]) {
    if (!teamId || teamId === LEAVE_OUT) return
    void markRowsOnTeam('/api/org/import-players', { teamId }, list).then(keys => {
      if (keys.size) setRows(cur => cur.map(r => (keys.has(r.key) ? { ...r, onTeam: true } : r)))
    })
  }
  const teamName = (id: string) => teams.find(t => t.id === id)?.name ?? ''

  function reset() {
    setFileName(''); setRows([]); setGroups([]); setUnmapped([]); setNoTeamColumn(false)
    setImported(false); setError('')
  }

  function handleFile(file: File) {
    reset()
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = readRosterFile(String(reader.result ?? ''))
        if (parsed.rows.length === 0) { setError('We couldn’t find any players in that file. Check that it has a First Name column.'); return }
        setUnmapped(parsed.unmapped)
        if (!parsed.hasTeamColumn) { setNoTeamColumn(true); setRows(parsed.rows); return }
        const seen = new Map<string, Group>()
        for (const r of parsed.rows) {
          const key = normTeamName(r.teamName)
          if (seen.has(key)) continue
          const found = key ? byName.get(key) ?? [] : []
          const match = found.length === 1 ? found[0] : undefined
          seen.set(key, {
            key,
            label: r.teamName.trim(),
            teamId: match?.id ?? '',
            matched: !!match,
            ...(found.length > 1 ? { sameName: found.length } : {}),
          })
        }
        const gs = Array.from(seen.values())
        setGroups(gs)
        setRows(parsed.rows)
        for (const g of gs) {
          if (g.matched) checkTeamRows(g.teamId, parsed.rows.filter(r => normTeamName(r.teamName) === g.key))
          // Same-named teams: fetch enough to tell them apart in the picker.
          if (g.sameName) {
            for (const t of byName.get(g.key) ?? []) {
              void fetch('/api/org/import-players', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ teamId: t.id, check: true, rows: [] }),
              })
                .then(res => (res.ok ? res.json() : null))
                .then(d => { if (d) setTeamInfo(cur => ({ ...cur, [t.id]: { players: Number(d.players) || 0, coach: d.coach ?? null } })) })
                .catch(() => {})
            }
          }
        }
      } catch {
        setError('Could not read that file. Save it as a .csv file from your spreadsheet app and try again.')
      }
    }
    reader.readAsText(file)
  }

  function pick(key: string, teamId: string) {
    setGroups(gs => gs.map(g => (g.key === key ? { ...g, teamId } : g)))
    // A different team: its own "already on the team" check.
    const list = rows.filter(r => normTeamName(r.teamName) === key).map(r => (r.outcome ? r : { ...r, onTeam: false }))
    setRows(cur => cur.map(r => (normTeamName(r.teamName) === key && !r.outcome ? { ...r, onTeam: false } : r)))
    checkTeamRows(teamId, list)
  }
  function edit(rowKey: string, patch: Partial<PlayerImportRow>) {
    setRows(list => list.map(r => (r.key === rowKey ? { ...r, ...patch, fixing: true, onTeam: false, outcome: r.outcome?.status === 'error' ? undefined : r.outcome } : r)))
  }
  function remove(rowKey: string) {
    setRows(list => list.map(r => (r.key === rowKey ? { ...r, removed: true } : r)))
  }

  const groupRows = (g: Group) => rows.filter(r => normTeamName(r.teamName) === g.key)
  const unresolved = groups.filter(g => !g.teamId && groupRows(g).some(r => !r.removed && !rowIsDone(r)))
  const active = groups.filter(g => g.teamId && g.teamId !== LEAVE_OUT)
  const pendingByGroup = active.map(g => ({ g, batch: rowsToSend(groupRows(g)) })).filter(x => x.batch.length > 0)
  const totalToSend = pendingByGroup.reduce((n, x) => n + x.batch.length, 0)
  const teamsToSend = new Set(pendingByGroup.map(x => x.g.teamId)).size

  async function runImport() {
    if (unresolved.length > 0) { setError('Pick a team for every team name we didn’t recognise (or choose to leave those rows out).'); return }
    if (totalToSend === 0) { setError('There’s nothing left to import. Fix or remove the rows marked “Needs fixing”.'); return }
    setImporting(true); setError('')
    const failures: string[] = []
    // Several file names can point at one team; send each team one batch.
    const perTeam = new Map<string, EditableRow[]>()
    for (const { g, batch } of pendingByGroup) perTeam.set(g.teamId, [...(perTeam.get(g.teamId) ?? []), ...batch])
    for (const [teamId, batch] of perTeam) {
      try {
        const outcomes = await postImportRows('/api/org/import-players', { teamId }, batch, sendEmail)
        setRows(list => list.map(r => (outcomes.has(r.key) ? { ...r, outcome: outcomes.get(r.key) } : r)))
      } catch (e) {
        failures.push(`${teamName(teamId)}: ${e instanceof Error ? e.message : 'import failed'}`)
      }
    }
    setImported(true)
    setImporting(false)
    if (failures.length) setError(`Some teams didn’t import. ${failures.join(' ')}`)
    router.refresh()
  }

  async function addAnyway(rowKey: string, teamId: string) {
    const row = rows.find(r => r.key === rowKey)
    if (!row) return
    const retry = { ...row, allowDuplicateName: true, outcome: undefined }
    setRows(list => list.map(r => (r.key === rowKey ? retry : r)))
    // Still in the preview: it simply joins the rows to import.
    if (!row.outcome) return
    try {
      const outcomes = await postImportRows('/api/org/import-players', { teamId }, [retry], sendEmail)
      setRows(list => list.map(r => (outcomes.has(r.key) ? { ...r, outcome: outcomes.get(r.key) } : r)))
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add that player.')
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={backendButton('secondary')}>
        <FileSpreadsheetIcon aria-hidden />
        Import players from a spreadsheet
      </button>
    )
  }

  const all = countOutcomes(rows.filter(r => {
    const g = groups.find(x => x.key === normTeamName(r.teamName))
    return g && g.teamId !== LEAVE_OUT
  }))

  return (
    <div className="basis-full min-w-0 border border-gray-200 dark:border-courtline rounded-2xl p-5 space-y-4 bg-white dark:bg-transparent">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-black dark:text-chalk">Import players from a spreadsheet</h3>
          <p className="text-sm text-gray-500 dark:text-chalk-dim mt-1">
            One file for several teams. Add a <strong className="font-semibold text-gray-700 dark:text-chalk">Team</strong> column with each
            player&rsquo;s team name, then save the spreadsheet as a .csv file.{' '}
            <button onClick={() => downloadCsv('learnhoops-org-roster-template.csv', TEMPLATE)} className="font-semibold text-ember-600 dark:text-ember-400 hover:underline">
              Download a template
            </button>
          </p>
        </div>
        <button onClick={() => { setOpen(false); reset() }} className="shrink-0 text-gray-400 dark:text-chalk-dim hover:text-gray-600 text-sm font-semibold">Close</button>
      </div>

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

      {noTeamColumn && (
        <p className="flex items-start gap-1.5 text-sm text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-lg p-3">
          <AlertTriangleIcon aria-hidden className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            This file has no Team column, so we can&rsquo;t tell which team each player is on. Add a column called
            &ldquo;Team&rdquo; with the team name on every row, or open a team and use Import from a spreadsheet on its Roster tab.
          </span>
        </p>
      )}

      {groups.length > 0 && (
        <>
          <div className="text-xs text-gray-600 dark:text-chalk-dim flex flex-wrap gap-x-3 gap-y-1">
            <span><strong className="text-black dark:text-chalk">{rows.filter(r => !r.removed).length}</strong> {rows.filter(r => !r.removed).length === 1 ? 'row' : 'rows'} for <strong className="text-black dark:text-chalk">{groups.length}</strong> team name{groups.length === 1 ? '' : 's'}</span>
            {imported && <span><strong className="text-green-700 dark:text-green-400">{all.added}</strong> added</span>}
            {imported && all.already > 0 && <span><strong className="text-black dark:text-chalk">{all.already}</strong> already on their team</span>}
            {all.onTeam > 0 && <span><strong className="text-black dark:text-chalk">{all.onTeam}</strong> {all.onTeam === 1 ? 'looks' : 'look'} already on their team (left out)</span>}
            {all.needsFix > 0 && <span className="text-red-600 dark:text-red-400"><strong>{all.needsFix}</strong> {all.needsFix === 1 ? 'needs' : 'need'} fixing</span>}
          </div>

          <div className="space-y-4">
            {groups.map(g => {
              const list = groupRows(g)
              const live = list.filter(r => !r.removed)
              if (live.length === 0) return null
              const leftOut = g.teamId === LEAVE_OUT
              return (
                <section key={g.key || '(blank)'} className="border border-gray-200 dark:border-courtline rounded-xl">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 bg-gray-50 dark:bg-ink-800 rounded-t-xl border-b border-gray-200 dark:border-courtline">
                    <p className="text-sm font-bold text-black dark:text-chalk">
                      {g.matched ? teamName(g.teamId) : g.label ? `“${g.label}”` : 'No team given'}
                      <span className="ml-2 text-xs font-medium text-gray-500 dark:text-chalk-dim">{live.length} row{live.length === 1 ? '' : 's'}</span>
                    </p>
                    {!g.matched && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-xs ${g.teamId ? 'text-gray-500 dark:text-chalk-dim' : 'text-amber-700 dark:text-amber-400 font-semibold'}`}>
                          {g.sameName
                            ? `${g.sameName} teams are called “${g.label}” — pick one:`
                            : g.label ? `No team called “${g.label}” — pick one:` : 'These rows have no team — pick one:'}
                        </span>
                        <select
                          aria-label={`Team for ${g.label || 'rows with no team'}`}
                          value={g.teamId}
                          onChange={e => pick(g.key, e.target.value)}
                          className="bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline rounded-lg px-2 py-1 text-xs text-black dark:text-chalk focus:outline-none focus:border-ember-500"
                        >
                          <option value="">Choose a team&hellip;</option>
                          {/* The same-named teams first, told apart by roster size and coach. */}
                          {[...(g.sameName ? byName.get(g.key) ?? [] : []), ...teams.filter(t => !(g.sameName && normTeamName(t.name) === g.key))]
                            .map(t => <option key={t.id} value={t.id}>{optionLabel(t)}</option>)}
                          <option value={LEAVE_OUT}>Leave these rows out</option>
                        </select>
                      </div>
                    )}
                  </div>
                  <div className="p-2">
                    {leftOut ? (
                      <p className="text-xs text-gray-500 dark:text-chalk-dim px-1 py-1">These rows won&rsquo;t be imported.</p>
                    ) : (
                      <ImportRowsTable
                        rows={list}
                        familyRows={rows}
                        onEdit={edit}
                        onRemove={remove}
                        onAddAnyway={g.teamId ? key => addAnyway(key, g.teamId) : undefined}
                      />
                    )}
                  </div>
                </section>
              )
            })}
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-chalk-dim cursor-pointer">
            <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} className="w-4 h-4 accent-ember-500" />
            Email a setup link to players who have an email
          </label>

          {unresolved.length > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Pick a team for {unresolved.map(g => (g.label ? `“${g.label}”` : 'the rows with no team')).join(', ')} before importing.
            </p>
          )}

          {totalToSend > 0 && (
            <button onClick={runImport} disabled={importing || unresolved.length > 0} className={backendButton('primary', 'w-full')}>
              {importing
                ? 'Importing…'
                : imported
                  ? `Import the fixed rows (${totalToSend})`
                  : `Import ${totalToSend} player${totalToSend === 1 ? '' : 's'} into ${teamsToSend} team${teamsToSend === 1 ? '' : 's'}`}
            </button>
          )}
          {imported && !sendEmail && rows.some(r => !r.removed && !!r.email.trim() && (r.outcome?.status === 'created' || r.outcome?.status === 'linked')) && (
            <p className="text-sm text-gray-600 dark:text-chalk-dim">
              No setup emails were sent. You can email setup links later from the roster.
            </p>
          )}
          {imported && totalToSend === 0 && all.needsFix > 0 && (
            <p className="text-sm text-gray-600 dark:text-chalk-dim">
              Fix the {all.needsFix === 1 ? 'row' : `${all.needsFix} rows`} marked &ldquo;Needs fixing&rdquo; above to import {all.needsFix === 1 ? 'it' : 'them'}, or leave {all.needsFix === 1 ? 'it' : 'them'} out with the &times;. Everyone else is on their team.
            </p>
          )}
          {imported && totalToSend === 0 && all.needsFix === 0 && unresolved.length === 0 && (
            <p className="flex items-center gap-1.5 text-sm font-semibold text-green-700 dark:text-green-400">
              <CheckIcon aria-hidden className="w-4 h-4" /> All done. Every row is on its team.
            </p>
          )}
        </>
      )}

      {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}
    </div>
  )
}

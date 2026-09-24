'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { parseCsv, mapPlayerCsv, type PlayerImportRow } from '@/lib/csv'
import { backendButton } from '@/components/backend/button-styles'

interface RowResult { index: number; name: string; status: string; detail?: string }

const TEMPLATE =
  'First Name,Last Name,Parent Name,Email,Phone\n' +
  'Joseph,Smith,Dana Smith,parent@example.com,555-0100\n' +
  'Maria,Lopez,Ana Lopez,,\n'

function isEmailish(s: string) { return s === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) }

// Reusable CSV roster import for org + coach dashboards. Parse → preview →
// import, with a per-row result summary. The target team is chosen in the UI;
// any "Team name" column is ignored here (validated by the caller if needed).
export default function CsvPlayerImport({
  endpoint,
  extra = {},
}: {
  endpoint: string
  extra?: Record<string, unknown>
}) {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<PlayerImportRow[]>([])
  const [fileName, setFileName] = useState('')
  const [sendEmail, setSendEmail] = useState(true)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState<RowResult[] | null>(null)
  const [summary, setSummary] = useState<{ added: number; skipped: number; failed: number; total: number } | null>(null)

  const invalidEmails = rows.filter(r => !isEmailish(r.email.trim())).length
  const missingNames = rows.filter(r => !r.firstName.trim()).length
  const validRows = rows.filter(r => r.firstName.trim() && isEmailish(r.email.trim()))

  function handleFile(file: File) {
    setError(''); setResults(null); setSummary(null)
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const grid = parseCsv(String(reader.result ?? ''))
        const mapped = mapPlayerCsv(grid)
        if (mapped.rows.length === 0) { setError('No player rows found in that file.'); setRows([]); return }
        setRows(mapped.rows)
      } catch {
        setError('Could not read that file. Make sure it is a .csv.')
        setRows([])
      }
    }
    reader.readAsText(file)
  }

  async function runImport() {
    if (validRows.length === 0) { setError('Nothing to import yet.'); return }
    setImporting(true); setError('')
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...extra,
          sendEmail,
          rows: validRows.map(r => ({
            firstName: r.firstName.trim(),
            lastName: r.lastName.trim() || undefined,
            email: r.email.trim() || undefined,
            parentName: r.parentName.trim() || undefined,
            phone: r.phone.trim() || undefined,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Import failed'); setImporting(false); return }
      setResults(data.results); setSummary(data.summary)
      setRows([])
      setImporting(false)
      router.refresh()
    } catch {
      setError('Something went wrong during import.')
      setImporting(false)
    }
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'learnhoops-roster-template.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setError('') }}
        className="text-sm font-semibold text-ember-500 hover:text-ember-400 transition-colors"
      >
        + Import from CSV
      </button>
    )
  }

  return (
    <div className="border border-gray-200 dark:border-courtline rounded-xl p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-black dark:text-chalk">Import a roster from CSV</p>
        <button onClick={() => { setOpen(false); setRows([]); setResults(null); setError('') }} className="text-gray-400 dark:text-chalk-dim hover:text-gray-600 text-xs font-semibold">Close</button>
      </div>

      <p className="text-xs text-gray-500 dark:text-chalk-dim">
        Columns: First Name, Last Name, Parent Name, Email, Phone. Only First Name is required.{' '}
        <button onClick={downloadTemplate} className="font-semibold text-ember-600 dark:text-ember-400 hover:underline">Download template</button>
      </p>

      <div className="flex items-center gap-2">
        <button onClick={() => fileInput.current?.click()} className={backendButton('secondary')}>
          {fileName ? 'Choose a different file' : 'Choose CSV file'}
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

      {rows.length > 0 && (
        <>
          <div className="text-xs text-gray-600 dark:text-chalk-dim flex flex-wrap gap-x-3 gap-y-1">
            <span><strong className="text-black dark:text-chalk">{rows.length}</strong> rows</span>
            <span><strong className="text-green-600 dark:text-green-400">{validRows.length}</strong> ready</span>
            {missingNames > 0 && <span className="text-red-600 dark:text-red-400">{missingNames} missing a name</span>}
            {invalidEmails > 0 && <span className="text-red-600 dark:text-red-400">{invalidEmails} bad email</span>}
          </div>

          <div className="max-h-56 overflow-auto border border-gray-100 dark:border-courtline rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-ink-950/60 text-gray-500 dark:text-chalk-dim sticky top-0">
                <tr>
                  <th className="text-left font-semibold px-2 py-1.5">Name</th>
                  <th className="text-left font-semibold px-2 py-1.5">Email</th>
                  <th className="text-left font-semibold px-2 py-1.5">Parent</th>
                  <th className="text-left font-semibold px-2 py-1.5">Phone</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-courtline">
                {rows.slice(0, 100).map((r, i) => {
                  const bad = !r.firstName.trim() || !isEmailish(r.email.trim())
                  return (
                    <tr key={i} className={bad ? 'bg-red-50 dark:bg-red-950/30' : ''}>
                      <td className="px-2 py-1.5 text-black dark:text-chalk">{`${r.firstName} ${r.lastName}`.trim() || <span className="text-red-500">(no name)</span>}</td>
                      <td className="px-2 py-1.5 text-gray-600 dark:text-chalk-dim">{r.email || '—'}</td>
                      <td className="px-2 py-1.5 text-gray-600 dark:text-chalk-dim">{r.parentName || '—'}</td>
                      <td className="px-2 py-1.5 text-gray-600 dark:text-chalk-dim">{r.phone || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-chalk-dim cursor-pointer">
            <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} className="w-4 h-4 accent-ember-500" />
            Email a setup link to players who have an email
          </label>

          <button
            onClick={runImport}
            disabled={importing || validRows.length === 0}
            className="w-full bg-ember-500 hover:bg-ember-400 disabled:bg-ember-300 text-ink-950 font-bold px-3 py-2.5 rounded-lg text-sm transition-colors"
          >
            {importing ? 'Importing…' : `Import ${validRows.length} player${validRows.length === 1 ? '' : 's'}`}
          </button>
        </>
      )}

      {error && <p className="text-red-500 text-xs">{error}</p>}

      {summary && results && (
        <div className="bg-gray-50 dark:bg-ink-950/60 border border-gray-200 dark:border-courtline rounded-lg p-3 space-y-2">
          <p className="text-sm font-bold text-black dark:text-chalk">
            Added {summary.added} · {summary.skipped} already on team{summary.failed > 0 ? ` · ${summary.failed} failed` : ''}
          </p>
          {results.some(r => r.status === 'error') && (
            <ul className="text-xs text-red-600 dark:text-red-400 space-y-0.5 max-h-32 overflow-auto">
              {results.filter(r => r.status === 'error').map(r => (
                <li key={r.index}>{r.name || `Row ${r.index + 1}`}: {r.detail}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

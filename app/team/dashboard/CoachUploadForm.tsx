'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import VideoUploader from '@/components/VideoUploader'

interface Member {
  id: string
  email: string
  tokens: number
  first_name: string | null
  last_name_initial: string | null
}

interface Props {
  accessCode: string
  members: Member[]
}

export default function CoachUploadForm({ accessCode, members }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Member | null>(null)
  const [step, setStep] = useState<'pick' | 'upload' | 'done'>('pick')
  const [resultToken, setResultToken] = useState('')

  const filtered = members.filter(m => {
    const q = search.toLowerCase()
    const name = `${m.first_name ?? ''} ${m.last_name_initial ?? ''}`.toLowerCase()
    return name.includes(q)
  })

  function selectMember(m: Member) {
    setSelected(m)
    setStep('upload')
  }

  function handleSuccess(submissionId: string) {
    setResultToken(submissionId)
    setStep('done')
  }

  function reset() {
    setStep('pick')
    setSelected(null)
    setSearch('')
    setResultToken('')
    setOpen(false)
  }

  const displayName = selected
    ? selected.first_name
      ? `${selected.first_name} ${selected.last_name_initial ?? ''}.`
      : selected.email
    : ''

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={members.length === 0}
        className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-gray-200 dark:disabled:bg-ink-700 disabled:text-gray-400 dark:disabled:text-chalk-dim disabled:cursor-not-allowed text-ink-950 font-bold py-3 rounded-xl transition-colors"
      >
        {members.length === 0 ? 'No players have joined yet' : 'Upload Shot for a Player'}
      </button>
    )
  }

  return (
    <div className="border border-orange-200 rounded-2xl p-6 space-y-5 bg-orange-50 dark:bg-ember-500/10">
      <div className="flex items-center justify-between">
        <h3 className="font-black text-black dark:text-chalk text-lg">Upload Shot for a Player</h3>
        <button onClick={reset} className="text-gray-400 dark:text-chalk-dim hover:text-gray-600 dark:hover:text-chalk-dim text-sm">Cancel</button>
      </div>

      {step === 'pick' && (
        <div className="space-y-3">
          <input
            type="text"
            aria-label="Search by name..."
            placeholder="Search by name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline rounded-xl px-4 py-2.5 text-black dark:text-chalk placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors text-sm"
          />
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-chalk-dim text-center py-4">No players found</p>
            )}
            {filtered.map((m) => (
              <button
                key={m.id}
                onClick={() => selectMember(m)}
                className="w-full text-left border border-gray-200 dark:border-courtline hover:border-orange-400 bg-white dark:bg-ink-900 rounded-xl px-4 py-3 transition-colors"
              >
                <p className="text-sm font-bold text-black dark:text-chalk">
                  {m.first_name ? `${m.first_name} ${m.last_name_initial ?? ''}.` : m.email}
                </p>
                {m.first_name && (
                  <p className="text-xs text-gray-400 dark:text-chalk-dim">{m.email}</p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'upload' && selected && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-chalk-dim">
            Uploading for <span className="font-bold text-black dark:text-chalk">{displayName}</span>
            <button onClick={() => { setStep('pick'); setSelected(null) }} className="ml-2 text-orange-500 hover:underline text-xs">Change</button>
          </p>
          <VideoUploader
            teamMode={{
              code: accessCode,
              firstName: (selected.first_name ?? selected.email.split('@')[0]).trim(),
              lastName: selected.last_name_initial ?? '?',
              onSuccess: handleSuccess,
            }}
          />
        </div>
      )}

      {step === 'done' && (
        <div className="text-center space-y-4 py-4">
          <div className="text-3xl font-black text-green-600 dark:text-green-400">✓</div>
          <p className="font-black text-black dark:text-chalk text-lg">Shot uploaded for {displayName}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => router.push(`/results/${resultToken}`)}
              className="bg-orange-500 hover:bg-orange-400 text-ink-950 font-bold px-6 py-2.5 rounded-xl transition-colors text-sm"
            >
              View Results
            </button>
            <button
              onClick={() => { setStep('pick'); setSelected(null); setSearch(''); setResultToken('') }}
              className="bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline hover:border-orange-400 text-black dark:text-chalk font-bold px-6 py-2.5 rounded-xl transition-colors text-sm"
            >
              Upload Another
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

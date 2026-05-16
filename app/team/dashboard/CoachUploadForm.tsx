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
        className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors"
      >
        {members.length === 0 ? 'No players have joined yet' : 'Upload Shot for a Player'}
      </button>
    )
  }

  return (
    <div className="border border-orange-200 rounded-2xl p-6 space-y-5 bg-orange-50">
      <div className="flex items-center justify-between">
        <h3 className="font-black text-black text-lg">Upload Shot for a Player</h3>
        <button onClick={reset} className="text-gray-400 hover:text-gray-600 text-sm">Cancel</button>
      </div>

      {step === 'pick' && (
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Search by name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded-xl px-4 py-2.5 text-black placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors text-sm"
          />
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">No players found</p>
            )}
            {filtered.map((m) => (
              <button
                key={m.id}
                onClick={() => selectMember(m)}
                className="w-full text-left border border-gray-200 hover:border-orange-400 bg-white rounded-xl px-4 py-3 transition-colors"
              >
                <p className="text-sm font-bold text-black">
                  {m.first_name ? `${m.first_name} ${m.last_name_initial ?? ''}.` : m.email}
                </p>
                {m.first_name && (
                  <p className="text-xs text-gray-400">{m.email}</p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'upload' && selected && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Uploading for <span className="font-bold text-black">{displayName}</span>
            <button onClick={() => { setStep('pick'); setSelected(null) }} className="ml-2 text-orange-500 hover:underline text-xs">Change</button>
          </p>
          <VideoUploader
            teamMode={{
              code: accessCode,
              firstName: (selected.first_name ?? selected.email.split('@')[0]).trim(),
              lastInitial: (selected.last_name_initial ?? '?').charAt(0).toUpperCase(),
              onSuccess: handleSuccess,
            }}
          />
        </div>
      )}

      {step === 'done' && (
        <div className="text-center space-y-4 py-4">
          <div className="text-3xl font-black text-green-600">✓</div>
          <p className="font-black text-black text-lg">Shot uploaded for {displayName}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => router.push(`/results/${resultToken}`)}
              className="bg-orange-500 hover:bg-orange-400 text-white font-bold px-6 py-2.5 rounded-xl transition-colors text-sm"
            >
              View Results
            </button>
            <button
              onClick={() => { setStep('pick'); setSelected(null); setSearch(''); setResultToken('') }}
              className="bg-white border border-gray-300 hover:border-orange-400 text-black font-bold px-6 py-2.5 rounded-xl transition-colors text-sm"
            >
              Upload Another
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

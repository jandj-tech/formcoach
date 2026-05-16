'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import VideoUploader from '@/components/VideoUploader'

interface Member {
  id: string
  email: string
  tokens: number
}

interface Props {
  accessCode: string
  members: Member[]
}

export default function CoachUploadForm({ accessCode, members }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'pick' | 'name' | 'upload' | 'done'>('pick')
  const [selectedEmail, setSelectedEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastInitial, setLastInitial] = useState('')
  const [resultToken, setResultToken] = useState('')

  function selectMember(email: string) {
    setSelectedEmail(email)
    setStep('name')
  }

  function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!firstName.trim() || !lastInitial.trim()) return
    setStep('upload')
  }

  function handleSuccess(submissionId: string) {
    setResultToken(submissionId)
    setStep('done')
  }

  function reset() {
    setStep('pick')
    setSelectedEmail('')
    setFirstName('')
    setLastInitial('')
    setResultToken('')
    setOpen(false)
  }

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
          <p className="text-sm font-semibold text-black">Select a player</p>
          <div className="space-y-2">
            {members.map((m) => (
              <button
                key={m.id}
                onClick={() => selectMember(m.email)}
                className="w-full text-left border border-gray-200 hover:border-orange-400 bg-white rounded-xl px-4 py-3 text-sm font-semibold text-black transition-colors"
              >
                {m.email}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'name' && (
        <form onSubmit={handleNameSubmit} className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-black mb-1">Uploading for</p>
            <p className="text-orange-600 font-bold">{selectedEmail}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-black mb-2">Enter their display name for the leaderboard</p>
            <div className="flex gap-3">
              <input
                type="text"
                required
                placeholder="First name"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                className="flex-1 bg-white border border-gray-300 rounded-xl px-4 py-2.5 text-black placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors text-sm"
              />
              <input
                type="text"
                required
                maxLength={1}
                placeholder="Last initial"
                value={lastInitial}
                onChange={e => setLastInitial(e.target.value.toUpperCase())}
                className="w-24 bg-white border border-gray-300 rounded-xl px-4 py-2.5 text-black placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors text-sm"
              />
            </div>
          </div>
          <button
            type="submit"
            className="w-full bg-black hover:bg-zinc-800 text-white font-bold py-2.5 rounded-xl transition-colors text-sm"
          >
            Continue to Upload
          </button>
        </form>
      )}

      {step === 'upload' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Uploading for{' '}
            <span className="font-bold text-black">{firstName} {lastInitial}.</span>
            <button onClick={() => setStep('name')} className="ml-2 text-orange-500 hover:underline text-xs">Change</button>
          </p>
          <VideoUploader
            teamMode={{
              code: accessCode,
              firstName: firstName.trim(),
              lastInitial: lastInitial.trim().charAt(0).toUpperCase(),
              onSuccess: handleSuccess,
            }}
          />
        </div>
      )}

      {step === 'done' && (
        <div className="text-center space-y-4 py-4">
          <div className="text-4xl">✓</div>
          <p className="font-black text-black text-lg">Shot uploaded for {firstName} {lastInitial}.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => router.push(`/results/${resultToken}`)}
              className="bg-orange-500 hover:bg-orange-400 text-white font-bold px-6 py-2.5 rounded-xl transition-colors text-sm"
            >
              View Results
            </button>
            <button
              onClick={() => { setStep('pick'); setFirstName(''); setLastInitial(''); setResultToken('') }}
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

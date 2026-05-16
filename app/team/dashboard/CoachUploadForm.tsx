'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import VideoUploader from '@/components/VideoUploader'

interface Player {
  id: string
  first_name: string
  last_name_initial: string
}

interface Props {
  accessCode: string
  knownPlayers: Player[]
}

export default function CoachUploadForm({ accessCode, knownPlayers }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'pick' | 'upload' | 'done'>('pick')
  const [firstName, setFirstName] = useState('')
  const [lastInitial, setLastInitial] = useState('')
  const [resultToken, setResultToken] = useState('')

  function selectPlayer(p: Player) {
    setFirstName(p.first_name)
    setLastInitial(p.last_name_initial)
    setStep('upload')
  }

  function handleManual(e: React.FormEvent) {
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
    setFirstName('')
    setLastInitial('')
    setResultToken('')
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full bg-orange-500 hover:bg-orange-400 text-white font-bold py-3 rounded-xl transition-colors"
      >
        Upload Shot for a Player
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
        <div className="space-y-4">
          {knownPlayers.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-black">Select a player</p>
              <div className="grid grid-cols-2 gap-2">
                {knownPlayers.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => selectPlayer(p)}
                    className="text-left border border-gray-200 hover:border-orange-400 bg-white rounded-xl px-4 py-3 text-sm font-semibold text-black transition-colors"
                  >
                    {p.first_name} {p.last_name_initial}.
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 pt-1">Or enter a new player below</p>
            </div>
          )}

          <form onSubmit={handleManual} className="space-y-3">
            {knownPlayers.length === 0 && (
              <p className="text-sm font-semibold text-black">Enter player name</p>
            )}
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
            <button
              type="submit"
              className="w-full bg-black hover:bg-zinc-800 text-white font-bold py-2.5 rounded-xl transition-colors text-sm"
            >
              Continue to Upload
            </button>
          </form>
        </div>
      )}

      {step === 'upload' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Uploading for <span className="font-bold text-black">{firstName} {lastInitial}.</span>
            <button onClick={() => setStep('pick')} className="ml-2 text-orange-500 hover:underline text-xs">Change</button>
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

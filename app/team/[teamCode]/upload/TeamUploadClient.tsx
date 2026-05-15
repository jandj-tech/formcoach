'use client'

import { useState } from 'react'
import VideoUploader from '@/components/VideoUploader'

interface Props {
  teamName: string
  teamCode: string
  initialCredits: number
}

type Stage = 'name' | 'upload' | 'done'

export default function TeamUploadClient({ teamName, teamCode, initialCredits }: Props) {
  const [stage, setStage] = useState<Stage>(initialCredits > 0 ? 'name' : 'no-credits' as Stage)
  const [firstName, setFirstName] = useState('')
  const [lastInitial, setLastInitial] = useState('')
  const [nameError, setNameError] = useState('')
  const [submissionId, setSubmissionId] = useState<string | null>(null)

  if ((stage as string) === 'no-credits' || initialCredits === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 py-20 text-center">
        <div className="space-y-4 max-w-sm">
          <div className="text-4xl">🏀</div>
          <h2 className="text-xl font-black text-black">{teamName}</h2>
          <p className="text-gray-500">This team has no upload credits remaining.</p>
          <p className="text-gray-400 text-sm">Ask your coach to add more credits to continue.</p>
        </div>
      </div>
    )
  }

  if (stage === 'done' && submissionId) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 py-20 text-center">
        <div className="space-y-4 max-w-sm">
          <div className="text-5xl">✅</div>
          <h2 className="text-xl font-black text-black">Shot analyzed!</h2>
          <p className="text-gray-500">
            Your shot has been analyzed. Your coach can see your score in the team dashboard.
          </p>
          <button
            onClick={() => {
              setStage('name')
              setFirstName('')
              setLastInitial('')
              setSubmissionId(null)
            }}
            className="bg-orange-500 hover:bg-orange-400 text-white font-bold px-6 py-3 rounded-xl transition-colors"
          >
            Analyze Another Shot
          </button>
        </div>
      </div>
    )
  }

  if (stage === 'upload') {
    return (
      <div className="flex-1 flex flex-col items-center px-6 py-10 space-y-6">
        <div className="text-center space-y-1">
          <h2 className="text-xl font-black text-black">{teamName}</h2>
          <p className="text-gray-500 text-sm">
            Uploading for <span className="font-semibold text-black">{firstName} {lastInitial}.</span>
          </p>
        </div>
        <VideoUploader
          teamMode={{
            code: teamCode,
            firstName,
            lastInitial,
            onSuccess: (id) => {
              setSubmissionId(id)
              setStage('done')
            },
          }}
        />
      </div>
    )
  }

  // Name entry stage
  function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fn = firstName.trim()
    const li = lastInitial.trim().toUpperCase()
    if (!fn) { setNameError('First name is required'); return }
    if (!li || !/^[A-Z]$/.test(li)) { setNameError('Last initial must be a single letter'); return }
    setNameError('')
    setStage('upload')
  }

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-20">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="text-4xl">🏀</div>
          <h1 className="text-2xl font-black text-black">{teamName}</h1>
          <p className="text-gray-500 text-sm">Enter your name to get started</p>
        </div>

        <form onSubmit={handleNameSubmit} className="space-y-3">
          <input
            type="text"
            required
            placeholder="First name"
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-black placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors"
          />
          <input
            type="text"
            required
            maxLength={1}
            placeholder="Last name initial (e.g. J)"
            value={lastInitial}
            onChange={e => setLastInitial(e.target.value.toUpperCase())}
            className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-black placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors"
          />
          {nameError && <p className="text-red-500 text-sm">{nameError}</p>}
          <button
            type="submit"
            className="w-full bg-orange-500 hover:bg-orange-400 text-white font-bold py-3 rounded-xl transition-colors"
          >
            Continue to Upload
          </button>
        </form>

        <p className="text-center text-xs text-gray-400">
          Your shot will be analyzed by AI and your score will appear on the team leaderboard.
        </p>
      </div>
    </div>
  )
}

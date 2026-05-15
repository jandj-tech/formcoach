'use client'

import { useEffect } from 'react'
import { use } from 'react'
import { useRouter } from 'next/navigation'
import { Suspense } from 'react'
import TopNav from '@/components/TopNav'
import Link from 'next/link'

function GateContent({ id }: { id: string }) {
  const router = useRouter()

  useEffect(() => {
    // Check session then look up the submission token and redirect to results
    fetch('/api/auth/session')
      .then(r => r.json())
      .then(async ({ user }) => {
        if (!user) return // stay on page, show login prompt
        const res = await fetch(`/api/submission-token/${id}`)
        if (res.ok) {
          const { token } = await res.json()
          router.replace(`/results/${token}`)
        }
      })
      .catch(() => {})
  }, [id, router])

  return (
    <main className="min-h-screen bg-white flex flex-col">
      <TopNav />
      <div className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="w-full max-w-md text-center space-y-6">
          <div className="text-5xl">🏀</div>
          <h1 className="text-2xl font-black text-black">Your analysis is ready</h1>
          <p className="text-gray-500">Log in or create a free account to view your results.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href={`/signup?next=/gate/${id}`}
              className="bg-orange-500 hover:bg-orange-400 text-white font-bold px-6 py-3 rounded-xl transition-colors"
            >
              Sign Up Free
            </Link>
            <Link
              href={`/login?next=/gate/${id}`}
              className="bg-gray-100 hover:bg-gray-200 text-black font-bold px-6 py-3 rounded-xl transition-colors"
            >
              Log In
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}

export default function GatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-white flex flex-col">
        <TopNav />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-5xl animate-bounce">🏀</div>
        </div>
      </main>
    }>
      <GateContent id={id} />
    </Suspense>
  )
}

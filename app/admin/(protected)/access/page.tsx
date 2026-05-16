'use client'

import { useState, useEffect, useCallback } from 'react'

type FreeAccount = {
  email: string
  subscription_type: string
  subscription_expires_at: string
  created_at: string
}

type PromoCode = {
  id: string
  code: string
  active: boolean
  times_redeemed: number
  max_redemptions: number | null
  expires_at: number | null
  percent_off: number | null
}

export default function AccessPage() {
  const [tab, setTab] = useState<'accounts' | 'codes'>('accounts')

  // Free accounts state
  const [accounts, setAccounts] = useState<FreeAccount[]>([])
  const [accountEmail, setAccountEmail] = useState('')
  const [accountLoading, setAccountLoading] = useState(false)
  const [accountError, setAccountError] = useState('')
  const [accountSuccess, setAccountSuccess] = useState('')

  // Promo codes state
  const [codes, setCodes] = useState<PromoCode[]>([])
  const [codeInput, setCodeInput] = useState('')
  const [maxRedemptions, setMaxRedemptions] = useState('')
  const [codeLoading, setCodeLoading] = useState(false)
  const [codeError, setCodeError] = useState('')
  const [newCode, setNewCode] = useState('')
  const [copied, setCopied] = useState('')
  const [percentOff, setPercentOff] = useState('100')

  const loadAccounts = useCallback(async () => {
    const res = await fetch('/api/admin/free-account')
    if (res.ok) {
      const { accounts } = await res.json()
      setAccounts(accounts)
    }
  }, [])

  const loadCodes = useCallback(async () => {
    const res = await fetch('/api/admin/promo-codes')
    if (res.ok) {
      const { codes } = await res.json()
      setCodes(codes)
    }
  }, [])

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { loadAccounts() }, [loadAccounts])
  useEffect(() => { if (tab === 'codes') loadCodes() }, [tab, loadCodes])
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault()
    if (!accountEmail.trim()) return
    setAccountLoading(true)
    setAccountError('')
    setAccountSuccess('')
    try {
      const res = await fetch('/api/admin/free-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: accountEmail.trim() }),
      })
      if (!res.ok) {
        const { error } = await res.json()
        setAccountError(error || 'Failed')
      } else {
        setAccountSuccess(`Free account created for ${accountEmail.trim()}. Welcome email sent.`)
        setAccountEmail('')
        await loadAccounts()
      }
    } catch {
      setAccountError('Something went wrong.')
    } finally {
      setAccountLoading(false)
    }
  }

  async function handleRevokeAccount(email: string) {
    if (!confirm(`Revoke free access for ${email}?`)) return
    await fetch('/api/admin/free-account', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    await loadAccounts()
  }

  async function handleCreateCode(e: React.FormEvent) {
    e.preventDefault()
    setCodeLoading(true)
    setCodeError('')
    setNewCode('')
    try {
      const res = await fetch('/api/admin/promo-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: codeInput.trim() || undefined,
          maxRedemptions: maxRedemptions ? parseInt(maxRedemptions) : undefined,
          percentOff: percentOff ? Math.min(100, Math.max(1, parseInt(percentOff) || 100)) : 100,
        }),
      })
      if (!res.ok) {
        const { error } = await res.json()
        setCodeError(error || 'Failed')
      } else {
        const data = await res.json()
        setNewCode(data.code)
        setCodeInput('')
        setMaxRedemptions('')
        await loadCodes()
      }
    } catch {
      setCodeError('Something went wrong.')
    } finally {
      setCodeLoading(false)
    }
  }

  async function handleDeactivateCode(id: string, code: string) {
    if (!confirm(`Deactivate code ${code}?`)) return
    await fetch('/api/admin/promo-codes', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await loadCodes()
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(text)
    setTimeout(() => setCopied(''), 2000)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black text-white">Free Access</h1>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-zinc-800">
        <button
          onClick={() => setTab('accounts')}
          className={`pb-3 px-1 text-sm font-bold transition-colors border-b-2 -mb-px ${
            tab === 'accounts' ? 'border-orange-500 text-orange-500' : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          Free Accounts
        </button>
        <button
          onClick={() => setTab('codes')}
          className={`pb-3 px-1 text-sm font-bold transition-colors border-b-2 -mb-px ${
            tab === 'codes' ? 'border-orange-500 text-orange-500' : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          Promo Codes
        </button>
      </div>

      {tab === 'accounts' && (
        <div className="space-y-6">
          {/* Create form */}
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 space-y-4">
            <h2 className="text-white font-bold">Create Free Account</h2>
            <p className="text-zinc-400 text-sm">
              Enter an email to grant unlimited access for 10 years. A welcome email will be sent automatically.
            </p>
            <form onSubmit={handleCreateAccount} className="flex gap-3">
              <input
                type="email"
                required
                placeholder="friend@example.com"
                value={accountEmail}
                onChange={(e) => setAccountEmail(e.target.value)}
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500 text-sm"
              />
              <button
                type="submit"
                disabled={accountLoading}
                className="bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold px-5 py-2.5 rounded-lg text-sm transition-colors whitespace-nowrap"
              >
                {accountLoading ? 'Creating...' : 'Grant Access'}
              </button>
            </form>
            {accountError && <p className="text-red-400 text-sm">{accountError}</p>}
            {accountSuccess && <p className="text-green-400 text-sm">{accountSuccess}</p>}
          </div>

          {/* Accounts list */}
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-800">
              <span className="text-white text-sm font-bold">Active Free Accounts ({accounts.length})</span>
            </div>
            {accounts.length === 0 ? (
              <p className="text-zinc-400 text-sm p-6">No free accounts yet.</p>
            ) : (
              <div className="divide-y divide-zinc-800/50">
                {accounts.map((a) => (
                  <div key={a.email} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p className="text-white text-sm font-medium">{a.email}</p>
                      <p className="text-zinc-500 text-xs">
                        Since {new Date(a.created_at).toLocaleDateString()} · Expires {new Date(a.subscription_expires_at).getFullYear()}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRevokeAccount(a.email)}
                      className="text-xs text-red-400 hover:text-red-300 transition-colors"
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'codes' && (
        <div className="space-y-6">
          {/* Create form */}
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 space-y-4">
            <h2 className="text-white font-bold">Generate Promo Code</h2>
            <p className="text-zinc-400 text-sm">
              Creates a Stripe promo code. Leave code blank to auto-generate.
            </p>
            <form onSubmit={handleCreateCode} className="space-y-3">
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="e.g. SAVE20 (optional)"
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500 text-sm font-mono uppercase"
                />
                <div className="flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 w-32">
                  <input
                    type="number"
                    placeholder="100"
                    value={percentOff}
                    onChange={(e) => setPercentOff(e.target.value)}
                    min={1}
                    max={100}
                    className="w-full bg-transparent text-white text-sm focus:outline-none text-right"
                  />
                  <span className="text-zinc-400 text-sm shrink-0">% off</span>
                </div>
                <input
                  type="number"
                  placeholder="Max uses"
                  value={maxRedemptions}
                  onChange={(e) => setMaxRedemptions(e.target.value)}
                  min={1}
                  className="w-32 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={codeLoading}
                className="bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold px-5 py-2.5 rounded-lg text-sm transition-colors"
              >
                {codeLoading ? 'Generating...' : 'Generate Code'}
              </button>
            </form>
            {codeError && <p className="text-red-400 text-sm">{codeError}</p>}
            {newCode && (
              <div className="flex items-center gap-3 bg-green-900/30 border border-green-700 rounded-lg px-4 py-3">
                <span className="text-green-400 font-mono font-bold text-lg">{newCode}</span>
                <button
                  onClick={() => copyToClipboard(newCode)}
                  className="text-xs text-green-400 hover:text-green-300 border border-green-700 rounded px-2 py-1"
                >
                  {copied === newCode ? 'Copied!' : 'Copy'}
                </button>
                <span className="text-green-500 text-sm">New code created</span>
              </div>
            )}
          </div>

          {/* Codes list */}
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-800">
              <span className="text-white text-sm font-bold">Promo Codes ({codes.filter(c => c.active).length} active)</span>
            </div>
            {codes.length === 0 ? (
              <p className="text-zinc-400 text-sm p-6">No promo codes yet.</p>
            ) : (
              <div className="divide-y divide-zinc-800/50">
                {codes.map((c) => (
                  <div key={c.id} className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-4">
                      <span className={`font-mono font-bold text-sm ${c.active ? 'text-white' : 'text-zinc-600 line-through'}`}>
                        {c.code}
                      </span>
                      {c.active && (
                        <button
                          onClick={() => copyToClipboard(c.code)}
                          className="text-xs text-zinc-400 hover:text-white border border-zinc-700 rounded px-2 py-0.5"
                        >
                          {copied === c.code ? 'Copied!' : 'Copy'}
                        </button>
                      )}
                      <span className="text-zinc-500 text-xs">
                        {c.times_redeemed} used
                        {c.max_redemptions ? ` / ${c.max_redemptions} max` : ''}
                      </span>
                      {c.percent_off != null && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-green-900/40 text-green-400">{c.percent_off}% off</span>
                      )}
                    </div>
                    {c.active && (
                      <button
                        onClick={() => handleDeactivateCode(c.id, c.code)}
                        className="text-xs text-red-400 hover:text-red-300 transition-colors"
                      >
                        Deactivate
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

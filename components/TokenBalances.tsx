interface PlayerBalance {
  id: string
  label: string
  tokens: number
}

interface Props {
  /** Players and their individual analysis-token balances. */
  players: PlayerBalance[]
  /** Shared coach upload credits for the team. */
  coachCredits: number
  /** Unassigned tokens in the team pool. */
  tokenPool: number
}

// At-a-glance view of every token balance on a team.
export default function TokenBalances({ players, coachCredits, tokenPool }: Props) {
  const totalPlayerTokens = players.reduce((sum, p) => sum + p.tokens, 0)

  return (
    <div className="border border-gray-200 rounded-2xl p-5 space-y-3">
      <p className="font-black text-black">Token balances</p>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">
          <p className="text-xs text-gray-500">Team pool (unassigned)</p>
          <p className="text-2xl font-black text-black">{tokenPool}</p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">
          <p className="text-xs text-gray-500">Coach upload credits</p>
          <p className="text-2xl font-black text-black">{coachCredits}</p>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Players ({players.length}) — {totalPlayerTokens} token{totalPlayerTokens !== 1 ? 's' : ''} total
        </p>
        {players.length === 0 ? (
          <p className="text-sm text-gray-400 mt-1">No players have joined yet.</p>
        ) : (
          <div className="mt-1 border border-gray-100 rounded-xl divide-y divide-gray-100">
            {players.map(p => (
              <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-sm font-semibold text-black truncate">{p.label}</span>
                <span className="shrink-0 text-xs font-bold bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                  {p.tokens} token{p.tokens !== 1 ? 's' : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

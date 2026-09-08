import { getHoldByToken } from '@/lib/order-hold'
import { IN_STOCK_SIZES, SIZE_INCHES } from '@/lib/ball-inventory'
import ResolveClient from './ResolveClient'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Resolve your order | LearnHoops',
  robots: { index: false, follow: false },
}

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: (currency || 'usd').toUpperCase(),
  }).format((cents || 0) / 100)
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-ink-950 text-chalk flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg bg-ink-900/60 border border-courtline rounded-3xl p-6 sm:p-8">
        {children}
      </div>
    </main>
  )
}

export default async function ResolveOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ choice?: string }>
}) {
  const { token } = await params
  const { choice } = await searchParams
  const lookup = await getHoldByToken(token)

  if (lookup.state === 'invalid') {
    return (
      <Shell>
        <h1 className="font-display font-black uppercase text-2xl leading-tight">This link isn&apos;t valid</h1>
        <p className="text-chalk-dim text-sm mt-3 leading-relaxed">
          We couldn&apos;t find an order for this link. If you think this is a mistake, reply to the email we sent you
          and we&apos;ll help.
        </p>
      </Shell>
    )
  }

  if (lookup.state === 'resolved' || lookup.state === 'expired') {
    return (
      <Shell>
        <h1 className="font-display font-black uppercase text-2xl leading-tight">This order&apos;s already been sorted</h1>
        <p className="text-chalk-dim text-sm mt-3 leading-relaxed">
          Check your email for the confirmation. Need something else? Reply to that email and we&apos;ll help.
        </p>
      </Shell>
    )
  }

  const first = lookup.rows[0]
  const heldSizes = [...new Set(lookup.rows.map((r) => r.size))]
  const heldLabel = heldSizes.map((s) => SIZE_INCHES[s]).join(' & ')
  const amount = money(first.amount_total, first.currency)
  const options = IN_STOCK_SIZES.map((s) => ({ value: s, label: SIZE_INCHES[s] }))
  const initialChoice = choice === 'refund' || choice === 'swap' ? choice : null

  return (
    <Shell>
      <h1 className="font-display font-black uppercase text-2xl sm:text-3xl leading-[0.95]">
        Let&apos;s fix your ball order
      </h1>
      <p className="text-chalk-dim text-sm mt-3 leading-relaxed">
        Your {heldLabel} is out of stock and we don&apos;t have a restock date yet. Choose how you want to handle it —
        either way, the free shot analyses on your account aren&apos;t affected.
      </p>
      <ResolveClient
        token={token}
        amount={amount}
        options={options}
        initialChoice={initialChoice}
      />
    </Shell>
  )
}

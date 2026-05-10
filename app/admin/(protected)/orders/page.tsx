import { db } from '@/lib/db'

export default async function OrdersPage() {
  const orders = await db`
    SELECT id, stripe_session_id, email, customer_name, phone, variant, size,
           amount_total, currency,
           shipping_name, shipping_line1, shipping_line2, shipping_city,
           shipping_state, shipping_postal_code, shipping_country,
           status, created_at
    FROM orders
    ORDER BY created_at DESC
    LIMIT 200
  `

  const sizeInches: Record<string, string> = { '5': '27.5"', '6': '28.5"', '7': '29.5"' }

  const totalRevenue = orders.reduce((sum, o) => sum + Number(o.amount_total ?? 0), 0)
  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-white">Orders</h1>
        <div className="flex gap-4 text-sm text-white">
          <span><span className="text-orange-500 font-bold">{orders.length}</span> orders</span>
          <span><span className="text-orange-500 font-bold">{fmt(totalRevenue)}</span> revenue</span>
        </div>
      </div>

      <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-white text-xs">
              <th className="text-left px-5 py-3">Customer</th>
              <th className="text-left px-5 py-3">Variant</th>
              <th className="text-left px-5 py-3">Size</th>
              <th className="text-left px-5 py-3">Amount</th>
              <th className="text-left px-5 py-3">Shipping</th>
              <th className="text-left px-5 py-3">Status</th>
              <th className="text-left px-5 py-3">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-6 text-white">No orders yet.</td>
              </tr>
            ) : (
              orders.map((o) => (
                <tr key={String(o.id)} className="hover:bg-zinc-800/30 transition-colors align-top">
                  <td className="px-5 py-3 text-white">
                    <div className="font-medium">{o.customer_name || '—'}</div>
                    <div className="text-white text-xs">{o.email}</div>
                    {o.phone && <div className="text-white text-xs">{o.phone}</div>}
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-500">
                      {o.variant === 'left' ? 'Left-handed' : 'Right-handed'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-white text-xs">
                    {o.size ? <>Size {o.size} <span className="text-white">({sizeInches[String(o.size)] ?? '—'})</span></> : '—'}
                  </td>
                  <td className="px-5 py-3 text-orange-500 font-bold">
                    {fmt(Number(o.amount_total))}
                  </td>
                  <td className="px-5 py-3 text-white text-xs leading-relaxed">
                    {o.shipping_name && <div>{o.shipping_name}</div>}
                    {o.shipping_line1 && <div>{o.shipping_line1}</div>}
                    {o.shipping_line2 && <div>{o.shipping_line2}</div>}
                    {(o.shipping_city || o.shipping_state) && (
                      <div>{[o.shipping_city, o.shipping_state, o.shipping_postal_code].filter(Boolean).join(', ')}</div>
                    )}
                    {o.shipping_country && <div>{o.shipping_country}</div>}
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-500">
                      {o.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-white text-xs">
                    {new Date(o.created_at).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

import { db } from '@/lib/db'
import OrdersClient from './OrdersClient'

export default async function OrdersPage() {
  const orders = await db`
    SELECT id, stripe_session_id, email, customer_name, phone, variant, size,
           amount_total, currency,
           shipping_name, shipping_line1, shipping_line2, shipping_city,
           shipping_state, shipping_postal_code, shipping_country,
           shipping_cost_cents, shipping_carrier, shipping_service,
           status, shipping_link, created_at,
           COALESCE(kind, 'single') AS kind,
           COALESCE(quantity, 1)::int AS quantity,
           class_package_id,
           description, buyer_kind, buyer_ref
    FROM orders
    ORDER BY created_at DESC
    LIMIT 200
  ` as unknown as Parameters<typeof OrdersClient>[0]['orders']

  // amount_total already includes shipping; the shipping stat breaks out how
  // much of the revenue is pass-through carrier cost.
  const totalRevenue = orders.reduce((sum, o) => sum + Number(o.amount_total ?? 0), 0)
  const totalShipping = orders.reduce((sum, o) => sum + Number(o.shipping_cost_cents ?? 0), 0)
  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`
  const shipped = orders.filter(o => o.status === 'shipped').length
  const pending = orders.filter(o => (o.variant === 'left' || o.variant === 'right') && o.status !== 'shipped').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-black text-black dark:text-white">Orders</h1>
        <div className="flex gap-4 text-sm text-gray-600 dark:text-zinc-400">
          <span><span className="text-orange-500 font-bold">{orders.length}</span> total</span>
          <span><span className="text-yellow-400 font-bold">{pending}</span> pending ship</span>
          <span><span className="text-green-400 font-bold">{shipped}</span> shipped</span>
          <span><span className="text-orange-500 font-bold">{fmt(totalRevenue)}</span> revenue</span>
          <span><span className="text-blue-400 font-bold">{fmt(totalShipping)}</span> shipping collected</span>
        </div>
      </div>

      <OrdersClient orders={orders} />
    </div>
  )
}

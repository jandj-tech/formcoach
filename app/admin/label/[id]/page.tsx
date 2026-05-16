import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { db } from '@/lib/db'

interface Order {
  id: string
  customer_name: string | null
  email: string
  phone: string | null
  variant: string | null
  size: string | null
  shipping_name: string | null
  shipping_line1: string | null
  shipping_line2: string | null
  shipping_city: string | null
  shipping_state: string | null
  shipping_postal_code: string | null
  shipping_country: string | null
  created_at: string
}

export const metadata: Metadata = { title: 'Shipping Label' }

const sizeLabel: Record<string, string> = { '5': '27.5"', '6': '28.5"', '7': '29.5"' }

function getFrom() {
  return {
    name: process.env.SHIP_FROM_NAME || 'LearnHoops',
    line1: process.env.SHIP_FROM_LINE1 || '',
    city: process.env.SHIP_FROM_CITY || '',
    state: process.env.SHIP_FROM_STATE || '',
    zip: process.env.SHIP_FROM_ZIP || '',
    country: process.env.SHIP_FROM_COUNTRY || 'US',
  }
}

export default async function LabelPage({ params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies()
  if (cookieStore.get('admin_auth')?.value !== process.env.ADMIN_PASSWORD) {
    redirect('/admin/login')
  }

  const { id } = await params
  const rows = await db`
    SELECT id, customer_name, email, phone, variant, size,
           shipping_name, shipping_line1, shipping_line2, shipping_city,
           shipping_state, shipping_postal_code, shipping_country, created_at
    FROM orders WHERE id = ${id}
  ` as unknown as Order[]

  if (!rows[0]) notFound()
  const o = rows[0]
  const from = getFrom()
  const missingFrom = !from.line1 || !from.city || !from.state || !from.zip

  const toName = o.shipping_name || o.customer_name || 'Unknown Recipient'
  const cityLine = [o.shipping_city, o.shipping_state, o.shipping_postal_code].filter(Boolean).join(', ')
  const ball = o.variant === 'left' ? 'Left-handed' : o.variant === 'right' ? 'Right-handed' : null
  const size = o.size ? `Size ${o.size}${sizeLabel[o.size] ? ` (${sizeLabel[o.size]})` : ''}` : null
  const orderDate = new Date(o.created_at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .label-card { box-shadow: none !important; margin: 0 !important; border: 2px solid #000 !important; }
        }
        .label-card { font-family: Arial, Helvetica, sans-serif; }
      `}</style>

      {/* Print / back bar — hidden on print */}
      <div className="no-print flex items-center gap-4 px-6 py-4 bg-gray-100 border-b border-gray-300">
        <button
          type="button"
          className="bg-black text-white font-bold px-5 py-2 rounded-lg text-sm hover:bg-gray-800"
        >
          Print Label
        </button>
        <a href="/admin/orders" className="text-gray-500 text-sm hover:text-black">← Back to orders</a>
      </div>

      {missingFrom && (
        <div className="no-print mx-auto mt-4 max-w-2xl bg-orange-50 border border-orange-300 rounded-lg px-4 py-3 text-sm text-orange-700">
          Return address incomplete. Set <code className="font-mono bg-orange-100 px-1 rounded">SHIP_FROM_LINE1</code>, <code className="font-mono bg-orange-100 px-1 rounded">SHIP_FROM_CITY</code>, <code className="font-mono bg-orange-100 px-1 rounded">SHIP_FROM_STATE</code>, <code className="font-mono bg-orange-100 px-1 rounded">SHIP_FROM_ZIP</code> in Vercel environment variables.
        </div>
      )}

      {/* Label */}
      <div className="label-card mx-auto my-8 max-w-2xl border-2 border-black" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>

        {/* FROM */}
        <div className="px-7 py-5 border-b-2 border-black">
          <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">From</div>
          <div className="font-bold text-base">{from.name}</div>
          {from.line1 && <div className="text-sm text-gray-700 leading-relaxed">{from.line1}</div>}
          {(from.city || from.state || from.zip) && (
            <div className="text-sm text-gray-700">{[from.city, from.state, from.zip].filter(Boolean).join(', ')}</div>
          )}
          <div className="text-sm text-gray-700">{from.country}</div>
        </div>

        {/* TO — large, postal-style */}
        <div className="px-7 py-7 border-b-2 border-black">
          <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Ship To</div>
          <div className="font-black uppercase leading-tight" style={{ fontSize: '28px', letterSpacing: '0.02em' }}>{toName}</div>
          {o.shipping_line1 && (
            <div className="font-bold uppercase mt-2" style={{ fontSize: '20px' }}>{o.shipping_line1}</div>
          )}
          {o.shipping_line2 && (
            <div className="font-semibold uppercase text-gray-600" style={{ fontSize: '17px' }}>{o.shipping_line2}</div>
          )}
          {cityLine && (
            <div className="font-bold uppercase mt-1" style={{ fontSize: '20px' }}>{cityLine}</div>
          )}
          {o.shipping_country && (
            <div className="font-semibold uppercase text-gray-600 mt-0.5" style={{ fontSize: '16px' }}>{o.shipping_country}</div>
          )}
        </div>

        {/* Order info */}
        <div className="px-7 py-5 border-b border-gray-300">
          <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Contents</div>
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            {ball && (
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wide">Ball</div>
                <div className="font-bold text-sm">{ball} Basketball</div>
              </div>
            )}
            {size && (
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wide">Size</div>
                <div className="font-bold text-sm">{size}</div>
              </div>
            )}
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Order Date</div>
              <div className="font-bold text-sm">{orderDate}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Order ID</div>
              <div className="font-mono text-xs font-bold mt-0.5">{o.id}</div>
            </div>
          </div>
        </div>

        {/* Contact */}
        <div className="px-7 py-4 bg-gray-50">
          <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm text-gray-600">
            <span><span className="font-semibold text-gray-800">Email:</span> {o.email}</span>
            {o.phone && <span><span className="font-semibold text-gray-800">Phone:</span> {o.phone}</span>}
          </div>
        </div>

      </div>

      {/* Print button is a non-interactive button tag — we need a client-side click */}
      <script dangerouslySetInnerHTML={{ __html: `
        var btn = document.querySelector('button');
        if (btn) btn.addEventListener('click', function() { window.print(); });
      `}} />
    </>
  )
}

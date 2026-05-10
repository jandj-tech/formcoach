import Link from 'next/link'
import TopNav from '@/components/TopNav'
import ClearCart from './ClearCart'

export const metadata = {
  title: 'Order Confirmed — LearnHoops.com',
}

export default function ShopSuccessPage() {
  return (
    <main className="min-h-screen bg-black flex flex-col">
      <ClearCart />
      <TopNav />
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center space-y-4 max-w-md">
          <div className="text-6xl">🏀</div>
          <h1 className="text-3xl font-black text-white">Order confirmed!</h1>
          <p className="text-white">
            Thanks for ordering The LearnHoops.com Training Ball. We&apos;ll email you a receipt and let you know
            when your order ships.
          </p>
          <Link
            href="/"
            className="inline-block mt-4 bg-orange-500 hover:bg-red-600 text-white font-bold px-8 py-3 rounded-xl text-sm transition-colors"
          >
            Back home
          </Link>
        </div>
      </div>
    </main>
  )
}

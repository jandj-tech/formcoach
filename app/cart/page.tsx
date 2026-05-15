import TopNav from '@/components/TopNav'
import CartView from './CartView'

export const metadata = {
  title: 'Cart — LearnHoops.com',
  description: 'Review your cart and checkout securely.',
}

export default async function CartPage() {
  return (
    <main className="flex flex-col min-h-screen bg-black">
      <TopNav />
      <CartView />
      <footer className="py-5 border-t border-zinc-900 text-center text-white text-xs">
        © {new Date().getFullYear()} LearnHoops.com. All rights reserved.
      </footer>
    </main>
  )
}

import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import CartView from './CartView'

export const metadata = {
  title: 'Cart — LearnHoops.com',
  description: 'Review your cart and checkout securely.',
}

export default async function CartPage() {
  return (
    <main className="flex flex-col min-h-screen bg-ink-950 text-chalk">
      <TopNav />
      <CartView />
      <SiteFooter />
    </main>
  )
}

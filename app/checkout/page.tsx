import { Suspense } from 'react'
import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import CheckoutClient from './CheckoutClient'

export const metadata = {
  title: 'Checkout — LearnHoops.com',
  description: 'Secure checkout with live shipping rates.',
}

export default async function CheckoutPage() {
  return (
    <main className="flex flex-col min-h-screen bg-ink-950 text-chalk">
      <TopNav />
      <Suspense fallback={<section className="flex-1 px-4 py-10"><p className="text-white max-w-3xl mx-auto">Loading checkout…</p></section>}>
        <CheckoutClient />
      </Suspense>
      <SiteFooter />
    </main>
  )
}

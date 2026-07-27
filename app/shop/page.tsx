import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import ShopProduct from './ShopProduct'

export const metadata = {
  title: 'Shop — LearnHoops.com',
  description: 'The LearnHoops Training Ball — built for serious players. Left and right-handed editions.',
}

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ app?: string }> }) {
  const params = await searchParams
  const isInApp = params.app === 'ios'
  return (
    <main className="flex flex-col min-h-screen bg-ink-950 text-chalk">
      <TopNav />

      <ShopProduct isInApp={isInApp} />

      <SiteFooter />
    </main>
  )
}

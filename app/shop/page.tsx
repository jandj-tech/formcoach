import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import ShopProduct from './ShopProduct'
import { isInAppRequest } from '@/lib/in-app'

export const metadata = {
  title: 'Shop — LearnHoops.com',
  description: 'The LearnHoops.com Training Ball — built for serious players. Left and right-handed editions.',
}

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ app?: string }> }) {
  const params = await searchParams
  // The ?app=ios param is lost on in-page navigation, so also check the
  // app WebView's User-Agent marker.
  const isInApp = params.app === 'ios' || (await isInAppRequest())
  return (
    <main className="flex flex-col min-h-screen bg-ink-950 text-chalk">
      <TopNav />

      <ShopProduct isInApp={isInApp} />

      <SiteFooter />
    </main>
  )
}

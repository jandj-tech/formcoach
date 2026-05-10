import TopNav from '@/components/TopNav'
import ShopProduct from './ShopProduct'
import { getUsdToCadRate } from '@/lib/fx'

export const metadata = {
  title: 'Shop — LearnHoops.com',
  description: 'The LearnHoops.com Training Ball — built for serious players. Left and right-handed editions.',
}

export default async function ShopPage() {
  const usdToCad = await getUsdToCadRate()

  return (
    <main className="flex flex-col min-h-screen bg-black">
      <TopNav />

      <ShopProduct usdToCad={usdToCad} />

      <footer className="py-5 border-t border-zinc-900 text-center text-white text-xs">
        © {new Date().getFullYear()} LearnHoops.com. All rights reserved.
      </footer>
    </main>
  )
}

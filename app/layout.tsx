import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { ViewTransition } from 'react'
import './globals.css'
import { CartProvider } from '@/lib/cart'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  metadataBase: new URL('https://www.learnhoops.com'),
  title: 'LearnHoops.com',
  description:
    'AI basketball shot analysis. Upload a video, get a private breakdown across 17 form criteria in minutes — find what is holding your shot back.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'LearnHoops.com',
    description: 'AI basketball shot analysis. Upload a video, get scored across 17 form criteria.',
    siteName: 'LearnHoops.com',
    url: 'https://www.learnhoops.com',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  verification: {
    google: [
      'Iok757H3x4dbsU-C1vIkVgSCcTwArojeOPpUoL9fBGo',
      'C8bH1Na1x-sQwjH6YK29dhGv7vdv1kF5rLy3ENh1cAs',
    ],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-white text-black flex flex-col">
        <CartProvider>
          <ViewTransition default="page-fade">{children}</ViewTransition>
        </CartProvider>
      </body>
    </html>
  )
}

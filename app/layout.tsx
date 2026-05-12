import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { ViewTransition } from 'react'
import './globals.css'
import { CartProvider } from '@/lib/cart'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'LearnHoops.com',
  description:
    'Upload a video of your basketball shot and get an AI-powered breakdown of your form, scored across 10 key criteria.',
  openGraph: {
    title: 'LearnHoops.com',
    description: 'Your shot. Perfected by AI.',
    siteName: 'LearnHoops.com',
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

import Image from 'next/image'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const auth = cookieStore.get('admin_auth')?.value

  if (auth !== process.env.ADMIN_PASSWORD) {
    redirect('/admin/login')
  }

  return (
    <div className="min-h-screen bg-black">
      <nav className="bg-zinc-950 border-b border-zinc-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <Image src="/learnhoops-logo.png" alt="LearnHoops" width={578} height={113} style={{ height: '32px', width: 'auto' }} priority />
            <span className="text-orange-500 font-black text-sm uppercase tracking-wider">Admin</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <a href="/admin" className="text-zinc-300 hover:text-white transition-colors">Dashboard</a>
            <a href="/admin/submissions" className="text-zinc-300 hover:text-white transition-colors">Submissions</a>
            <a href="/admin/criteria" className="text-zinc-300 hover:text-white transition-colors">Criteria</a>
            <a href="/admin/learn" className="text-zinc-300 hover:text-white transition-colors">Learn Mode</a>
            <a href="/admin/emails" className="text-zinc-300 hover:text-white transition-colors">Emails</a>
          </div>
        </div>
        <a href="/" className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors">← Back to site</a>
      </nav>
      <div className="max-w-5xl mx-auto px-6 py-8">{children}</div>
    </div>
  )
}

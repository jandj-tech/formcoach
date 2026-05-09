import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const auth = cookieStore.get('admin_auth')?.value

  if (auth !== process.env.ADMIN_PASSWORD) {
    redirect('/admin/login')
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <nav className="bg-slate-800 border-b border-slate-700 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="text-orange-500 font-black text-lg">FormCoach Admin</span>
          <div className="flex items-center gap-4 text-sm">
            <a href="/admin" className="text-slate-300 hover:text-white transition-colors">Dashboard</a>
            <a href="/admin/submissions" className="text-slate-300 hover:text-white transition-colors">Submissions</a>
            <a href="/admin/criteria" className="text-slate-300 hover:text-white transition-colors">Criteria</a>
            <a href="/admin/learn" className="text-slate-300 hover:text-white transition-colors">Learn Mode</a>
            <a href="/admin/emails" className="text-slate-300 hover:text-white transition-colors">Emails</a>
          </div>
        </div>
        <a href="/" className="text-slate-500 hover:text-slate-300 text-sm transition-colors">← Back to site</a>
      </nav>
      <div className="max-w-5xl mx-auto px-6 py-8">{children}</div>
    </div>
  )
}

import { redirect } from 'next/navigation'
import AdminNav from './AdminNav'
import { isAdminSession } from '@/lib/admin-auth'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdminSession())) {
    redirect('/admin/login')
  }

  return (
    <div className="min-h-screen bg-black">
      <AdminNav />
      <div className="max-w-5xl mx-auto px-6 py-8">{children}</div>
    </div>
  )
}

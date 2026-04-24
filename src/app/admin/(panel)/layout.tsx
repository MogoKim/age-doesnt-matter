import { redirect } from 'next/navigation'
import { getAdminSession } from '@/lib/admin-auth'
import AdminSidebar from '@/components/admin/AdminSidebar'
import AdminHeader from '@/components/admin/AdminHeader'

export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getAdminSession()
  if (!session) redirect('/admin/login')

  return (
    <div className="min-h-dvh bg-zinc-50">
      <AdminSidebar nickname={session.nickname} />

      <div className="lg:pl-60">
        <AdminHeader />
        <main className="p-6">{children}</main>
      </div>
    </div>
  )
}
